import { prisma } from "../../config/db.js";
import * as availabilityService from "../../services/availability.service.js";

export const doctorsResolvers = {
  Query: {
    doctors: (_parent, _args, ctx) => availabilityService.listDoctors(ctx),
    doctor: (_parent, args, ctx) => availabilityService.getDoctor(ctx, args.id),
    doctorAvailability: (_parent, args, ctx) =>
      availabilityService.getDoctorAvailability(ctx, args.doctorId, args.date),
    doctorSlots: (_parent, args, ctx) =>
      availabilityService.doctorSlots(ctx, args.doctorId, args.date),
  },
  Mutation: {
    upsertDoctorProfile: (_parent, args, ctx) =>
      availabilityService.upsertDoctorProfile(ctx.user, args.input),
    setAvailability: (_parent, args, ctx) =>
      availabilityService.setAvailability(ctx, args.input),
    deleteAvailability: (_parent, args, ctx) =>
      availabilityService.deleteAvailability(ctx, args.dayOfWeek),
    createScheduleOverride: (_parent, args, ctx) =>
      availabilityService.createScheduleOverride(ctx, args.input),
    deleteScheduleOverride: (_parent, args, ctx) =>
      availabilityService.deleteScheduleOverride(ctx, args.id),
  },
  ScheduleOverride: {
    date: (override) => override.date.toISOString().slice(0, 10),
  },
  Doctor: {
    user: (doctor) =>
      doctor.user ?? prisma.user.findUnique({ where: { id: doctor.userId } }),
    availabilities: (doctor) =>
      doctor.availabilities ??
      prisma.doctorAvailability.findMany({ where: { doctorId: doctor.id } }),
  },
};
