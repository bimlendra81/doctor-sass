import { z } from "zod";
import { Plan, Role } from "@doctor-sass/shared";

export const createClinicSchema = z.object({
  name: z.string().trim().min(2, "Clinic name must be at least 2 characters").max(120),
  subdomain: z.string().trim().min(2).max(63),
  plan: z.enum([Plan.FREE, Plan.PRO, Plan.ENTERPRISE]).optional(),
});

const inviteRoles = [Role.DOCTOR, Role.STAFF];

export const inviteSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  role: z.enum(inviteRoles, { message: "Only DOCTOR or STAFF can be invited" }),
  specialization: z.string().trim().max(100).optional(),
});

export const acceptInviteSchema = z.object({
  inviteToken: z.string().min(1),
  name: z.string().trim().min(2).max(100).optional(),
  password: z.string().min(8, "Password must be at least 8 characters").max(72),
  phone: z.string().trim().max(20).optional(),
});
