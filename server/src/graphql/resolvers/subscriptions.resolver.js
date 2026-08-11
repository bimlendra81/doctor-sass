import * as subscriptionService from "../../services/subscription.service.js";

export const subscriptionsResolvers = {
  Query: {
    subscriptionInfo: (_parent, _args, ctx) => subscriptionService.subscriptionInfo(ctx),
  },
  Mutation: {
    createCheckoutSession: (_parent, args, ctx) =>
      subscriptionService.createCheckoutSession(ctx, args.plan),
  },
};
