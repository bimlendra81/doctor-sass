import DataLoader from "dataloader";
import { prisma } from "../../config/db.js";

export const clinicById = () =>
  new DataLoader(async (ids) => {
    const rows = await prisma.clinic.findMany({ where: { id: { in: [...ids] } } });
    return ids.map((id) => rows.find((r) => r.id === id) ?? null);
  });
