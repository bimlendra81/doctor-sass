import { z } from "zod";
import { AppointmentType } from "@doctor-sass/shared";

export const patientInviteSchema = z.object({
  patientId: z.string().min(1),
  email: z.string().trim().toLowerCase().pipe(z.email()),
});

export const acceptPatientInviteSchema = z.object({
  inviteToken: z.string().min(1),
  name: z.string().trim().min(2).max(100).optional(),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  phone: z.string().trim().max(20).optional(),
});

export const bookMyAppointmentSchema = z.object({
  doctorId: z.string().min(1),
  startTime: z.coerce.date(),
  type: z.enum([AppointmentType.IN_PERSON, AppointmentType.VIDEO]).optional(),
  note: z.string().trim().max(500).optional(),
});

export const cancelMyAppointmentSchema = z.object({
  cancelReason: z.string().trim().max(300).optional(),
});
