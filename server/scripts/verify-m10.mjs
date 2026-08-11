// verify-m10.mjs
// E2E verification for M10 — Subscription & Stripe Billing.
// Requires the server running at http://localhost:4000.
// Usage: node scripts/verify-m10.mjs [BASE_URL]
//
// Covers:
//   - subscriptionInfo reports plan/limits/usage (FREE defaults)
//   - plan limits: patients cap (FREE 50), appointments/day cap (FREE 20),
//     feature gates (prescriptions/invoices require PRO+)
//   - createCheckoutSession: devMode fallback when Stripe unconfigured,
//     INVALID_PLAN for FREE, authZ (UNAUTHORIZED / FORBIDDEN)
//   - simulated Stripe webhooks via processStripeEvent:
//     checkout.session.completed -> plan PRO; idempotent replay;
//     customer.subscription.updated (status sync, unknown sub ignored);
//     customer.subscription.deleted -> FREE + canceled
//   - limits re-enforced after downgrade to FREE
//   - malformed event rejected; unknown event types recorded but ignored

import "dotenv/config";
import { prisma } from "../src/config/db.js";
import { processStripeEvent } from "../src/services/subscription.service.js";

const BASE = process.argv[2] ?? "http://localhost:4000";
const API = `${BASE}/graphql`;

let passed = 0;
let failed = 0;

function check(name, cond, extra = "") {
  if (cond) {
    passed++;
    console.log(`  \u2713 ${name}`);
  } else {
    failed++;
    console.error(`  \u2717 ${name}${extra ? ` \u2014 ${extra}` : ""}`);
  }
}

class GqlError extends Error {
  constructor(message, code, data) {
    super(message);
    this.code = code;
    this.data = data;
  }
}

async function gql(query, variables, token) {
  const res = await fetch(API, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (body.errors) {
    const first = body.errors[0];
    throw new GqlError(first.message, first.extensions?.code ?? "GRAPHQL_ERROR", body.data);
  }
  return body.data;
}

const M = {
  signup: `mutation($input: SignupInput!) { signup(input: $input) { accessToken refreshToken user { id role clinicId } } }`,
  createClinic: `mutation($input: CreateClinicInput!) {
    createClinic(input: $input) { accessToken refreshToken clinic { id } user { id role clinicId } }
  }`,
  invite: `mutation($input: InviteInput!) { inviteStaff(input: $input) { inviteToken } }`,
  acceptInvite: `mutation($input: AcceptInviteInput!) {
    acceptInvite(input: $input) { accessToken refreshToken user { id role clinicId } }
  }`,
  createPatient: `mutation($input: CreatePatientInput!) { createPatient(input: $input) { id name } }`,
  createRx: `mutation($input: CreatePrescriptionInput!) { createPrescription(input: $input) { id status } }`,
  createInvoice: `mutation($input: CreateInvoiceInput!) { createInvoice(input: $input) { id status } }`,
  book: `mutation($input: BookAppointmentInput!) { bookAppointment(input: $input) { id status startTime } }`,
  subInfo: `query { subscriptionInfo {
    plan subscriptionStatus
    limits { patients appointmentsPerDay features { prescriptions invoices } }
    usage { patients appointmentsToday }
  } }`,
  checkout: `mutation($plan: Plan!) { createCheckoutSession(plan: $plan) { url devMode } }`,
};

function nextSlotStart(now = new Date()) {
  const minutes = 30 * 60000;
  return new Date(Math.ceil((now.getTime() + 75 * 60000) / minutes) * minutes);
}

async function main() {
  const suffix = Date.now().toString(36);
  const password = "m10-verify-pass";

  // --- 1. Onboard clinic A (defaults to FREE) ---
  let res = await gql(M.signup, { input: { name: "M10 Admin", email: `m10-a-${suffix}@test.dev`, password } });
  res = await gql(M.createClinic, { input: { name: "M10 Clinic A", subdomain: `m10a${suffix}` } }, res.signup.accessToken);
  const tokenA = res.createClinic.accessToken;
  const clinicA = res.createClinic.clinic.id;
  check("clinic A onboarded on FREE", !!clinicA);

  res = await gql(M.subInfo, {}, tokenA);
  const free0 = res.subscriptionInfo;
  check("subscriptionInfo -> FREE", free0.plan === "FREE", `got ${free0.plan}`);
  check("FREE patient limit is 50", free0.limits.patients === 50);
  check("FREE appointment/day limit is 20", free0.limits.appointmentsPerDay === 20);
  check("FREE blocks prescriptions/invoices", !free0.limits.features.prescriptions && !free0.limits.features.invoices);
  check("usage starts at 0/0", free0.usage.patients === 0 && free0.usage.appointmentsToday === 0);

  // --- 2. FREE patient cap (50) ---
  res = await gql(M.createPatient, { input: { name: "M10 Patient A", phone: "555-0100" } }, tokenA);
  const patientA = res.createPatient.id;
  check("patient A created", !!patientA);

  await prisma.patient.createMany({
    data: Array.from({ length: 49 }, (_, i) => ({ clinicId: clinicA, name: `Seed Patient ${i}` })),
  });

  let capPatient = false;
  try {
    await gql(M.createPatient, { input: { name: "Over Cap" } }, tokenA);
  } catch (err) {
    capPatient = err.code === "PLAN_LIMIT_EXCEEDED";
  }
  check("50th+ patient blocked (PLAN_LIMIT_EXCEEDED)", capPatient);

  // --- 3. FREE appointments/day cap (20) ---
  const docUser = await prisma.user.create({
    data: { clinicId: clinicA, role: "DOCTOR", name: "M10 Doctor", email: `m10-doc-${suffix}@test.dev` },
  });
  const doctor = await prisma.doctor.create({ data: { userId: docUser.id } });
  await prisma.doctorAvailability.create({
    data: { clinicId: clinicA, doctorId: doctor.id, dayOfWeek: new Date().getUTCDay(), startTime: "00:00", endTime: "23:59", slotDuration: 30 },
  });

  const now = new Date();
  const dayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  await prisma.appointment.createMany({
    data: Array.from({ length: 20 }, (_, i) => ({
      clinicId: clinicA,
      doctorId: doctor.id,
      patientId: patientA,
      startTime: new Date(dayStart + i * 30 * 60000),
      endTime: new Date(dayStart + (i + 1) * 30 * 60000),
    })),
  });

  const futureSlot = nextSlotStart();
  let capAppt = false;
  try {
    await gql(M.book, { input: { patientId: patientA, doctorId: doctor.id, startTime: futureSlot.toISOString() } }, tokenA);
  } catch (err) {
    capAppt = err.code === "PLAN_LIMIT_EXCEEDED";
  }
  check("21st appointment today blocked (PLAN_LIMIT_EXCEEDED)", capAppt);

  // --- 4. FREE feature gates ---
  let gateRx = false;
  try {
    await gql(M.createRx, { input: { patientId: patientA, doctorId: doctor.id, items: [] } }, tokenA);
  } catch (err) {
    gateRx = err.code === "PLAN_LIMIT_EXCEEDED";
  }
  check("createPrescription blocked on FREE", gateRx);

  let gateInv = false;
  try {
    await gql(M.createInvoice, { input: { patientId: patientA, items: [] } }, tokenA);
  } catch (err) {
    gateInv = err.code === "PLAN_LIMIT_EXCEEDED";
  }
  check("createInvoice blocked on FREE", gateInv);

  // --- 5. Checkout session (Stripe unconfigured -> devMode) ---
  let devCheckout = false;
  try {
    const c = await gql(M.checkout, { plan: "PRO" }, tokenA);
    devCheckout = c.createCheckoutSession.devMode === true && c.createCheckoutSession.url === null;
  } catch (err) {
    check("checkout devMode unexpectedly threw", false, err.message);
  }
  check("createCheckoutSession devMode when Stripe unconfigured", devCheckout);

  let invalidPlan = false;
  try {
    await gql(M.checkout, { plan: "FREE" }, tokenA);
  } catch (err) {
    invalidPlan = err.code === "INVALID_PLAN";
  }
  check("checkout for FREE plan rejected (INVALID_PLAN)", invalidPlan);

  // --- 6. Simulated webhook: checkout.session.completed -> PRO ---
  const checkoutEvent = {
    id: `evt_checkout_${suffix}`,
    type: "checkout.session.completed",
    data: {
      object: {
        mode: "subscription",
        customer: `cus_m10_${suffix}`,
        subscription: `sub_m10_${suffix}`,
        metadata: { clinicId: clinicA, plan: "PRO" },
      },
    },
  };
  const r1 = await processStripeEvent(checkoutEvent);
  check("checkout.session.completed processed", r1.processed && !r1.idempotent);

  res = await gql(M.subInfo, {}, tokenA);
  const pro = res.subscriptionInfo;
  check("upgrade -> plan PRO", pro.plan === "PRO", `got ${pro.plan}`);
  check("upgrade -> subscriptionStatus active", pro.subscriptionStatus === "active");
  check("PRO patient limit is 500", pro.limits.patients === 500);
  check("PRO appointment/day limit is 100", pro.limits.appointmentsPerDay === 100);
  check("PRO unlocks prescriptions/invoices", pro.limits.features.prescriptions && pro.limits.features.invoices);

  // --- 7. Idempotent replay ---
  const r2 = await processStripeEvent(checkoutEvent);
  check("duplicate event is idempotent", r2.idempotent && !r2.processed);
  const eventRows = await prisma.webhookEvent.count({ where: { eventId: checkoutEvent.id } });
  check("exactly one WebhookEvent row for the event", eventRows === 1, `got ${eventRows}`);

  // --- 8. Limits lifted on PRO ---
  res = await gql(M.createPatient, { input: { name: "Post-Upgrade Patient" } }, tokenA);
  check("patient create succeeds on PRO", !!res.createPatient.id);

  res = await gql(
    M.createRx,
    { input: { patientId: patientA, doctorId: doctor.id, items: [{ drugName: "Aspirin", dosage: "100mg", quantity: 30 }] } },
    tokenA,
  );
  check("createPrescription succeeds on PRO", res.createPrescription.status === "DRAFT");

  res = await gql(
    M.createInvoice,
    { input: { patientId: patientA, items: [{ description: "Consult", qty: 1, unitPrice: 100 }] } },
    tokenA,
  );
  check("createInvoice succeeds on PRO", !!res.createInvoice.id);

  await prisma.appointment.deleteMany({ where: { clinicId: clinicA } });
  res = await gql(M.book, { input: { patientId: patientA, doctorId: doctor.id, startTime: futureSlot.toISOString() } }, tokenA);
  check("bookAppointment succeeds on PRO", res.bookAppointment.status === "PENDING", `got ${res.bookAppointment.status}`);

  res = await gql(M.subInfo, {}, tokenA);
  check("usage reflects the extra patient", res.subscriptionInfo.usage.patients === 51, `got ${res.subscriptionInfo.usage.patients}`);
  check("usage reflects 1 appointment today", res.subscriptionInfo.usage.appointmentsToday === 1, `got ${res.subscriptionInfo.usage.appointmentsToday}`);

  // --- 9. subscription.updated status sync ---
  const updEvent = {
    id: `evt_upd_${suffix}`,
    type: "customer.subscription.updated",
    data: { object: { id: `sub_m10_${suffix}`, status: "past_due" } },
  };
  await processStripeEvent(updEvent);
  res = await gql(M.subInfo, {}, tokenA);
  check("subscription.updated -> past_due", res.subscriptionInfo.subscriptionStatus === "past_due", `got ${res.subscriptionInfo.subscriptionStatus}`);
  check("plan unchanged by updated event", res.subscriptionInfo.plan === "PRO");

  const updUnknown = await processStripeEvent({
    id: `evt_upd_unknown_${suffix}`,
    type: "customer.subscription.updated",
    data: { object: { id: "sub_nope", status: "active" } },
  });
  check("updated for unknown subscription ignored safely", updUnknown.processed);

  // --- 10. subscription.deleted -> FREE + canceled ---
  const delEvent = {
    id: `evt_del_${suffix}`,
    type: "customer.subscription.deleted",
    data: { object: { id: `sub_m10_${suffix}` } },
  };
  const r3 = await processStripeEvent(delEvent);
  check("subscription.deleted processed", r3.processed);
  res = await gql(M.subInfo, {}, tokenA);
  check("downgrade -> plan FREE", res.subscriptionInfo.plan === "FREE", `got ${res.subscriptionInfo.plan}`);
  check("downgrade -> status canceled", res.subscriptionInfo.subscriptionStatus === "canceled");

  // --- 11. Limits re-enforced after downgrade ---
  let regateRx = false;
  try {
    await gql(M.createRx, { input: { patientId: patientA, doctorId: doctor.id, items: [{ drugName: "Ibuprofen" }] } }, tokenA);
  } catch (err) {
    regateRx = err.code === "PLAN_LIMIT_EXCEEDED";
  }
  check("prescriptions blocked again after downgrade", regateRx);

  // --- 12. Unknown event type is recorded but ignored ---
  const unknownType = await processStripeEvent({
    id: `evt_unknown_${suffix}`,
    type: "invoice.payment_succeeded",
    data: { object: {} },
  });
  check("unknown event type processed (ignored)", unknownType.processed);

  // --- 13. Malformed events rejected ---
  let malformed = false;
  try {
    await processStripeEvent({ type: "checkout.session.completed" });
  } catch (err) {
    malformed = err.code === "INVALID_WEBHOOK";
  }
  check("malformed event rejected (INVALID_WEBHOOK)", malformed);

  // --- 14. AuthZ ---
  let anonInfo = false;
  try {
    await gql(M.subInfo, {});
  } catch (err) {
    anonInfo = err.code === "UNAUTHORIZED";
  }
  check("unauthenticated subscriptionInfo -> UNAUTHORIZED", anonInfo);

  let anonCheckout = false;
  try {
    await gql(M.checkout, { plan: "PRO" });
  } catch (err) {
    anonCheckout = err.code === "UNAUTHORIZED";
  }
  check("unauthenticated createCheckoutSession -> UNAUTHORIZED", anonCheckout);

  res = await gql(
    M.invite,
    { input: { name: "M10 Doctor", email: `m10-doc2-${suffix}@test.dev`, role: "DOCTOR" } },
    tokenA,
  );
  const doctorToken = (
    await gql(M.acceptInvite, { input: { inviteToken: res.inviteStaff.inviteToken, password } })
  ).acceptInvite.accessToken;
  check("doctor invited + activated", !!doctorToken);

  let doctorCheckout = false;
  try {
    await gql(M.checkout, { plan: "PRO" }, doctorToken);
  } catch (err) {
    doctorCheckout = err.code === "FORBIDDEN";
  }
  check("doctor createCheckoutSession -> FORBIDDEN", doctorCheckout);

  res = await gql(M.subInfo, {}, doctorToken);
  check("STAFF can read subscriptionInfo", !!res.subscriptionInfo && res.subscriptionInfo.plan === "FREE");

  console.log(`\nM10 verify: ${passed} passed, ${failed} failed\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("\nM10 verify crashed:", err.message);
  process.exit(1);
});
