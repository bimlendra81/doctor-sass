import { prisma } from "../../config/db.js";
import * as prescriptionService from "../../services/prescription.service.js";
import { drugSearch } from "../../services/pharmacy/drug.service.js";

export const prescriptionsResolvers = {
  Query: {
    prescriptions: (_parent, args, ctx) =>
      prescriptionService.listPrescriptions(ctx, {
        patientId: args.patientId,
        doctorId: args.doctorId,
        status: args.status,
      }),
    prescription: (_parent, args, ctx) => prescriptionService.getPrescription(ctx, args.id),
    drugSearch: (_parent, args) => drugSearch(args.q, args.limit),
  },
  Mutation: {
    createPrescription: (_parent, args, ctx) => prescriptionService.createPrescription(ctx, args.input),
    updatePrescription: (_parent, args, ctx) =>
      prescriptionService.updatePrescription(ctx, args.id, args.input),
    issuePrescription: (_parent, args, ctx) => prescriptionService.issuePrescription(ctx, args.id),
    voidPrescription: (_parent, args, ctx) => prescriptionService.voidPrescription(ctx, args.id, args.reason),
  },
  Prescription: {
    patient: (prescription) =>
      prisma.patient.findUnique({ where: { id: prescription.patientId } }),
    doctor: (prescription) =>
      prisma.doctor.findUnique({ where: { id: prescription.doctorId } }),
    appointment: (prescription) =>
      prescription.appointmentId
        ? prisma.appointment.findUnique({ where: { id: prescription.appointmentId } })
        : null,
    items: (prescription) =>
      prescription.items ?? prisma.prescriptionItem.findMany({ where: { prescriptionId: prescription.id } }),
  },
};
