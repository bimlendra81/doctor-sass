import { z } from "zod";

const TIME_RE = /^\d{2}:\d{2}$/;
const DAY_MSG = "dayOfWeek must be 0 (Sunday) through 6 (Saturday)";

const timeWindow = (schema) =>
  schema.refine((v) => v.startTime < v.endTime, "Start time must be before end time");

export const doctorProfileSchema = z.object({
  specialization: z.string().trim().max(100).optional().or(z.literal("")),
  licenseNo: z.string().trim().max(50).optional().or(z.literal("")),
  bio: z.string().trim().max(1000).optional().or(z.literal("")),
});

export const setAvailabilitySchema = timeWindow(
  z.object({
    dayOfWeek: z.number().int().min(0).max(6, DAY_MSG),
    startTime: z.string().regex(TIME_RE, "Start time must be HH:mm"),
    endTime: z.string().regex(TIME_RE, "End time must be HH:mm"),
    slotDuration: z.number().int().min(10).max(120).optional(),
    doctorId: z.string().min(1).optional(),
  })
);

export const deleteAvailabilitySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6, DAY_MSG),
});

export const scheduleOverrideSchema = timeWindow(
  z.object({
    doctorId: z.string().min(1),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    startTime: z.string().regex(TIME_RE, "Start time must be HH:mm"),
    endTime: z.string().regex(TIME_RE, "End time must be HH:mm"),
    reason: z.string().trim().max(300).optional(),
  })
);
