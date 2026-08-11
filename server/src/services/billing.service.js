import { prisma } from "../config/db.js";
import { AppError, notFound } from "../utils/errors.js";
import { validate } from "../utils/validate.js";
import { zonedDayBounds } from "../utils/timezone.js";
import { getClinicTimezone } from "./clinic.service.js";
import { assertPlanLimit } from "./subscription.service.js";
import { notifyClinicAdmins } from "./notification.service.js";
import { logger } from "../utils/logger.js";
import {
  createInvoiceSchema,
  recordPaymentSchema,
  voidInvoiceSchema,
} from "../validators/billing.validator.js";

const INVOICE_WITH_ITEMS = {
  include: {
    items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
    payments: { orderBy: { createdAt: "asc" } },
  },
};

const toCents = (n) => Math.round(Number(n) * 100);
const fromCents = (c) => c / 100;

export async function listInvoices(ctx, { patientId, status, date } = {}) {
  const where = { clinicId: ctx.clinicId };
  if (patientId) where.patientId = patientId;
  if (status) where.status = status;
  if (date) {
    const timeZone = await getClinicTimezone(ctx.clinicId);
    const bounds = zonedDayBounds(date, timeZone);
    where.createdAt = { gte: bounds.start, lt: bounds.end };
  }
  return prisma.invoice.findMany({
    where,
    orderBy: { createdAt: "desc" },
    ...INVOICE_WITH_ITEMS,
  });
}

async function getInvoiceScoped(ctx, id) {
  const invoice = await prisma.invoice.findFirst({
    where: { id, clinicId: ctx.clinicId },
    ...INVOICE_WITH_ITEMS,
  });
  if (!invoice) {
    throw notFound("Invoice not found");
  }
  return invoice;
}

export async function getInvoice(ctx, id) {
  return getInvoiceScoped(ctx, id);
}

function computeTotals(items, taxRate) {
  const subtotalCents = items.reduce((sum, item) => sum + toCents(item.qty * item.unitPrice), 0);
  const taxCents = Math.round((subtotalCents * (taxRate ?? 0)) / 100);
  return {
    subtotal: fromCents(subtotalCents),
    tax: fromCents(taxCents),
    total: fromCents(subtotalCents + taxCents),
  };
}

export async function createInvoice(ctx, input) {
  await assertPlanLimit(ctx, "invoices");
  const data = validate(createInvoiceSchema, input);
  const taxRate = data.taxRate ?? 0;

  const patient = await prisma.patient.findFirst({
    where: { id: data.patientId, clinicId: ctx.clinicId, deletedAt: null },
  });
  if (!patient) {
    throw notFound("Patient not found");
  }

  if (data.appointmentId) {
    const appointment = await prisma.appointment.findFirst({
      where: { id: data.appointmentId, clinicId: ctx.clinicId },
    });
    if (!appointment) {
      throw notFound("Appointment not found");
    }
  }

  const clinic = await prisma.clinic.findUnique({
    where: { id: ctx.clinicId },
    select: { currency: true },
  });
  const currency = clinic?.currency ?? "usd";

  const { subtotal, tax, total } = computeTotals(data.items, taxRate);

  const last = await prisma.invoice.findFirst({
    where: { clinicId: ctx.clinicId },
    orderBy: { invoiceNo: "desc" },
    select: { invoiceNo: true },
  });
  const nextInvoiceNo = (last?.invoiceNo ?? 0) + 1;

  const dueDate = data.dueDate
    ? typeof data.dueDate === "string"
      ? new Date(`${data.dueDate}T00:00:00Z`)
      : data.dueDate
    : null;

  return prisma.$transaction((tx) =>
    tx.invoice.create({
      data: {
        clinicId: ctx.clinicId,
        patientId: data.patientId,
        appointmentId: data.appointmentId ?? null,
        invoiceNo: nextInvoiceNo,
        subtotal,
        tax,
        total,
        currency,
        dueDate,
        items: {
          create: data.items.map((item, index) => ({
            sortOrder: index,
            description: item.description,
            qty: item.qty,
            unitPrice: item.unitPrice,
            amount: fromCents(toCents(item.qty * item.unitPrice)),
          })),
        },
      },
      ...INVOICE_WITH_ITEMS,
    }),
  ).then((invoice) => {
    notifyClinicAdmins({
      clinicId: ctx.clinicId,
      excludeUserId: ctx.userId,
      type: "INVOICE_CREATED",
      title: "Invoice created",
      body: `Invoice #${nextInvoiceNo} for ${total} ${currency}.`,
    }).catch((err) => logger.warn("notification dispatch failed", { error: err.message }));
    return invoice;
  });
}

export async function recordPayment(ctx, input) {
  const data = validate(recordPaymentSchema, input);
  const invoice = await getInvoiceScoped(ctx, data.invoiceId);

  if (invoice.status === "VOID") {
    throw new AppError("Cannot record a payment on a void invoice", "INVALID_STATUS", 400);
  }
  if (invoice.status === "PAID") {
    throw new AppError("Invoice is already paid", "INVOICE_ALREADY_PAID", 400);
  }

  const totalCents = toCents(invoice.total);
  const paidCents = invoice.payments.reduce((sum, p) => sum + toCents(p.amount), 0);
  const remainingCents = totalCents - paidCents;
  const paymentCents = toCents(data.amount);

  if (paymentCents > remainingCents) {
    throw new AppError(
      `Payment of ${data.amount} exceeds the remaining balance of ${fromCents(remainingCents)}`,
      "OVERPAYMENT",
      400,
    );
  }

  const newPaidCents = paidCents + paymentCents;
  const status = newPaidCents >= totalCents ? "PAID" : "OPEN";

  const result = await prisma.$transaction(async (tx) => {
    await tx.payment.create({
      data: {
        clinicId: ctx.clinicId,
        invoiceId: invoice.id,
        amount: data.amount,
        method: data.method,
        stripePaymentId: data.stripePaymentId ?? null,
        note: data.note ?? null,
        recordedById: ctx.userId ?? null,
      },
    });
    return tx.invoice.update({
      where: { id: invoice.id },
      data: { status },
      ...INVOICE_WITH_ITEMS,
    });
  });

  await notifyClinicAdmins({
    clinicId: ctx.clinicId,
    excludeUserId: ctx.userId,
    type: "PAYMENT_RECORDED",
    title: "Payment recorded",
    body: `${data.amount} ${invoice.currency} against invoice #${invoice.invoiceNo}.`,
  }).catch((err) => logger.warn("notification dispatch failed", { error: err.message }));

  return result;
}

export async function voidInvoice(ctx, id, reason) {
  const data = validate(voidInvoiceSchema, { reason });
  const invoice = await getInvoiceScoped(ctx, id);

  if (invoice.status === "VOID") {
    throw new AppError("Invoice is already void", "INVALID_STATUS", 400);
  }
  if (invoice.status === "PAID") {
    throw new AppError("A paid invoice cannot be voided", "INVALID_STATUS", 400);
  }

  const voided = await prisma.invoice.update({
    where: { id },
    data: { status: "VOID", voidReason: data.reason, voidedAt: new Date() },
    ...INVOICE_WITH_ITEMS,
  });

  await notifyClinicAdmins({
    clinicId: ctx.clinicId,
    excludeUserId: ctx.userId,
    type: "INVOICE_VOIDED",
    title: "Invoice voided",
    body: `Invoice #${invoice.invoiceNo} voided. ${data.reason}`,
  }).catch((err) => logger.warn("notification dispatch failed", { error: err.message }));

  return voided;
}
