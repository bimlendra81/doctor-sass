import { Role } from "@doctor-sass/shared";
import { prisma } from "../config/db.js";
import { AppError, forbidden, unauthorized } from "../utils/errors.js";
import { hashPassword } from "../utils/password.js";
import { generateOpaqueToken, hashToken } from "../utils/tokens.js";
import { validate } from "../utils/validate.js";
import { acceptInviteSchema, inviteSchema } from "../validators/clinic.validator.js";
import { issueSession, toPublicUser } from "./auth.service.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function inviteStaff(input, ctx) {
  const data = validate(inviteSchema, input);

  const user = ctx.user;
  if (!user) {
    throw unauthorized("Authentication required");
  }
  if (user.role !== Role.CLINIC_ADMIN) {
    throw forbidden("Only clinic admins can invite team members");
  }
  if (!user.clinicId) {
    throw new AppError("Create your clinic before inviting team members", "NO_CLINIC", 400);
  }

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new AppError("That email already has an account", "EMAIL_TAKEN", 409);
  }

  const rawToken = generateOpaqueToken();
  const invited = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      clinicId: user.clinicId,
      role: data.role,
      inviteTokenHash: hashToken(rawToken),
      inviteTokenExpiresAt: new Date(Date.now() + INVITE_TTL_MS),
    },
  });

  return { user: toPublicUser(invited), inviteToken: rawToken };
}

export async function acceptInvite(input, userAgent) {
  const data = validate(acceptInviteSchema, input);

  const tokenHash = hashToken(data.inviteToken);
  const invited = await prisma.user.findUnique({ where: { inviteTokenHash: tokenHash } });
  if (!invited || !invited.inviteTokenExpiresAt || invited.inviteTokenExpiresAt < new Date()) {
    throw new AppError("Invalid or expired invite", "INVALID_INVITE", 400);
  }
  if (invited.passwordHash) {
    throw new AppError("This invite has already been used", "INVITE_USED", 400);
  }

  const passwordHash = await hashPassword(data.password);
  const updated = await prisma.user.update({
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

  const session = await issueSession(updated, userAgent);
  return { ...session, user: toPublicUser(updated) };
}
