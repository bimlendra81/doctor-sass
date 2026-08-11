import { authResolvers } from "./auth.resolver.js";
import { clinicsResolvers } from "./clinics.resolver.js";
import { patientsResolvers } from "./patients.resolver.js";
import { appointmentsResolvers } from "./appointments.resolver.js";
import { doctorsResolvers } from "./doctors.resolver.js";
import { settingsResolvers } from "./settings.resolver.js";

export const resolvers = {
  Query: {
    ping: () => "pong",
    ...authResolvers.Query,
    ...clinicsResolvers.Query,
    ...patientsResolvers.Query,
    ...appointmentsResolvers.Query,
    ...doctorsResolvers.Query,
    ...settingsResolvers.Query,
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...clinicsResolvers.Mutation,
    ...patientsResolvers.Mutation,
    ...appointmentsResolvers.Mutation,
    ...doctorsResolvers.Mutation,
    ...settingsResolvers.Mutation,
  },
  Appointment: appointmentsResolvers.Appointment,
  Doctor: doctorsResolvers.Doctor,
  ScheduleOverride: doctorsResolvers.ScheduleOverride,
  DateTime: {
    __serialize: (value) => new Date(value).toISOString(),
    __parseValue: (value) => new Date(value),
    __parseLiteral: (ast) => new Date(ast.value),
  },
};
