import { z } from "zod";

export const createPatientSchema = z.object({
  name: z.string().trim().min(2, "Patient name is required").max(100),
  email: z.string().trim().toLowerCase().pipe(z.email()).optional().or(z.literal("")),
  phone: z.string().trim().max(20).optional().or(z.literal("")),
  dob: z.string().refine((v) => !Number.isNaN(Date.parse(v)), "Invalid date").optional().or(z.literal("")),
  gender: z.string().trim().max(20).optional().or(z.literal("")),
  bloodGroup: z.string().trim().max(10).optional().or(z.literal("")),
  address: z.string().trim().max(300).optional().or(z.literal("")),
});

export const updatePatientSchema = createPatientSchema.partial();
