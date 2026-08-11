import * as portalService from "../../services/portal.service.js";

function userAgentFrom(ctx) {
  return ctx.req?.headers?.["user-agent"] ?? null;
}

export const portalResolvers = {
  Query: {
    myProfile: (_parent, _args, ctx) => portalService.myProfile(ctx),
    myAppointments: (_parent, args, ctx) =>
      portalService.myAppointments(ctx, { status: args.status, page: args.page, pageSize: args.pageSize }),
    myPrescriptions: (_parent, _args, ctx) => portalService.myPrescriptions(ctx),
    myInvoices: (_parent, _args, ctx) => portalService.myInvoices(ctx),
    myRecords: (_parent, _args, ctx) => portalService.myRecords(ctx),
    myRecordFileUrl: (_parent, args, ctx) => portalService.myRecordFileUrl(ctx, args.id),
    portalDoctors: (_parent, _args, ctx) => portalService.portalDoctors(ctx),
    portalDoctorSlots: (_parent, args, ctx) => portalService.portalDoctorSlots(ctx, args.doctorId, args.date),
  },
  Mutation: {
    patientInvite: (_parent, args, ctx) => portalService.patientInvite(ctx, args),
    acceptPatientInvite: (_parent, args, ctx) => portalService.acceptPatientInvite(args.input, userAgentFrom(ctx)),
    bookMyAppointment: (_parent, args, ctx) => portalService.bookMyAppointment(ctx, args.input),
    cancelMyAppointment: (_parent, args, ctx) => portalService.cancelMyAppointment(ctx, args.id, args.cancelReason),
    payInvoice: (_parent, args, ctx) => portalService.payInvoice(ctx, args.invoiceId),
  },
};
