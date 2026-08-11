import { Role } from "@doctor-sass/shared";
import { prisma } from "../config/db.js";
import { env } from "../config/env.js";
import { AppError, unauthorized } from "../utils/errors.js";
import { hashPassword, verifyPassword } from "../utils/password.js";
import { signAccessToken, generateOpaqueToken, hashToken } from "../utils/tokens.js";
import { ttlToMs } from "../utils/time.js";
import { validate } from "../utils/validate.js";
import {
  signupSchema,
  loginSchema,
  refreshTokenSchema,
  verifyEmailSchema,
} from "../validators/auth.validator.js";

const VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000;

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
