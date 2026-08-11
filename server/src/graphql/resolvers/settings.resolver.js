import * as settingsService from "../../services/settings.service.js";

export const settingsResolvers = {
  Query: {
    clinicSettings: (_parent, _args, ctx) => settingsService.getClinicSettings(ctx.clinicId),
  },
  Mutation: {
    updateClinicSettings: (_parent, args, ctx) =>
      settingsService.updateClinicSettings(ctx, args.input),
  },
};
