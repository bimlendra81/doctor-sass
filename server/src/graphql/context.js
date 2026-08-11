import DataLoader from "dataloader";
import { prisma } from "../config/db.js";

/**
 * Builds the per-request GraphQL context.
 * `clinicId` always comes from the decoded JWT (or null) — never from client
 * arguments, so a tenant can never query another tenant's data.
 */
export function buildContext({ user, req }) {
  const clinicId = user?.clinicId ?? null;

  return {
    prisma,
    user,
    userId: user?.id ?? null,
    clinicId,
    req,
    loaders: {
      clinicById: new DataLoader(async (ids) => {
        const rows = await prisma.clinic.findMany({ where: { id: { in: [...ids] } } });
        return ids.map((id) => rows.find((r) => r.id === id) ?? null);
      }),
      userById: new DataLoader(async (ids) => {
        const rows = await prisma.user.findMany({ where: { id: { in: [...ids] } } });
        return ids.map((id) => rows.find((r) => r.id === id) ?? null);
      }),
      doctorById: new DataLoader(async (ids) => {
        const rows = await prisma.doctor.findMany({ where: { id: { in: [...ids] } } });
        return ids.map((id) => rows.find((r) => r.id === id) ?? null);
      }),
      patientById: new DataLoader(async (ids) => {
        const rows = await prisma.patient.findMany({ where: { id: { in: [...ids] } } });
        return ids.map((id) => rows.find((r) => r.id === id) ?? null);
      }),
    },
  };
}
