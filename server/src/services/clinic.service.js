import { Plan, Role } from "@doctor-sass/shared";
import { prisma } from "../config/db.js";
import { AppError, unauthorized } from "../utils/errors.js";
import { validate } from "../utils/validate.js";
import { createClinicSchema } from "../validators/clinic.validator.js";
import { issueSession, toPublicUser } from "./auth.service.js";

const RESERVED_SUBDOMAINS = new Set([
  "admin", "api", "app", "www", "login", "auth", "clinic", "clinics",
  "support", "docs", "help", "demo", "test", "staging", "dev", "api",
]);

export function normalizeSubdomain(subdomain) {
  const normalized = subdomain.trim().toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$/.test(normalized) || normalized.length < 2) {
    throw new AppError(
      "Subdomain must be 2-63 characters using lowercase letters, digits and hyphens",
      "INVALID_SUBDOMAIN",
      400,
    );
  }
  if (RESERVED_SUBDOMAINS.has(normalized)) {
    throw new AppError(`Subdomain "${normalized}" is reserved`, "SUBDOMAIN_RESERVED", 400);
  }
  return normalized;
}

export async function createClinic(input, userId, userAgent) {
  const data = validate(createClinicSchema, input);
  const subdomain = normalizeSubdomain(data.subdomain);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) {
    throw unauthorized("Authentication required");
  }
  if (user.clinicId) {
    throw new AppError("You already belong to a clinic", "ALREADY_IN_CLINIC", 400);
  }

  const existing = await prisma.clinic.findUnique({ where: { subdomain } });
  if (existing) {
    throw new AppError("That subdomain is already taken", "SUBDOMAIN_TAKEN", 409);
  }

  const clinic = await prisma.$transaction(async (tx) => {
    const created = await tx.clinic.create({
      data: { name: data.name, subdomain, plan: data.plan ?? Plan.FREE },
    });
    await tx.user.update({
      where: { id: userId },
      data: { clinicId: created.id, role: Role.CLINIC_ADMIN },
    });
    return created;
  });

  const updatedUser = await prisma.user.findUnique({ where: { id: userId } });
  const session = await issueSession(updatedUser, userAgent);
  return { clinic, user: toPublicUser(updatedUser), ...session };
}

export async function getMyClinic(clinicId) {
  if (!clinicId) return null;
  return prisma.clinic.findUnique({ where: { id: clinicId } });
}

export async function getClinicTimezone(clinicId) {
  if (!clinicId) return "UTC";
  const clinic = await prisma.clinic.findUnique({
    where: { id: clinicId },
    select: { timezone: true },
  });
  return clinic?.timezone ?? "UTC";
}

export async function getClinicUsers(clinicId) {
  if (!clinicId) {
    throw new AppError("No clinic on this account yet", "NO_CLINIC", 400);
  }
  const users = await prisma.user.findMany({
    where: { clinicId },
    orderBy: { createdAt: "asc" },
  });
  return users.map(toPublicUser);
}
