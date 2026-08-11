import * as notificationService from "../../services/notification.service.js";

export const notificationsResolvers = {
  Query: {
    myNotifications: (_parent, args, ctx) =>
      notificationService.listMyNotifications(ctx, {
        unreadOnly: args.unreadOnly ?? false,
        page: args.page,
        pageSize: args.pageSize,
      }),
    unreadNotificationCount: (_parent, _args, ctx) => notificationService.unreadNotificationCount(ctx),
    myNotificationPreferences: (_parent, _args, ctx) => notificationService.getMyPreferences(ctx),
  },
  Mutation: {
    markNotificationRead: (_parent, args, ctx) => notificationService.markNotificationRead(ctx, args.id),
    markAllNotificationsRead: (_parent, _args, ctx) => notificationService.markAllNotificationsRead(ctx),
    setNotificationPreference: (_parent, args, ctx) =>
      notificationService.setMyPreference(ctx, args.channel, args.enabled),
  },
};
