import { AppointmentStatus, Role } from "@doctor-sass/shared";
import { prisma } from "../config/db.js";
import { AppError, forbidden, notFound, unauthorized } from "../utils/errors.js";
import { zonedDayBounds, zonedDayOfWeek, zonedTimeToUtc, zonedTodayStr } from "../utils/timezone.js";
import { validate } from "../utils/validate.js";
import {
  deleteAvailabilitySchema,
  doctorProfileSchema,
  scheduleOverrideSchema,
  setAvailabilitySchema,
} from "../validators/availability.validator.js";
import { getClinicTimezone } from "./clinic.service.js";

export const SLOT_DEFAULT = 30;

export function dateToUtcMidnight(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export async function getDoctorInClinic(ctx, doctorId) {
  const doctor = await prisma.doctor.findFirst({
    where: { id: doctorId, user: { clinicId: ctx.clinicId } },
  });
  if (!doctor) {
    throw notFound("Doctor not found in this clinic");
  }
  return doctor;
}

export async function upsertDoctorProfile(user, input) {
  if (user.role !== Role.DOCTOR) {
    throw forbidden("Only doctors can manage a doctor profile");
  }
  const data = validate(doctorProfileSchema, input);
  return prisma.doctor.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });
}

export async function listDoctors(ctx) {
  return prisma.doctor.findMany({
    where: { user: { clinicId: ctx.clinicId, role: Role.DOCTOR } },
    include: {
      user: { select: { id: true, name: true, email: true, role: true, clinicId: true, emailVerified: true, phone: true, createdAt: true } },
      availabilities: true,
    },
    orderBy: { user: { name: "asc" } },
  });
}

export async function getDoctor(ctx, id) {
  const doctor = await prisma.doctor.findFirst({
    where: { id, user: { clinicId: ctx.clinicId } },
    include: {
      user: { select: { id: true, name: true, email: true, role: true, clinicId: true, emailVerified: true, phone: true, createdAt: true } },
      availabilities: true,
    },
  });
  if (!doctor) {
    throw notFound("Doctor not found in this clinic");
  }
  return doctor;
}

async function effectiveDoctorId(ctx, inputDoctorId) {
  const { user } = ctx;
  if (!user) {
    throw unauthorized("Authentication required");
  }
  if (user.role === Role.DOCTOR) {
    const doctor = await prisma.doctor.findUnique({ where: { userId: user.id } });
    if (!doctor) {
      throw new AppError("Create your doctor profile first", "NO_DOCTOR_PROFILE", 400);
    }
    if (inputDoctorId && inputDoctorId !== doctor.id) {
      throw forbidden("You can only manage your own availability");
    }
    return doctor.id;
  }
  if (user.role === Role.CLINIC_ADMIN) {
    if (inputDoctorId) {
      await getDoctorInClinic(ctx, inputDoctorId);
      return inputDoctorId;
    }
    throw new AppError("Choose a doctor", "DOCTOR_REQUIRED", 400);
  }
  throw forbidden("Only doctors or clinic admins can manage availability");
}

export async function setAvailability(ctx, input) {
  const data = validate(setAvailabilitySchema, input);
  const doctorId = await effectiveDoctorId(ctx, data.doctorId);

  const existing = await prisma.doctorAvailability.findFirst({
    where: { doctorId, dayOfWeek: data.dayOfWeek },
  });

  if (existing) {
    return prisma.doctorAvailability.update({
      where: { id: existing.id },
      data: {
        startTime: data.startTime,
        endTime: data.endTime,
        slotDuration: data.slotDuration ?? existing.slotDuration,
      },
    });
  }
  return prisma.doctorAvailability.create({
    data: {
      clinicId: ctx.clinicId,
      doctorId,
      dayOfWeek: data.dayOfWeek,
      startTime: data.startTime,
      endTime: data.endTime,
      slotDuration: data.slotDuration ?? SLOT_DEFAULT,
    },
  });
}

export async function deleteAvailability(ctx, dayOfWeek) {
  validate(deleteAvailabilitySchema, { dayOfWeek });
  const doctorId = await effectiveDoctorId(ctx, undefined);
  const existing = await prisma.doctorAvailability.findFirst({ where: { doctorId, dayOfWeek } });
  if (existing) {
    await prisma.doctorAvailability.delete({ where: { id: existing.id } });
  }
  return true;
}

export async function createScheduleOverride(ctx, input) {
  const data = validate(scheduleOverrideSchema, input);
  const doctorId = await effectiveDoctorId(ctx, data.doctorId);
  const date = dateToUtcMidnight(data.date);

  return prisma.scheduleOverride.upsert({
    where: { doctorId_date: { doctorId, date } },
    create: {
      clinicId: ctx.clinicId,
      doctorId,
      date,
      startTime: data.startTime,
      endTime: data.endTime,
      reason: data.reason ?? null,
    },
    update: {
      startTime: data.startTime,
      endTime: data.endTime,
      reason: data.reason ?? null,
    },
  });
}

export async function deleteScheduleOverride(ctx, id) {
  const override = await prisma.scheduleOverride.findUnique({ where: { id } });
  if (!override) {
    return true;
  }
  await effectiveDoctorId(ctx, override.doctorId);
  await prisma.scheduleOverride.delete({ where: { id } });
  return true;
}

export async function getDoctorAvailability(ctx, doctorId, dateStr) {
  const doctor = await getDoctorInClinic(ctx, doctorId);
  const [weekly, overrides] = await Promise.all([
    prisma.doctorAvailability.findMany({ where: { doctorId: doctor.id }, orderBy: { dayOfWeek: "asc" } }),
    dateStr
      ? prisma.scheduleOverride.findMany({
          where: { doctorId: doctor.id, date: { gte: dateToUtcMidnight(dateStr), lte: dateToUtcMidnight(dateStr) } },
        })
      : prisma.scheduleOverride.findMany({
          where: { doctorId: doctor.id },
          orderBy: { date: "desc" },
          take: 30,
        }),
  ]);
  return { weekly, overrides };
}

export async function doctorSlots(ctx, doctorId, dateStr) {
  await getDoctorInClinic(ctx, doctorId);
  const timeZone = await getClinicTimezone(ctx.clinicId);

  const dayStart = zonedTimeToUtc(dateStr, "00:00", timeZone);
  const { end: dayEnd } = zonedDayBounds(dateStr, timeZone);

  const override = await prisma.scheduleOverride.findUnique({
    where: { doctorId_date: { doctorId, date: dateToUtcMidnight(dateStr) } },
  });

  const rules = override
    ? [{ startTime: override.startTime, endTime: override.endTime, slotDuration: SLOT_DEFAULT }]
    : await prisma.doctorAvailability.findMany({
        where: { doctorId, dayOfWeek: zonedDayOfWeek(dateStr, timeZone) },
        orderBy: { startTime: "asc" },
      });

  const slots = [];
  const now = new Date();
  const isToday = dateStr === zonedTodayStr(timeZone);

  for (const rule of rules) {
    const dur = rule.slotDuration || SLOT_DEFAULT;
    const ruleEnd = zonedTimeToUtc(dateStr, rule.endTime, timeZone);
    let cursor = zonedTimeToUtc(dateStr, rule.startTime, timeZone);

    while (cursor.getTime() + dur * 60000 <= ruleEnd.getTime()) {
      const slotEnd = new Date(cursor.getTime() + dur * 60000);
      if (!(isToday && slotEnd.getTime() <= now.getTime())) {
        slots.push({ startTime: cursor, endTime: slotEnd });
      }
      cursor = slotEnd;
    }
  }

  const appointments = await prisma.appointment.findMany({
    where: { doctorId, startTime: { gte: dayStart, lt: dayEnd } },
    select: { id: true, startTime: true, endTime: true, status: true },
  });
  const active = appointments.filter((a) => a.status !== AppointmentStatus.CANCELLED);

  return slots.map((slot) => {
    const hit = active.find((a) => a.startTime < slot.endTime && a.endTime > slot.startTime);
    return {
      startTime: slot.startTime,
      endTime: slot.endTime,
      booked: !!hit,
      appointmentId: hit?.id ?? null,
      status: hit?.status ?? null,
    };
  });
}
