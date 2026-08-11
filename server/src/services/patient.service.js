import { prisma } from "../config/db.js";
import { notFound } from "../utils/errors.js";
import { validate } from "../utils/validate.js";
import { createPatientSchema, updatePatientSchema } from "../validators/patient.validator.js";

const PAGE_SIZE_DEFAULT = 20;
const PAGE_SIZE_MAX = 100;

function normalizeInput(raw, schema) {
  const data = validate(schema, raw);
  return {
    name: data.name?.trim() || null,
    email: data.email?.trim()?.toLowerCase() || null,
    phone: data.phone?.trim() || null,
    dob: data.dob ? new Date(data.dob) : null,
    gender: data.gender?.trim() || null,
    bloodGroup: data.bloodGroup?.trim() || null,
    address: data.address?.trim() || null,
  };
}

export async function updatePatient(ctx, id, input) {
  await getPatient(ctx, id);
  const data = validate(updatePatientSchema, input);
  const patch = {};
  if (data.name !== undefined) patch.name = data.name?.trim() || null;
  if (data.email !== undefined) patch.email = data.email?.trim()?.toLowerCase() || null;
  if (data.phone !== undefined) patch.phone = data.phone?.trim() || null;
  if (data.dob !== undefined) patch.dob = data.dob ? new Date(data.dob) : null;
  if (data.gender !== undefined) patch.gender = data.gender?.trim() || null;
  if (data.bloodGroup !== undefined) patch.bloodGroup = data.bloodGroup?.trim() || null;
  if (data.address !== undefined) patch.address = data.address?.trim() || null;
  return prisma.patient.update({ where: { id }, data: patch });
}

export async function listPatients(ctx, search, page = 1, pageSize = PAGE_SIZE_DEFAULT) {
  const size = Math.min(Math.max(Number(pageSize) || PAGE_SIZE_DEFAULT, 1), PAGE_SIZE_MAX);
  const offset = Math.max((Number(page) || 1) - 1, 0) * size;

  const where = {
    clinicId: ctx.clinicId,
    deletedAt: null,
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            { phone: { contains: search } },
            { email: { contains: search } },
          ],
        }
      : {}),
  };

  const [items, total] = await prisma.$transaction([
    prisma.patient.findMany({ where, orderBy: { name: "asc" }, skip: offset, take: size }),
    prisma.patient.count({ where }),
  ]);

  return { items, total, page: Math.max(Number(page) || 1, 1), pageSize: size };
}

export async function getPatient(ctx, id) {
  const patient = await prisma.patient.findFirst({
    where: { id, clinicId: ctx.clinicId, deletedAt: null },
  });
  if (!patient) {
    throw notFound("Patient not found");
  }
  return patient;
}

export async function createPatient(ctx, input) {
  const data = normalizeInput(input, createPatientSchema);
  return prisma.patient.create({
    data: { clinicId: ctx.clinicId, ...data },
  });
}

export async function deletePatient(ctx, id) {
  await getPatient(ctx, id);
  await prisma.patient.update({ where: { id }, data: { deletedAt: new Date() } });
  return true;
}
