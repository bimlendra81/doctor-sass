import { prisma } from "../config/db.js";
import { AppError, notFound } from "../utils/errors.js";
import { sendEmail, sendSms } from "./notifier.service.js";

export const CHANNELS = { EMAIL: "EMAIL", SMS: "SMS", IN_APP: "IN_APP" };

async function prefEnabled(userId, channel) {
  const pref = await prisma.notificationPreference.findUnique({
    where: { userId_channel: { userId, channel } },
  });
  return pref ? pref.enabled : true;
}

export async function createNotification({ userId, clinicId, type, title, body }) {
  return prisma.notification.create({ data: { userId, clinicId, type, title, body } });
}

/** Push an event to one user across every enabled channel (EMAIL/SMS/IN_APP). */
export async function notifyUser({ userId, clinicId, type, title, body, channels = {} }) {
  const results = [];

  if (channels.IN_APP || channels.IN_APP === undefined) {
    if (await prefEnabled(userId, CHANNELS.IN_APP)) {
      const notification = await createNotification({ userId, clinicId, type, title, body });
      results.push({ channel: CHANNELS.IN_APP, ok: true, notification });
    }
  }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true, phone: true } });
  if (user?.email && channels.EMAIL && (await prefEnabled(userId, CHANNELS.EMAIL))) {
    const result = await sendEmail({ to: user.email, subject: title, html: `<p>${body}</p>` });
    results.push({ channel: CHANNELS.EMAIL, ok: result.ok });
  }
  if (user?.phone && channels.SMS && (await prefEnabled(userId, CHANNELS.SMS))) {
    const result = await sendSms({ to: user.phone, body: `${title}: ${body}` });
    results.push({ channel: CHANNELS.SMS, ok: result.ok });
  }
  return results;
}

/** Fan out to all staff of a clinic (CLINIC_ADMIN/DOCTOR/STAFF), optionally excluding an actor. */
export async function notifyClinicStaff({ clinicId, type, title, body, excludeUserId, channels = {} }) {
  const staff = await prisma.user.findMany({
    where: { clinicId, role: { in: ["CLINIC_ADMIN", "DOCTOR", "STAFF"] } },
    select: { id: true },
  });
  const results = [];
  for (const user of staff) {
    if (user.id === excludeUserId) continue;
    results.push(await notifyUser({ userId: user.id, clinicId, type, title, body, channels }));
  }
  return results;
}

/** Fan out only to clinic admins, optionally excluding an actor. */
export async function notifyClinicAdmins({ clinicId, type, title, body, excludeUserId, channels = {} }) {
  const admins = await prisma.user.findMany({
    where: { clinicId, role: "CLINIC_ADMIN" },
    select: { id: true },
  });
  const results = [];
  for (const user of admins) {
    if (user.id === excludeUserId) continue;
    results.push(await notifyUser({ userId: user.id, clinicId, type, title, body, channels }));
  }
  return results;
}

export async function listMyNotifications(ctx, { unreadOnly = false, page = 1, pageSize = 20 } = {}) {
  const safePage = Math.max(1, page);
  const safeSize = Math.min(50, Math.max(1, pageSize));
  const where = { userId: ctx.user.id };
  if (unreadOnly) where.isRead = false;
  const [total, items] = await Promise.all([
    prisma.notification.count({ where }),
    prisma.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (safePage - 1) * safeSize,
      take: safeSize,
    }),
  ]);
  return { total, page: safePage, pageSize: safeSize, items };
}

export async function unreadNotificationCount(ctx) {
  return prisma.notification.count({ where: { userId: ctx.user.id, isRead: false } });
}

export async function markNotificationRead(ctx, id) {
  const existing = await prisma.notification.findFirst({ where: { id, userId: ctx.user.id } });
  if (!existing) throw notFound("Notification not found");
  return prisma.notification.update({ where: { id }, data: { isRead: true } });
}

export async function markAllNotificationsRead(ctx) {
  await prisma.notification.updateMany({ where: { userId: ctx.user.id, isRead: false }, data: { isRead: true } });
  return true;
}

export async function getMyPreferences(ctx) {
  const rows = await prisma.notificationPreference.findMany({ where: { userId: ctx.user.id } });
  const map = { EMAIL: true, SMS: true, IN_APP: true };
  for (const row of rows) map[row.channel] = row.enabled;
  return Object.entries(map).map(([channel, enabled]) => ({ channel, enabled }));
}

export async function setMyPreference(ctx, channel, enabled) {
  if (!Object.values(CHANNELS).includes(channel)) {
    throw new AppError("Invalid notification channel", "VALIDATION_ERROR", 400);
  }
  await prisma.notificationPreference.upsert({
    where: { userId_channel: { userId: ctx.user.id, channel } },
    create: { userId: ctx.user.id, channel, enabled: Boolean(enabled) },
    update: { enabled: Boolean(enabled) },
  });
  return true;
}
