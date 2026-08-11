import { z } from "zod";

export const PAYMENT_METHODS = ["CASH", "CARD", "ONLINE"];

export const invoiceItemSchema = z.object({
  description: z.string().trim().min(1, "Description is required").max(200),
  qty: z.coerce.number().int().min(1, "Quantity must be at least 1").max(10000),
  unitPrice: z.coerce.number().min(0).max(10000000),
});

export const createInvoiceSchema = z.object({
  patientId: z.string().min(1),
  appointmentId: z.string().min(1).optional(),
  items: z.array(invoiceItemSchema).min(1, "At least one line item is required").max(50),
  taxRate: z.coerce.number().min(0).max(100).optional(),
  dueDate: z.union([z.string(), z.date()]).optional(),
});

export const recordPaymentSchema = z.object({
  invoiceId: z.string().min(1),
  amount: z.coerce.number().positive("Payment amount must be positive"),
  method: z.enum(PAYMENT_METHODS).default("CASH"),
  stripePaymentId: z.string().trim().max(200).optional(),
  note: z.string().trim().max(300).optional(),
});

export const voidInvoiceSchema = z.object({
  reason: z.string().trim().min(1, "Void reason is required").max(300),
});
