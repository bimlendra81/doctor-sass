import { prisma } from "../../config/db.js";
import * as billingService from "../../services/billing.service.js";

const num = (value) => Number(value);
const toCents = (value) => Math.round(Number(value) * 100);

export const billingResolvers = {
  Query: {
    invoices: (_parent, args, ctx) =>
      billingService.listInvoices(ctx, {
        patientId: args.patientId,
        status: args.status,
        date: args.date,
      }),
    invoice: (_parent, args, ctx) => billingService.getInvoice(ctx, args.id),
  },
  Mutation: {
    createInvoice: (_parent, args, ctx) => billingService.createInvoice(ctx, args.input),
    voidInvoice: (_parent, args, ctx) => billingService.voidInvoice(ctx, args.id, args.reason),
    recordPayment: (_parent, args, ctx) => billingService.recordPayment(ctx, args.input),
  },
  Invoice: {
    patient: (invoice) => prisma.patient.findUnique({ where: { id: invoice.patientId } }),
    appointment: (invoice) =>
      invoice.appointmentId
        ? prisma.appointment.findUnique({ where: { id: invoice.appointmentId } })
        : null,
    items: (invoice) =>
      invoice.items ?? prisma.invoiceItem.findMany({ where: { invoiceId: invoice.id } }),
    payments: (invoice) =>
      invoice.payments ?? prisma.payment.findMany({ where: { invoiceId: invoice.id } }),
    subtotal: (invoice) => num(invoice.subtotal),
    tax: (invoice) => num(invoice.tax),
    total: (invoice) => num(invoice.total),
    balanceDue: (invoice) => {
      const total = toCents(invoice.total);
      const paid = (invoice.payments ?? []).reduce((sum, p) => sum + toCents(p.amount), 0);
      return (total - paid) / 100;
    },
  },
  InvoiceItem: {
    unitPrice: (item) => num(item.unitPrice),
    amount: (item) => num(item.amount),
  },
  Payment: {
    amount: (payment) => num(payment.amount),
  },
};
