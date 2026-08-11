import { Role } from "@doctor-sass/shared";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError, unauthorized } from "../utils/errors.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signAccessToken, generateOpaqueToken, hashToken } from "../utils/tokens.js";
import { ttlToMs } from "../utils/time.js";
import { validate } from "../utils/validate.js";
import { sendEmail } from "./notifier.service.js";
import {
  signupSchema,
  loginSchema,
  refreshTokenSchema,
  verifyEmailSchema,
  requestPasswordResetSchema,
  resetPasswordSchema,
  changePasswordSchema,
} from "../validators/auth.validator.js";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;
const RESET_TTL_MS = 60 * 60 * 1000;

export function toPublicUser(user) {
  const { passwordHash, inviteTokenHash, inviteTokenExpiresAt, ...publicUser } = user;
  return publicUser;
}

export async function issueSession(user, userAgent) {
  const accessToken = signAccessToken(user);
  const refreshToken = generateOpaqueToken();
  await prisma.refreshToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + ttlToMs(env.jwt.refreshTtl)),
      userAgent: userAgent ?? null,
    },
  });
  return { accessToken, refreshToken };
}

async function issueEmailVerificationToken(userId) {
  const rawToken = generateOpaqueToken();
  await prisma.emailVerificationToken.create({
    data: {
      userId,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + VERIFICATION_TTL_MS),
    },
  });
  return rawToken;
}

export async function signup(input, userAgent) {
  const data = validate(signupSchema, input);

  const existing = await prisma.user.findUnique({ where: { email: data.email } });
  if (existing) {
    throw new AppError("Email already registered", "EMAIL_TAKEN", 409);
  }

  const passwordHash = await hashPassword(data.password);
  const user = await prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone ?? null,
      passwordHash,
      // Clinic owner account; `createClinic` (M3) attaches it to a tenant.
      role: Role.CLINIC_ADMIN,
    },
  });

  const session = await issueSession(user, userAgent);
  const verificationToken = await issueEmailVerificationToken(user.id);
  return { ...session, user: toPublicUser(user), verificationToken };
}

export async function login(input, userAgent) {
  const data = validate(loginSchema, input);

  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user || !(await verifyPassword(data.password, user.passwordHash))) {
    throw unauthorized("Invalid email or password");
  }

  const session = await issueSession(user, userAgent);
  return { ...session, user: toPublicUser(user) };
}

export async function refreshToken(input, userAgent) {
  const data = validate(refreshTokenSchema, input);

  const tokenHash = hashToken(data.refreshToken);
  const stored = await prisma.refreshToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.revokedAt || stored.expiresAt < new Date()) {
    throw unauthorized("Invalid or expired refresh token");
  }

  const user = await prisma.user.findUnique({ where: { id: stored.userId } });
  if (!user) {
    throw unauthorized("Invalid or expired refresh token");
  }

  const accessToken = signAccessToken(user);
  const newRefreshToken = generateOpaqueToken();
  const newHash = hashToken(newRefreshToken);

  await prisma.$transaction([
    prisma.refreshToken.update({
      where: { id: stored.id },
      data: { revokedAt: new Date(), replacedBy: newHash },
    }),
    prisma.refreshToken.create({
      data: {
        userId: user.id,
        tokenHash: newHash,
        expiresAt: new Date(Date.now() + ttlToMs(env.jwt.refreshTtl)),
        userAgent: userAgent ?? null,
      },
    }),
  ]);

  return { accessToken, refreshToken: newRefreshToken, user: toPublicUser(user) };
}

export async function logout(refreshTokenRaw) {
  const data = validate(refreshTokenSchema, { refreshToken: refreshTokenRaw });
  const tokenHash = hashToken(data.refreshToken);
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return true;
}

export async function verifyEmail(token) {
  const data = validate(verifyEmailSchema, { token });

  const tokenHash = hashToken(data.token);
  const stored = await prisma.emailVerificationToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
    throw new AppError("Invalid or expired verification token", "INVALID_VERIFICATION_TOKEN", 400);
  }

  await prisma.$transaction([
    prisma.emailVerificationToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: stored.userId }, data: { emailVerified: true } }),
  ]);
  return true;
}

export async function requestPasswordReset(email) {
  const data = validate(requestPasswordResetSchema, { email });
  const user = await prisma.user.findUnique({ where: { email: data.email } });
  if (!user) {
    // Do not reveal whether the account exists.
    return true;
  }

  const rawToken = generateOpaqueToken();
  await prisma.passwordResetToken.create({
    data: {
      userId: user.id,
      tokenHash: hashToken(rawToken),
      expiresAt: new Date(Date.now() + RESET_TTL_MS),
    },
  });

  await sendEmail({
    to: user.email,
    subject: "Reset your password",
    html: `<p>Use this token to reset your password:</p><p><code>${rawToken}</code></p><p>It expires in 1 hour.</p>`,
  });

  return { sent: true, token: rawToken };
}

export async function resetPassword(token, newPassword) {
  const data = validate(resetPasswordSchema, { token, newPassword });

  const tokenHash = hashToken(data.token);
  const stored = await prisma.passwordResetToken.findUnique({ where: { tokenHash } });
  if (!stored || stored.usedAt || stored.expiresAt < new Date()) {
    throw new AppError("Invalid or expired reset token", "INVALID_RESET_TOKEN", 400);
  }

  const passwordHash = await hashPassword(data.newPassword);
  await prisma.$transaction([
    prisma.passwordResetToken.update({ where: { id: stored.id }, data: { usedAt: new Date() } }),
    prisma.user.update({ where: { id: stored.userId }, data: { passwordHash } }),
    prisma.refreshToken.updateMany({
      where: { userId: stored.userId, revokedAt: null },
      data: { revokedAt: new Date() },
    }),
  ]);
  return true;
}

export async function changePassword(ctx, input) {
  const data = validate(changePasswordSchema, input);
  const user = await prisma.user.findUnique({ where: { id: ctx.user.id } });
  if (!user || !(await verifyPassword(data.currentPassword, user.passwordHash))) {
    throw new AppError("Current password is incorrect", "INVALID_PASSWORD", 400);
  }

  const passwordHash = await hashPassword(data.newPassword);
  await prisma.user.update({ where: { id: ctx.user.id }, data: { passwordHash } });
  return true;
}
