import { prisma } from "../config/db.js";
import { logger } from "../utils/logger.js";
import { notifyClinicStaff, notifyUser } from "./notification.service.js";
import { sendEmail } from "./notifier.service.js";

export const REMINDER_TYPES = ["T24H", "T1H"];

const HOUR_MS = 60 * 60 * 1000;

export function reminderDueAt(startTime, type) {
  const offsetHours = type === "T24H" ? 24 : 1;
  return new Date(new Date(startTime).getTime() - offsetHours * HOUR_MS);
}

/** Create the T24H/T1H ReminderJob ledger rows for an appointment (idempotent). */
export async function scheduleReminders(appointment) {
  const now = Date.now();
  const jobs = [];
  for (const type of REMINDER_TYPES) {
    const scheduledFor = reminderDueAt(appointment.startTime, type);
    if (scheduledFor.getTime() > now) {
      try {
        await prisma.reminderJob.create({
          data: { appointmentId: appointment.id, type, scheduledFor },
        });
        jobs.push({ type, scheduledFor });
      } catch (err) {
        if (err?.code !== "P2002") throw err;
      }
    }
  }
  return jobs;
}

/** Dispatch every ReminderJob that is due and unsent; mark it sent afterward. */
export async function runDueReminders(now = new Date()) {
  const due = await prisma.reminderJob.findMany({
    where: { sentAt: null, scheduledFor: { lte: now } },
    include: {
      appointment: {
        select: {
          id: true,
          clinicId: true,
          startTime: true,
          status: true,
          patient: { select: { name: true, email: true, userId: true } },
        },
      },
    },
    take: 100,
  });

  const dispatched = [];
  for (const job of due) {
    const { appointment } = job;
    if (!appointment || !["PENDING", "CONFIRMED"].includes(appointment.status)) {
      await prisma.reminderJob.update({ where: { id: job.id }, data: { sentAt: now } });
      continue;
    }
    const hourLabel = job.type === "T24H" ? "24 hours" : "1 hour";
    const when = new Date(appointment.startTime).toISOString();
    const title = `Appointment in ${hourLabel}`;
    const body = `${appointment.patient?.name ?? "Patient"} at ${when}.`;
    try {
      await notifyClinicStaff({
        clinicId: appointment.clinicId,
        type: "REMINDER",
        title,
        body,
        channels: { IN_APP: true, EMAIL: true },
      });
      // M13 fold-in: remind the patient's portal account when one is linked,
      // else fall back to a direct email to the patient.
      const patient = appointment.patient;
      if (patient?.userId) {
        await notifyUser({
          userId: patient.userId,
          clinicId: appointment.clinicId,
          type: "REMINDER",
          title,
          body,
          channels: { IN_APP: true, EMAIL: true },
        });
      } else if (patient?.email) {
        await sendEmail({ to: patient.email, subject: title, html: `<p>${body}</p>` });
      }
      await prisma.reminderJob.update({ where: { id: job.id }, data: { sentAt: now } });
      dispatched.push({ type: job.type, appointmentId: appointment.id });
      logger.info("appointment reminder dispatched", { type: job.type, appointmentId: appointment.id });
    } catch (err) {
      logger.error("reminder dispatch failed", { jobId: job.id, error: err.message });
    }
  }
  return dispatched;
}

let schedulerHandle = null;

export function startReminderScheduler(intervalMs = 60 * 1000) {
  if (schedulerHandle) return schedulerHandle;
  schedulerHandle = setInterval(() => {
    runDueReminders().catch((err) => logger.error("reminder scheduler tick failed", { error: err.message }));
  }, intervalMs);
  if (schedulerHandle.unref) schedulerHandle.unref();
  return schedulerHandle;
}
