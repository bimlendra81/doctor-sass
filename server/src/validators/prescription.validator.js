import { z } from "zod";

export const prescriptionItemSchema = z.object({
  drugName: z.string().trim().min(1, "Drug name is required").max(200),
  dosage: z.string().trim().max(100).optional(),
  frequency: z.string().trim().max(100).optional(),
  duration: z.string().trim().max(100).optional(),
  instructions: z.string().trim().max(500).optional(),
  strength: z.string().trim().max(100).optional(),
  quantity: z.coerce.number().int().positive("Quantity must be positive").optional(),
  refills: z.coerce.number().int().min(0).max(12, "Refills cannot exceed 12").optional(),
});

export const createPrescriptionSchema = z.object({
  patientId: z.string().min(1),
  doctorId: z.string().min(1),
  appointmentId: z.string().min(1).optional(),
  notes: z.string().trim().max(1000).optional(),
  items: z.array(prescriptionItemSchema).min(1, "At least one item is required").max(50),
});

export const updatePrescriptionSchema = z.object({
  notes: z.string().trim().max(1000).optional(),
  items: z.array(prescriptionItemSchema).min(1, "At least one item is required").max(50).optional(),
});

export const voidPrescriptionSchema = z.object({
  reason: z.string().trim().min(1, "Void reason is required").max(300),
});
