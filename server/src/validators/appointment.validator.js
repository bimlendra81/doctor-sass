import { z } from "zod";
import { AppointmentType } from "@doctor-sass/shared";

export const bookAppointmentSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  startTime: z.coerce.date(),
  type: z.enum([AppointmentType.IN_PERSON, AppointmentType.VIDEO]).optional(),
  note: z.string().trim().max(500).optional(),
});

export const cancelAppointmentSchema = z.object({
  cancelReason: z.string().trim().max(300).optional(),
});
