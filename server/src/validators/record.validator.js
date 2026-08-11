import { z } from "zod";
import { isAllowedMime, MAX_UPLOAD_BYTES } from "../services/storage.service.js";

const RECORD_TYPES = ["LAB", "IMAGING", "CLINICAL_NOTE", "REFERRAL", "OTHER"];

export const createRecordSchema = z.object({
  patientId: z.string().uuid("Invalid patient id"),
  doctorId: z.string().uuid("Invalid doctor id").optional(),
  type: z.enum(RECORD_TYPES, { message: "Invalid record type" }),
  title: z.string().trim().min(1, "Title is required").max(200),
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  fileKey: z.string().max(500).optional().or(z.literal("")),
  fileName: z.string().trim().max(255).optional().or(z.literal("")),
  mimeType: z.string().max(100).optional().or(z.literal("")),
  sizeBytes: z.number().int().positive().max(MAX_UPLOAD_BYTES).optional(),
});

export const updateRecordSchema = z.object({
  title: z.string().trim().min(1, "Title is required").max(200).optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});

export function assertAllowedMime(mimeType) {
  return isAllowedMime(mimeType);
}
