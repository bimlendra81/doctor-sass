import * as clinicService from "../../services/clinic.service.js";
import * as inviteService from "../../services/invite.service.js";

function userAgentFrom(ctx) {
  return ctx.req?.headers?.["user-agent"] ?? null;
}

export const clinicsResolvers = {
  Query: {
    clinic: (_parent, _args, ctx) => clinicService.getMyClinic(ctx.clinicId),
    clinicUsers: (_parent, _args, ctx) => clinicService.getClinicUsers(ctx.clinicId),
  },
  Mutation: {
    createClinic: (_parent, args, ctx) =>
      clinicService.createClinic(args.input, ctx.user.id, userAgentFrom(ctx)),
    inviteStaff: (_parent, args, ctx) => inviteService.inviteStaff(args.input, ctx),
    acceptInvite: (_parent, args, ctx) =>
      inviteService.acceptInvite(args.input, userAgentFrom(ctx)),
  },
};
