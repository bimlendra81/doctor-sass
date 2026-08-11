import { prisma } from "../../config/db.js";
import * as recordService from "../../services/record.service.js";

export const recordsResolvers = {
  Query: {
    records: (_parent, args, ctx) => recordService.listRecords(ctx, args),
    record: (_parent, args, ctx) => recordService.getRecord(ctx, args.id),
    recordFileUrl: (_parent, args, ctx) => recordService.recordFileUrl(ctx, args.id),
  },
  Mutation: {
    recordUploadUrl: (_parent, args, ctx) => recordService.recordUploadUrl(ctx, args),
    createRecord: (_parent, args, ctx) => recordService.createRecord(ctx, args.input),
    updateRecord: (_parent, args, ctx) => recordService.updateRecord(ctx, args.id, args.input),
    deleteRecord: (_parent, args, ctx) => recordService.deleteRecord(ctx, args.id),
  },
  MedicalRecord: {
    patient: (record) => prisma.patient.findUnique({ where: { id: record.patientId } }),
    doctor: (record) => prisma.doctor.findUnique({ where: { id: record.doctorId } }),
  },
};
