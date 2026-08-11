import * as authService from "../../services/auth.service.js";

function userAgentFrom(ctx) {
  return ctx.req?.headers?.["user-agent"] ?? null;
}

export const authResolvers = {
  Query: {
    me: (_parent, _args, ctx) => ctx.loaders.userById.load(ctx.user.id),
  },
  Mutation: {
    signup: (_parent, args, ctx) => authService.signup(args.input, userAgentFrom(ctx)),
    login: (_parent, args, ctx) => authService.login(args.input, userAgentFrom(ctx)),
    refreshToken: (_parent, args, ctx) => authService.refreshToken(args.input, userAgentFrom(ctx)),
    logout: (_parent, args) => authService.logout(args.refreshToken),
    verifyEmail: (_parent, args) => authService.verifyEmail(args.token),
  },
};
