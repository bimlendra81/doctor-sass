import { AppointmentStatus, AppointmentType } from "@doctor-sass/shared";
import { prisma } from "../config/db.js";
import { AppError, notFound } from "../utils/errors.js";
import { zonedDayBounds, zonedDateStr, zonedTodayStr } from "../utils/timezone.js";
import { validate } from "../utils/validate.js";
import { bookAppointmentSchema, cancelAppointmentSchema } from "../validators/appointment.validator.js";
import { getClinicTimezone } from "./clinic.service.js";
import { doctorSlots } from "./availability.service.js";
import { assertPlanLimit } from "./subscription.service.js";
import { notifyClinicStaff } from "./notification.service.js";
import { scheduleReminders } from "./reminder.service.js";
import { logger } from "../utils/logger.js";

const TERMINAL = new Set([
  AppointmentStatus.COMPLETED,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
]);

function parseDay(dateStr) {
  if (!dateStr) return null;
  const day = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(day.getTime())) {
    throw new AppError("Invalid date", "INVALID_DATE", 400);
  }
  return day;
}

async function clinicDayBounds(ctx, dateStr) {
  const timeZone = await getClinicTimezone(ctx.clinicId);
  return zonedDayBounds(dateStr, timeZone);
}

export async function listAppointments(ctx, doctorId, dateStr, status) {
  const where = { clinicId: ctx.clinicId };
  if (doctorId) {
    where.doctorId = doctorId;
  }
  if (dateStr) {
    const bounds = await clinicDayBounds(ctx, dateStr);
    where.startTime = { gte: bounds.start, lt: bounds.end };
  }
  if (status) {
    where.status = status;
  }
  return prisma.appointment.findMany({ where, orderBy: { startTime: "asc" } });
}

const STATUS_COUNTS = [
  AppointmentStatus.PENDING,
  AppointmentStatus.CONFIRMED,
  AppointmentStatus.COMPLETED,
  AppointmentStatus.CANCELLED,
  AppointmentStatus.NO_SHOW,
];

export async function dashboardStats(ctx, dateStr) {
  const timeZone = await getClinicTimezone(ctx.clinicId);
  const effectiveDate = dateStr ?? zonedTodayStr(timeZone);
  parseDay(effectiveDate);
  const bounds = await clinicDayBounds(ctx, effectiveDate);
  const where = {
    clinicId: ctx.clinicId,
    startTime: { gte: bounds.start, lt: bounds.end },
  };

  const [total, byStatus] = await Promise.all([
    prisma.appointment.count({ where }),
    Promise.all(
      STATUS_COUNTS.map((status) =>
        prisma.appointment.count({ where: { ...where, status } }).then((count) => ({ status, count }))
      )
    ),
  ]);

  return { date: effectiveDate, total, byStatus };
}

export async function bookAppointment(ctx, input) {
  await assertPlanLimit(ctx, "appointments");
  const data = validate(bookAppointmentSchema, input);

  const doctor = await prisma.doctor.findFirst({
    where: { id: data.doctorId, user: { clinicId: ctx.clinicId } },
  });
  if (!doctor) {
    throw notFound("Doctor not found in this clinic");
  }
  const patient = await prisma.patient.findFirst({
    where: { id: data.patientId, clinicId: ctx.clinicId, deletedAt: null },
  });
  if (!patient) {
    throw notFound("Patient not found");
  }

  const startTime = data.startTime instanceof Date ? data.startTime : new Date(data.startTime);
  if (Number.isNaN(startTime.getTime())) {
    throw new AppError("Invalid start time", "INVALID_START_TIME", 400);
  }
  const timeZone = await getClinicTimezone(ctx.clinicId);
  const dateStr = zonedDateStr(startTime, timeZone);

  const slots = await doctorSlots(ctx, data.doctorId, dateStr);
  const slot = slots.find((s) => s.startTime.getTime() === startTime.getTime());
  if (!slot) {
    throw new AppError("That time is not an available slot", "SLOT_UNAVAILABLE", 409);
  }
  if (slot.booked) {
    throw new AppError("That slot is already booked", "SLOT_TAKEN", 409);
  }

  const appointment = await prisma.appointment.create({
    data: {
      clinicId: ctx.clinicId,
      doctorId: data.doctorId,
      patientId: data.patientId,
      startTime,
      endTime: slot.endTime,
      type: data.type ?? AppointmentType.IN_PERSON,
      note: data.note ?? null,
    },
  });

  // M11: notify staff and schedule T24H/T1H reminders for upcoming appointments.
  await notifyClinicStaff({
    clinicId: ctx.clinicId,
    excludeUserId: ctx.userId,
    type: "APPOINTMENT_BOOKED",
    title: "New appointment booked",
    body: `${patient.name} at ${startTime.toISOString()}`,
  }).catch((err) => logger.warn("notification dispatch failed", { error: err.message }));
  await scheduleReminders(appointment).catch((err) =>
    logger.warn("reminder scheduling failed", { error: err.message })
  );

  return appointment;
}async function getAppointment(ctx, id) {
  const appointment = await prisma.appointment.findFirst({
    where: { id, clinicId: ctx.clinicId },
  });
  if (!appointment) {
    throw notFound("Appointment not found");
  }
  return appointment;
}

export async function confirmAppointment(ctx, id) {
  const appointment = await getAppointment(ctx, id);
  if (TERMINAL.has(appointment.status)) {
    throw new AppError(`Cannot confirm a ${appointment.status} appointment`, "INVALID_STATUS", 400);
  }
  const updated = await prisma.appointment.update({ where: { id }, data: { status: AppointmentStatus.CONFIRMED } });
  await notifyClinicStaff({
    clinicId: ctx.clinicId,
    excludeUserId: ctx.userId,
    type: "APPOINTMENT_CONFIRMED",
    title: "Appointment confirmed",
    body: `${appointment.startTime.toISOString()}`,
  }).catch((err) => logger.warn("notification dispatch failed", { error: err.message }));
  return updated;
}

export async function completeAppointment(ctx, id) {
  const appointment = await getAppointment(ctx, id);
  if (appointment.status !== AppointmentStatus.CONFIRMED) {
    throw new AppError("Only confirmed appointments can be completed", "INVALID_STATUS", 400);
  }
  const updated = await prisma.appointment.update({ where: { id }, data: { status: AppointmentStatus.COMPLETED } });
  await notifyClinicStaff({
    clinicId: ctx.clinicId,
    excludeUserId: ctx.userId,
    type: "APPOINTMENT_COMPLETED",
    title: "Appointment completed",
    body: `${appointment.startTime.toISOString()}`,
  }).catch((err) => logger.warn("notification dispatch failed", { error: err.message }));
  return updated;
}

export async function cancelAppointment(ctx, id, cancelReason) {
  const data = validate(cancelAppointmentSchema, { cancelReason });
  const appointment = await getAppointment(ctx, id);
  if (TERMINAL.has(appointment.status)) {
    throw new AppError(`Cannot cancel a ${appointment.status} appointment`, "INVALID_STATUS", 400);
  }
  const updated = await prisma.appointment.update({
    where: { id },
    data: {
      status: AppointmentStatus.CANCELLED,
      cancelReason: data.cancelReason ?? null,
      cancelledAt: new Date(),
    },
  });
  await notifyClinicStaff({
    clinicId: ctx.clinicId,
    excludeUserId: ctx.userId,
    type: "APPOINTMENT_CANCELLED",
    title: "Appointment cancelled",
    body: `${appointment.startTime.toISOString()}${data.cancelReason ? ` — ${data.cancelReason}` : ""}`,
  }).catch((err) => logger.warn("notification dispatch failed", { error: err.message }));
  return updated;
}

export async function markNoShow(ctx, id) {
  const appointment = await getAppointment(ctx, id);
  if (TERMINAL.has(appointment.status)) {
    throw new AppError(`Cannot mark a ${appointment.status} appointment as no-show`, "INVALID_STATUS", 400);
  }
  const updated = await prisma.appointment.update({ where: { id }, data: { status: AppointmentStatus.NO_SHOW } });
  await notifyClinicStaff({
    clinicId: ctx.clinicId,
    excludeUserId: ctx.userId,
    type: "APPOINTMENT_NO_SHOW",
    title: "Appointment no-show",
    body: `${appointment.startTime.toISOString()}`,
  }).catch((err) => logger.warn("notification dispatch failed", { error: err.message }));
  return updated;
}
