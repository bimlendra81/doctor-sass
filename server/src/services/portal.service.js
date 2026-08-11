import { randomUUID } from "crypto";
import { AppointmentStatus, Role } from "@doctor-sass/shared";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError, notFound } from "../utils/errors.js";
import { hashPassword } from "../utils/password.js";
import { generateOpaqueToken, hashToken } from "../utils/tokens.js";
import { validate } from "../utils/validate.js";
import {
  acceptPatientInviteSchema,
  bookMyAppointmentSchema,
  cancelMyAppointmentSchema,
  patientInviteSchema,
} from "../validators/portal.validator.js";
import { toPublicUser, issueSession } from "./auth.service.js";
import * as appointmentService from "./appointment.service.js";
import * as availabilityService from "./availability.service.js";
import * as billingService from "./billing.service.js";
import { sendEmail } from "./notifier.service.js";
import { notifyClinicStaff } from "./notification.service.js";
import { stripe } from "./subscription.service.js";
import { getDownloadUrl } from "./storage.service.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

const TERMINAL = new Set([
  AppointmentStatus.COMPLETED,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
]);

/** Derive the portal patient solely from the authenticated user (self-scoping). */
async function requireLinkedPatient(ctx) {
  if (!ctx?.user) {
    throw new AppError("Authentication required", "UNAUTHORIZED", 401);
  }
  if (ctx.user.role !== Role.PATIENT) {
    throw new AppError("Only patients can access the portal", "FORBIDDEN", 403);
  }
  const patient = await prisma.patient.findUnique({ where: { userId: ctx.user.id } });
  if (!patient || patient.deletedAt) {
    throw new AppError("No patient profile linked to this account", "NO_PATIENT_PROFILE", 400);
  }
  return patient;
}

// --- Invite-first account creation (CLINIC_ADMIN/STAFF) ---

export async function patientInvite(ctx, input) {
  if (!ctx?.clinicId) {
    throw new AppError("Create your clinic before inviting patients", "NO_CLINIC", 400);
  }
  const data = validate(patientInviteSchema, input);

  const patient = await prisma.patient.findFirst({
    where: { id: data.patientId, clinicId: ctx.clinicId, deletedAt: null },
  });
  if (!patient) {
    throw notFound("Patient not found");
  }
  if (patient.userId) {
    throw new AppError("This patient already has a portal account", "INVITE_EXISTS", 409);
  }
  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new AppError("That email already has an account", "EMAIL_TAKEN", 409);
  }

  const rawToken = generateOpaqueToken();
  const invited = await prisma.user.create({
    data: {
      name: patient.name,
      email: data.email,
      clinicId: ctx.clinicId,
      role: Role.PATIENT,
      inviteTokenHash: hashToken(rawToken),
      inviteTokenExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });

  // Keep the patient's contact email in sync so acceptance can link by clinic+email.
  let linkedPatient = patient;
  if (patient.email !== data.email) {
    linkedPatient = await prisma.patient.update({ where: { id: patient.id }, data: { email: data.email } });
  }

  const inviteUrl = `${env.webappUrl}/accept-invite?token=${rawToken}`;
  const clinic = await prisma.clinic.findUnique({ where: { id: ctx.clinicId }, select: { name: true } });
  await sendEmail({
    to: data.email,
    subject: `You're invited to ${clinic?.name ?? "your clinic's"} patient portal`,
    html: `<p>Hi ${patient.name},</p><p>Your clinic has invited you to the patient portal. Set your password here:</p><p><a href="${inviteUrl}">${inviteUrl}</a></p><p>This link expires in 7 days.</p>`,
    text: `Set your password at ${inviteUrl}. This link expires in 7 days.`,
  });

  return { inviteToken: rawToken, user: toPublicUser(invited), patient: linkedPatient };
}

export async function acceptPatientInvite(input, userAgent) {
  const data = validate(acceptPatientInviteSchema, input);

  const tokenHash = hashToken(data.inviteToken);
  const invited = await prisma.user.findUnique({ where: { inviteTokenHash: tokenHash } });
  if (!invited || invited.role !== Role.PATIENT || !invited.inviteTokenExpiresAt || invited.inviteTokenExpiresAt < new Date()) {
    throw new AppError("Invalid or expired invite", "INVALID_INVITE", 400);
  }
  if (invited.passwordHash) {
    throw new AppError("This invite has already been used", "INVITE_USED", 400);
  }

  const patient = await prisma.patient.findFirst({
    where: { clinicId: invited.clinicId, email: invited.email, deletedAt: null },
  });
  if (!patient) {
    throw new AppError("No matching patient record for this invite", "PATIENT_MISMATCH", 400);
  }

  const passwordHash = await hashPassword(data.password);
  const updated = await prisma.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id: invited.id },
      data: {
        name: data.name ?? invited.name,
        phone: data.phone ?? null,
        passwordHash,
        emailVerified: true,
        inviteTokenHash: null,
        inviteTokenExpiresAt: null,
      },
    });
    await tx.patient.update({ where: { id: patient.id }, data: { userId: user.id } });
    return user;
  });

  const session = await issueSession(updated, userAgent);
  return { ...session, user: toPublicUser(updated) };
}

// --- Portal profile ---

export async function myProfile(ctx) {
  return requireLinkedPatient(ctx);
}

// --- Appointments ---

export async function myAppointments(ctx, { status, page = 1, pageSize = PAGE_SIZE_DEFAULT } = {}) {
  const patient = await requireLinkedPatient(ctx);
  const size = Math.min(Math.max(Number(pageSize) || PAGE_SIZE_DEFAULT, 1), PAGE_SIZE_MAX);
  const offset = Math.max((Number(page) || 1) - 1, 0) * size;

  const where = { clinicId: ctx.clinicId, patientId: patient.id };
  if (status) where.status = status;

  const [items, total] = await prisma.$transaction([
    prisma.appointment.findMany({ where, orderBy: { startTime: "desc" }, skip: offset, take: size }),
    prisma.appointment.count({ where }),
  ]);
  return { items, total, page: Math.max(Number(page) || 1, 1), pageSize: size };
}

export async function bookMyAppointment(ctx, input) {
  const patient = await requireLinkedPatient(ctx);
  const data = validate(bookMyAppointmentSchema, input);
  return appointmentService.bookAppointment(ctx, { ...data, patientId: patient.id });
}

export async function cancelMyAppointment(ctx, id, cancelReason) {
  const patient = await requireLinkedPatient(ctx);
  const data = validate(cancelMyAppointmentSchema, { cancelReason });

  const appointment = await prisma.appointment.findFirst({
    where: { id, clinicId: ctx.clinicId, patientId: patient.id },
  });
  if (!appointment) {
    throw notFound("Appointment not found");
  }
  if (TERMINAL.has(appointment.status)) {
    throw new AppError(`Cannot cancel a ${appointment.status} appointment`, "INVALID_STATUS", 400);
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: {
      status: AppointmentStatus.CANCELLED,
      cancelReason: data.cancelReason ?? null,
      cancelledAt: new Date(),
    },
  });

  await notifyClinicStaff({
    clinicId: ctx.clinicId,
    excludeUserId: ctx.userId,
    type: "APPOINTMENT_CANCELLED",
    title: "Appointment cancelled by patient",
    body: `${appointment.startTime.toISOString()}${data.cancelReason ? ` — ${data.cancelReason}` : ""}`,
  }).catch(() => {});

  return updated;
}

// --- Prescriptions ---

export async function myPrescriptions(ctx) {
  const patient = await requireLinkedPatient(ctx);
  return prisma.prescription.findMany({
    where: { clinicId: ctx.clinicId, patientId: patient.id, status: "ACTIVE" },
    orderBy: { issuedAt: "desc" },
    include: { items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
  });
}

// --- Invoices + online payment ---

export async function myInvoices(ctx) {
  const patient = await requireLinkedPatient(ctx);
  return prisma.invoice.findMany({
    where: { clinicId: ctx.clinicId, patientId: patient.id, status: { not: "VOID" } },
    orderBy: { createdAt: "desc" },
    include: {
      items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
      payments: { orderBy: { createdAt: "asc" } },
    },
  });
}

export async function payInvoice(ctx, invoiceId) {
  const patient = await requireLinkedPatient(ctx);
  const invoice = await prisma.invoice.findFirst({
    where: { id: invoiceId, clinicId: ctx.clinicId, patientId: patient.id },
    include: { items: true, payments: true },
  });
  if (!invoice) {
    throw notFound("Invoice not found");
  }
  if (invoice.status === "VOID") {
    throw new AppError("Cannot pay a void invoice", "INVALID_STATUS", 400);
  }

  const paidCents = invoice.payments.reduce((sum, p) => sum + Math.round(Number(p.amount) * 100), 0);
  const totalCents = Math.round(Number(invoice.total) * 100);
  const balanceDueCents = totalCents - paidCents;
  if (balanceDueCents <= 0) {
    throw new AppError("Invoice is already paid", "INVOICE_ALREADY_PAID", 400);
  }

  if (!stripe) {
    const updated = await billingService.recordPayment(ctx, {
      invoiceId: invoice.id,
      amount: balanceDueCents / 100,
      method: "ONLINE",
      stripePaymentId: `dev_${randomUUID()}`,
      note: "Online payment (dev mode)",
    });
    return { invoice: updated, devMode: true };
  }

  const baseUrl = env.webappUrl;
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [
      {
        price_data: {
          currency: invoice.currency ?? "usd",
          product_data: { name: `Invoice #${invoice.invoiceNo}` },
          unit_amount: balanceDueCents,
        },
        quantity: 1,
      },
    ],
    metadata: { invoiceId: invoice.id, clinicId: ctx.clinicId },
    success_url: `${baseUrl}/portal/invoices?checkout=success`,
    cancel_url: `${baseUrl}/portal/invoices?checkout=cancel`,
  });
  return { invoice, devMode: false, url: session.url };
}

// --- Medical records (read-only) ---

export async function myRecords(ctx) {
  const patient = await requireLinkedPatient(ctx);
  return prisma.medicalRecord.findMany({
    where: { clinicId: ctx.clinicId, patientId: patient.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
  });
}

export async function myRecordFileUrl(ctx, id) {
  const patient = await requireLinkedPatient(ctx);
  const record = await prisma.medicalRecord.findFirst({
    where: { id, clinicId: ctx.clinicId, patientId: patient.id, deletedAt: null },
  });
  if (!record) {
    throw notFound("Record not found");
  }
  if (!record.fileKey) {
    return null;
  }
  return getDownloadUrl({ clinicId: ctx.clinicId, fileKey: record.fileKey, fileName: record.fileName });
}

// --- Booking discovery (read-only clinic data for the portal) ---

export async function portalDoctors(ctx) {
  await requireLinkedPatient(ctx);
  return availabilityService.listDoctors(ctx);
}

export async function portalDoctorSlots(ctx, doctorId, dateStr) {
  await requireLinkedPatient(ctx);
  return availabilityService.doctorSlots(ctx, doctorId, dateStr);
}
