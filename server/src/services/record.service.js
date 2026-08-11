import { prisma } from "../config/db.js";
import { AppError, notFound } from "../utils/errors.js";
import { validate } from "../utils/validate.js";
import { logger } from "../utils/logger.js";
import { createRecordSchema, updateRecordSchema, assertAllowedMime } from "../validators/record.validator.js";
import {
  MAX_UPLOAD_BYTES,
  createUploadUrl,
  getDownloadUrl,
  deleteObject,
  objectExists,
  isKeyAllowed,
} from "./storage.service.js";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

async function getRecordScoped(ctx, id) {
  const record = await prisma.medicalRecord.findFirst({
    where: { id, clinicId: ctx.clinicId, deletedAt: null },
  });
  if (!record) {
    throw notFound("Record not found");
  }
  return record;
}

export async function listRecords(ctx, { patientId, type, page = 1, pageSize = PAGE_SIZE_DEFAULT } = {}) {
  const size = Math.min(Math.max(Number(pageSize) || PAGE_SIZE_DEFAULT, 1), PAGE_SIZE_MAX);
  const offset = Math.max((Number(page) || 1) - 1, 0) * size;

  const where = { clinicId: ctx.clinicId, deletedAt: null };
  if (patientId) where.patientId = patientId;
  if (type) where.type = type;

  const [items, total] = await prisma.$transaction([
    prisma.medicalRecord.findMany({ where, orderBy: { createdAt: "desc" }, skip: offset, take: size }),
    prisma.medicalRecord.count({ where }),
  ]);

  return { items, total, page: Math.max(Number(page) || 1, 1), pageSize: size };
}

export async function getRecord(ctx, id) {
  return getRecordScoped(ctx, id);
}

export async function recordUploadUrl(ctx, { patientId, fileName, mimeType }) {
  const patient = await prisma.patient.findFirst({
    where: { id: patientId, clinicId: ctx.clinicId, deletedAt: null },
  });
  if (!patient) {
    throw notFound("Patient not found");
  }
  if (!assertAllowedMime(mimeType)) {
    throw new AppError("File type not allowed", "VALIDATION_ERROR", 400);
  }
  return createUploadUrl({ clinicId: ctx.clinicId, fileName, mimeType });
}

export async function recordFileUrl(ctx, id) {
  const record = await getRecordScoped(ctx, id);
  if (!record.fileKey) {
    return null;
  }
  return getDownloadUrl({ clinicId: ctx.clinicId, fileKey: record.fileKey, fileName: record.fileName });
}

async function resolveDoctor(ctx, doctorId) {
  if (doctorId) {
    const doctor = await prisma.doctor.findFirst({
      where: { id: doctorId, user: { clinicId: ctx.clinicId } },
    });
    if (!doctor) {
      throw notFound("Doctor not found in this clinic");
    }
    return doctor.id;
  }
  const doctor = await prisma.doctor.findFirst({ where: { userId: ctx.userId } });
  if (!doctor) {
    throw new AppError(
      "Doctor profile not found — provide the attending doctor's id",
      "DOCTOR_REQUIRED",
      400,
    );
  }
  return doctor.id;
}

export async function createRecord(ctx, input) {
  const data = validate(createRecordSchema, input);

  const patient = await prisma.patient.findFirst({
    where: { id: data.patientId, clinicId: ctx.clinicId, deletedAt: null },
  });
  if (!patient) {
    throw notFound("Patient not found");
  }
  const doctorId = await resolveDoctor(ctx, data.doctorId);

  const fileKey = data.fileKey || null;
  if (fileKey) {
    if (!isKeyAllowed(fileKey, ctx.clinicId)) {
      throw new AppError("Invalid file key", "VALIDATION_ERROR", 400);
    }
    if (!data.mimeType || !assertAllowedMime(data.mimeType)) {
      throw new AppError("File type not allowed", "VALIDATION_ERROR", 400);
    }
    if (!data.sizeBytes || data.sizeBytes > MAX_UPLOAD_BYTES) {
      throw new AppError("Invalid file size", "VALIDATION_ERROR", 400);
    }
    const exists = await objectExists(fileKey);
    if (!exists) {
      throw new AppError("Uploaded file not found — upload the file first", "FILE_NOT_FOUND", 400);
    }
  }

  return prisma.medicalRecord.create({
    data: {
      clinicId: ctx.clinicId,
      patientId: data.patientId,
      doctorId,
      type: data.type,
      title: data.title,
      notes: data.notes || null,
      fileKey,
      fileName: data.fileName || null,
      mimeType: data.mimeType || null,
      sizeBytes: data.sizeBytes || null,
    },
  });
}

export async function updateRecord(ctx, id, input) {
  const data = validate(updateRecordSchema, input);
  await getRecordScoped(ctx, id);
  const patch = {};
  if (data.title !== undefined) patch.title = data.title;
  if (data.notes !== undefined) patch.notes = data.notes;
  return prisma.medicalRecord.update({ where: { id }, data: patch });
}

export async function deleteRecord(ctx, id) {
  const record = await getRecordScoped(ctx, id);
  await prisma.medicalRecord.update({ where: { id }, data: { deletedAt: new Date() } });
  if (record.fileKey) {
    deleteObject(record.fileKey).catch((err) =>
      logger.warn("record file cleanup failed", { error: err.message, fileKey: record.fileKey }),
    );
  }
  return true;
}
