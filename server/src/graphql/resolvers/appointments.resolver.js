import { prisma } from "../../config/db.js";
import * as appointmentService from "../../services/appointment.service.js";

export const appointmentsResolvers = {
  Query: {
    appointments: (_parent, args, ctx) =>
      appointmentService.listAppointments(ctx, args.doctorId, args.date, args.status),
    dashboard: (_parent, args, ctx) => appointmentService.dashboardStats(ctx, args.date),
  },
  Mutation: {
    bookAppointment: (_parent, args, ctx) => appointmentService.bookAppointment(ctx, args.input),
    confirmAppointment: (_parent, args, ctx) => appointmentService.confirmAppointment(ctx, args.id),
    completeAppointment: (_parent, args, ctx) => appointmentService.completeAppointment(ctx, args.id),
    cancelAppointment: (_parent, args, ctx) =>
      appointmentService.cancelAppointment(ctx, args.id, args.cancelReason),
    markNoShow: (_parent, args, ctx) => appointmentService.markNoShow(ctx, args.id),
  },
  Appointment: {
    patient: (appointment) =>
      prisma.patient.findUnique({ where: { id: appointment.patientId } }),
    doctor: (appointment) =>
      prisma.doctor.findUnique({ where: { id: appointment.doctorId } }),
  },
};
