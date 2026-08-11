import { z } from "zod";
import { CURRENCIES, IANA_ZONES } from "@doctor-sass/shared";

const optionalText = (schema) => schema.optional().or(z.literal(""));

export const updateClinicSettingsSchema = z.object({
  name: z.string().trim().min(2, "Clinic name must be at least 2 characters").max(120).optional(),
  brandName: z.string().trim().min(1, "Brand name cannot be empty").max(120).optional().or(z.literal("")),
  logoUrl: z.string().trim().url("Logo URL must be a valid URL").max(500).optional().or(z.literal("")),
  timezone: z.enum(IANA_ZONES, "Choose a valid IANA timezone").optional(),
  contactEmail: z.string().trim().toLowerCase().pipe(z.email()).optional().or(z.literal("")),
  contactPhone: optionalText(z.string().trim().max(30)),
  currency: z.enum(CURRENCIES, "Choose a supported currency").optional(),
});
