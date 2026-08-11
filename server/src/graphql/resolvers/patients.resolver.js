import * as patientService from "../../services/patient.service.js";

export const patientsResolvers = {
  Query: {
    patients: (_parent, args, ctx) => patientService.listPatients(ctx, args.search, args.page, args.pageSize),
    patient: (_parent, args, ctx) => patientService.getPatient(ctx, args.id),
  },
  Mutation: {
    createPatient: (_parent, args, ctx) => patientService.createPatient(ctx, args.input),
    updatePatient: (_parent, args, ctx) => patientService.updatePatient(ctx, args.id, args.input),
    deletePatient: (_parent, args, ctx) => patientService.deletePatient(ctx, args.id),
  },
};
