import Stripe from "stripe";
import { prisma } from "../config/db.js";
import { AppError, notFound } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { zonedDayBounds, zonedTodayStr } from "../utils/timezone.js";
import { getClinicTimezone } from "./clinic.service.js";

export const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null;

export const PLAN_LIMIT_EXCEEDED = "PLAN_LIMIT_EXCEEDED";

export function planLimitExceeded(feature, current, limit, plan) {
  const countBased = feature === "patients" || feature === "appointments";
  const message = countBased
    ? `${feature === "patients" ? "Patient" : "Appointment"} limit reached: ${current}/${limit} on the ${plan} plan. Upgrade to add more.`
    : `The ${feature} feature requires a PRO or higher plan. Current plan: ${plan}.`;
  return new AppError(message, PLAN_LIMIT_EXCEEDED, 402);
}

export const PLANS = {
  FREE: {
    label: "Free",
    maxPatients: 50,
    maxAppointmentsPerDay: 20,
    features: { prescriptions: false, invoices: false },
  },
  PRO: {
    label: "Pro",
    maxPatients: 500,
    maxAppointmentsPerDay: 100,
    features: { prescriptions: true, invoices: true },
  },
  ENTERPRISE: {
    label: "Enterprise",
    maxPatients: Infinity,
    maxAppointmentsPerDay: Infinity,
    features: { prescriptions: true, invoices: true },
  },
};

export function getPlanConfig(plan) {
  return PLANS[plan] ?? PLANS.FREE;
}

export async function getClinicPlan(clinicId) {
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { plan: true },
  });
  return clinic?.plan ?? "FREE";
}

/**
 * Enforces the clinic's plan limits. Called from existing services:
 *   - "patients"        -> count cap (Free 50 / Pro 500 / Enterprise unlimited)
 *   - "appointments"    -> per-clinic-day cap (Free 20 / Pro 100 / Enterprise unlimited)
 *   - "prescriptions"   -> feature flag (Pro+)
 *   - "invoices"        -> feature flag (Pro+)
 */
export async function assertPlanLimit(ctx, feature) {
  if (!ctx?.clinicId) return;
  const plan = await getClinicPlan(ctx.clinicId);
  const config = getPlanConfig(plan);

  if (feature === "patients") {
    const count = await prisma.patient.count({
      where: { clinicId: ctx.clinicId, deletedAt: null },
    });
    if (count >= config.maxPatients) {
      throw planLimitExceeded("patients", count, config.maxPatients, plan);
    }
    return;
  }

  if (feature === "appointments") {
    const timeZone = await getClinicTimezone(ctx.clinicId);
    const bounds = zonedDayBounds(zonedTodayStr(timeZone), timeZone);
    const count = await prisma.appointment.count({
      where: { clinicId: ctx.clinicId, startTime: { gte: bounds.start, lt: bounds.end } },
    });
    if (count >= config.maxAppointmentsPerDay) {
      throw planLimitExceeded("appointments", count, config.maxAppointmentsPerDay, plan);
    }
    return;
  }

  if (config.features[feature] === false) {
    throw planLimitExceeded(feature, null, 0, plan);
  }
}

export async function subscriptionInfo(ctx) {
  const clinic = await prisma.clinic.findUnique({ where: { id: ctx.clinicId } });
  if (!clinic) {
    throw notFound("Clinic not found");
  }
  const config = getPlanConfig(clinic.plan);
  const timeZone = await getClinicTimezone(ctx.clinicId);
  const bounds = zonedDayBounds(zonedTodayStr(timeZone), timeZone);

  const [patients, appointmentsToday] = await Promise.all([
    prisma.patient.count({ where: { clinicId: ctx.clinicId, deletedAt: null } }),
    prisma.appointment.count({
      where: { clinicId: ctx.clinicId, startTime: { gte: bounds.start, lt: bounds.end } },
    }),
  ]);

  return {
    plan: clinic.plan,
    subscriptionStatus: clinic.subscriptionStatus,
    limits: {
      patients: config.maxPatients === Infinity ? null : config.maxPatients,
      appointmentsPerDay: config.maxAppointmentsPerDay === Infinity ? null : config.maxAppointmentsPerDay,
      features: config.features,
    },
    usage: { patients, appointmentsToday },
  };
}

const PURCHASABLE = new Set(["PRO", "ENTERPRISE"]);

export async function createCheckoutSession(ctx, plan) {
  if (!PURCHASABLE.has(plan)) {
    throw new AppError("Only PRO and ENTERPRISE plans can be purchased", "INVALID_PLAN", 400);
  }
  if (!stripe) {
    logger.warn("createCheckoutSession called but Stripe is not configured", { clinicId: ctx.clinicId, plan });
    return { url: null, devMode: true };
  }
  const priceId = process.env[`STRIPE_PRICE_${plan}`];
  if (!priceId) {
    logger.warn(`STRIPE_PRICE_${plan} not set`, { clinicId: ctx.clinicId });
    return { url: null, devMode: true };
  }

  const clinic = await prisma.clinic.findUnique({ where: { id: ctx.clinicId } });
  const baseUrl = process.env.WEBAPP_URL ?? "http://localhost:5173";
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { clinicId: ctx.clinicId, plan },
    customer: clinic?.stripeCustomerId ?? undefined,
    success_url: `${baseUrl}/billing?checkout=success`,
    cancel_url: `${baseUrl}/billing?checkout=cancel`,
  });
  logger.info("checkout session created", { clinicId: ctx.clinicId, plan, sessionId: session.id });
  return { url: session.url, devMode: false };
}

function mapStripeStatus(status) {
  switch (status) {
    case "active":
      return "active";
    case "trialing":
      return "trial";
    case "past_due":
      return "past_due";
    case "incomplete":
    case "incomplete_expired":
    case "canceled":
    case "unpaid":
      return "canceled";
    default:
      return status ?? "active";
  }
}

async function clinicIdForSubscription(tx, subscriptionId) {
  if (!subscriptionId) return null;
  const clinic = await tx.clinic.findFirst({
    where: { stripeSubscriptionId: subscriptionId },
    select: { id: true },
  });
  return clinic?.id ?? null;
}

/**
 * Handles a verified Stripe webhook event. Idempotent by event id
 * (WebhookEvent unique row). Returns { processed, idempotent }.
 */
export async function processStripeEvent(event) {
  const eventId = event?.id;
  const type = event?.type;
  const object = event?.data?.object;
  if (!eventId || !type || !object) {
    throw new AppError("Malformed webhook event", "INVALID_WEBHOOK", 400);
  }

  const existing = await prisma.webhookEvent.findUnique({ where: { eventId } });
  if (existing) {
    logger.info("duplicate webhook event ignored", { eventId, type });
    return { processed: false, idempotent: true };
  }

  try {
    await prisma.$transaction(async (tx) => {
      switch (type) {
        case "checkout.session.completed": {
          if (object.mode === "payment") {
            const invoiceId = object.metadata?.invoiceId;
            if (invoiceId) {
              const invoice = await tx.invoice.findUnique({
                where: { id: invoiceId },
                select: { id: true, clinicId: true, status: true },
              });
              if (invoice) {
                await tx.payment.create({
                  data: {
                    clinicId: invoice.clinicId,
                    invoiceId: invoice.id,
                    amount: (object.amount_total ?? 0) / 100,
                    method: "ONLINE",
                    stripePaymentId: typeof object.payment_intent === "string" ? object.payment_intent : null,
                    note: "Online payment via Stripe Checkout",
                  },
                });
                await tx.invoice.update({ where: { id: invoice.id }, data: { status: "PAID" } });
                logger.info("checkout.session.completed -> invoice paid", { eventId, invoiceId });
              }
            }
            break;
          }
          const clinicId = object.metadata?.clinicId;
          if (clinicId) {
            await tx.clinic.update({
              where: { id: clinicId },
              data: {
                plan: object.metadata?.plan ?? "PRO",
                subscriptionStatus: "active",
                stripeCustomerId: typeof object.customer === "string" ? object.customer : null,
                stripeSubscriptionId: typeof object.subscription === "string" ? object.subscription : null,
              },
            });
            logger.info("checkout.session.completed -> plan synced", {
              eventId,
              clinicId,
              plan: object.metadata?.plan ?? "PRO",
            });
          }
          break;
        }
        case "customer.subscription.updated": {
          const clinicId = await clinicIdForSubscription(tx, object.id);
          if (clinicId) {
            await tx.clinic.update({
              where: { id: clinicId },
              data: { subscriptionStatus: mapStripeStatus(object.status) },
            });
            logger.info("customer.subscription.updated -> status synced", { eventId, clinicId, status: object.status });
          }
          break;
        }
        case "customer.subscription.deleted": {
          const clinicId = await clinicIdForSubscription(tx, object.id);
          if (clinicId) {
            await tx.clinic.update({
              where: { id: clinicId },
              data: { plan: "FREE", subscriptionStatus: "canceled" },
            });
            logger.info("customer.subscription.deleted -> downgraded to FREE", { eventId, clinicId });
          }
          break;
        }
        default:
          logger.debug("webhook event type ignored", { eventId, type });
      }
      await tx.webhookEvent.create({ data: { eventId, type } });
    });
    return { processed: true, idempotent: false };
  } catch (err) {
    if (err?.code === "P2002") {
      logger.info("concurrent duplicate webhook event ignored", { eventId });
      return { processed: false, idempotent: true };
    }
    logger.error("webhook processing failed", { eventId, type, error: err.message });
    throw err;
  }
}
