import { prisma } from "../config/db.js";
import { AppError, notFound } from "../utils/errors.js";
import { validate } from "../utils/validate.js";
import { updateClinicSettingsSchema } from "../validators/settings.validator.js";

function nullIfEmpty(value) {
  return typeof value === "string" && value.trim() === "" ? null : value;
}

export async function getClinicSettings(clinicId) {
  if (!clinicId) {
    throw new AppError("No clinic on this account yet", "NO_CLINIC", 400);
  }
  const clinic = await prisma.clinic.findUnique({ where: { id: clinicId } });
  if (!clinic) {
    throw notFound("Clinic not found");
  }
  return clinic;
}

export async function updateClinicSettings(ctx, input) {
  const data = validate(updateClinicSettingsSchema, input);

  const update = {};
  if (data.name !== undefined) update.name = data.name;
  if (data.brandName !== undefined) update.brandName = nullIfEmpty(data.brandName);
  if (data.logoUrl !== undefined) update.logoUrl = nullIfEmpty(data.logoUrl);
  if (data.timezone !== undefined) update.timezone = data.timezone;
  if (data.contactEmail !== undefined) update.contactEmail = nullIfEmpty(data.contactEmail);
  if (data.contactPhone !== undefined) update.contactPhone = nullIfEmpty(data.contactPhone);
  if (data.currency !== undefined) update.currency = data.currency;

  const clinic = await prisma.clinic.update({ where: { id: ctx.clinicId }, data: update });
  return { settings: clinic };
}
