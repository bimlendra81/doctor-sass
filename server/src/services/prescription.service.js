import { prisma } from "../config/db.js";
import { AppError, notFound } from "../utils/errors.js";
import { validate } from "../utils/validate.js";
import { assertPlanLimit } from "./subscription.service.js";
import { notifyClinicAdmins } from "./notification.service.js";
import { logger } from "../utils/logger.js";
import {
  createPrescriptionSchema,
  updatePrescriptionSchema,
  voidPrescriptionSchema,
} from "../validators/prescription.validator.js";

const PRESCRIPTION_WITH_ITEMS = {
  include: { items: { orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] } },
};

export async function listPrescriptions(ctx, { patientId, doctorId, status } = {}) {
  const where = { clinicId: ctx.clinicId };
  if (patientId) where.patientId = patientId;
  if (doctorId) where.doctorId = doctorId;
  if (status) where.status = status;
  return prisma.prescription.findMany({
    where,
    orderBy: { createdAt: "desc" },
    ...PRESCRIPTION_WITH_ITEMS,
  });
}

async function getPrescriptionScoped(ctx, id) {
  const prescription = await prisma.prescription.findFirst({
    where: { id, clinicId: ctx.clinicId },
    ...PRESCRIPTION_WITH_ITEMS,
  });
  if (!prescription) {
    throw notFound("Prescription not found");
  }
  return prescription;
}

export async function getPrescription(ctx, id) {
  return getPrescriptionScoped(ctx, id);
}

export async function createPrescription(ctx, input) {
  await assertPlanLimit(ctx, "prescriptions");
  const data = validate(createPrescriptionSchema, input);

  const [patient, doctor] = await Promise.all([
    prisma.patient.findFirst({
      where: { id: data.patientId, clinicId: ctx.clinicId, deletedAt: null },
    }),
    prisma.doctor.findFirst({
      where: { id: data.doctorId, user: { clinicId: ctx.clinicId } },
    }),
  ]);
  if (!patient) {
    throw notFound("Patient not found");
  }
  if (!doctor) {
    throw notFound("Doctor not found in this clinic");
  }

  let appointment = null;
  if (data.appointmentId) {
    appointment = await prisma.appointment.findFirst({
      where: { id: data.appointmentId, clinicId: ctx.clinicId },
    });
    if (!appointment) {
      throw notFound("Appointment not found");
    }
    const existing = await prisma.prescription.findFirst({
      where: { appointmentId: data.appointmentId },
    });
    if (existing) {
      throw new AppError("A prescription already exists for this appointment", "PRESCRIPTION_EXISTS", 409);
    }
  }

  return prisma.prescription.create({
    data: {
      clinicId: ctx.clinicId,
      patientId: data.patientId,
      doctorId: data.doctorId,
      appointmentId: data.appointmentId ?? null,
      notes: data.notes ?? null,
      items: { create: data.items.map((item, index) => normalizeItem(item, index)) },
    },
    ...PRESCRIPTION_WITH_ITEMS,
  });
}

export async function updatePrescription(ctx, id, input) {
  const data = validate(updatePrescriptionSchema, input);
  const prescription = await getPrescriptionScoped(ctx, id);
  if (prescription.status !== "DRAFT") {
    throw new AppError("Only draft prescriptions can be edited", "INVALID_STATUS", 400);
  }

  return prisma.$transaction(async (tx) => {
    await tx.prescriptionItem.deleteMany({ where: { prescriptionId: id } });
    const updates = { notes: data.notes ?? null };
    if (data.items) {
      updates.items = { create: data.items.map((item, index) => normalizeItem(item, index)) };
    }
    return tx.prescription.update({
      where: { id },
      data: updates,
      ...PRESCRIPTION_WITH_ITEMS,
    });
  });
}

export async function issuePrescription(ctx, id) {
  const prescription = await getPrescriptionScoped(ctx, id);
  if (prescription.status !== "DRAFT") {
    throw new AppError(`Cannot issue a ${prescription.status} prescription`, "INVALID_STATUS", 400);
  }

  const last = await prisma.prescription.findFirst({
    where: { clinicId: ctx.clinicId, scriptNo: { not: null } },
    orderBy: { scriptNo: "desc" },
    select: { scriptNo: true },
  });
  const nextScriptNo = (last?.scriptNo ?? 0) + 1;

  const issued = await prisma.prescription.update({
    where: { id },
    data: { status: "ACTIVE", scriptNo: nextScriptNo, issuedAt: new Date() },
    ...PRESCRIPTION_WITH_ITEMS,
  });

  await notifyClinicAdmins({
    clinicId: ctx.clinicId,
    excludeUserId: ctx.userId,
    type: "PRESCRIPTION_ISSUED",
    title: "Prescription issued",
    body: `Script #${nextScriptNo} for patient ${prescription.patientId} issued by ${prescription.doctorId}.`,
  }).catch((err) => logger.warn("notification dispatch failed", { error: err.message }));

  return issued;
}

export async function voidPrescription(ctx, id, reason) {
  const data = validate(voidPrescriptionSchema, { reason });
  const prescription = await getPrescriptionScoped(ctx, id);
  if (prescription.status === "VOID") {
    throw new AppError("Prescription is already void", "INVALID_STATUS", 400);
  }
  return prisma.prescription.update({
    where: { id },
    data: { status: "VOID", voidReason: data.reason, voidedAt: new Date() },
    ...PRESCRIPTION_WITH_ITEMS,
  });
}

function normalizeItem(item, index) {
  return {
    sortOrder: index,
    drugName: item.drugName,
    dosage: item.dosage ?? null,
    frequency: item.frequency ?? null,
    duration: item.duration ?? null,
    instructions: item.instructions ?? null,
    strength: item.strength ?? null,
    quantity: item.quantity ?? null,
    refills: item.refills ?? 0,
  };
}
