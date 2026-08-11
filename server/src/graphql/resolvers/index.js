import { authResolvers } from "./auth.resolver.js";
import { clinicsResolvers } from "./clinics.resolver.js";
import { patientsResolvers } from "./patients.resolver.js";
import { appointmentsResolvers } from "./appointments.resolver.js";
import { doctorsResolvers } from "./doctors.resolver.js";
import { settingsResolvers } from "./settings.resolver.js";
import { prescriptionsResolvers } from "./prescriptions.resolver.js";
import { billingResolvers } from "./billing.resolver.js";
import { subscriptionsResolvers } from "./subscriptions.resolver.js";
import { notificationsResolvers } from "./notifications.resolver.js";

export const resolvers = {
  Query: {
    ping: () => "pong",
    ...authResolvers.Query,
    ...clinicsResolvers.Query,
    ...patientsResolvers.Query,
    ...appointmentsResolvers.Query,
    ...doctorsResolvers.Query,
    ...settingsResolvers.Query,
    ...prescriptionsResolvers.Query,
    ...billingResolvers.Query,
    ...subscriptionsResolvers.Query,
    ...notificationsResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...clinicsResolvers.Mutation,
    ...patientsResolvers.Mutation,
    ...appointmentsResolvers.Mutation,
    ...doctorsResolvers.Mutation,
    ...settingsResolvers.Mutation,
    ...prescriptionsResolvers.Mutation,
    ...billingResolvers.Mutation,
    ...subscriptionsResolvers.Mutation,
    ...notificationsResolvers.Mutation,
  },
  Appointment: appointmentsResolvers.Appointment,
  Doctor: doctorsResolvers.Doctor,
  ScheduleOverride: doctorsResolvers.ScheduleOverride,
  Prescription: prescriptionsResolvers.Prescription,
  Invoice: billingResolvers.Invoice,
  InvoiceItem: billingResolvers.InvoiceItem,
  Payment: billingResolvers.Payment,
  DateTime: {
    __serialize: (value) => new Date(value).toISOString(),
    __parseValue: (value) => new Date(value),
    __parseLiteral: (ast) => new Date(ast.value),
  },
};
