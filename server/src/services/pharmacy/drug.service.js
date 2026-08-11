import Fuse from "fuse.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "../../config/db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

let dict = [];
try {
  dict = JSON.parse(readFileSync(join(__dirname, "drugs.json"), "utf8"));
} catch {
  dict = [];
}

const fuse = new Fuse(dict, {
  keys: [
    { name: "name", weight: 0.7 },
    { name: "category", weight: 0.3 },
  ],
  threshold: 0.35,
  includeScore: true,
  ignoreLocation: true,
});

export async function drugSearch(q, limit = 10) {
  const query = q?.trim();
  if (!query) return [];

  const capped = Math.min(Math.max(limit ?? 10, 1), 50);
  const results = fuse.search(query, { limit: capped });
  const names = results.map((r) => r.item.name);

  // Merge DB records for entries not in the shipped dict (e.g. future additions).
  const dbRecords = await prisma.drug.findMany({
    where: { name: { in: names } },
  });
  const byName = new Map(dbRecords.map((d) => [d.name, d]));

  return results.map((r) => ({
    id: byName.get(r.item.name)?.id ?? r.item.name,
    name: r.item.name,
    category: r.item.category ?? null,
    uses: r.item.uses ?? null,
    sideEffects: r.item.sideEffects ?? null,
    strength: r.item.strength ?? null,
    packSize: r.item.packSize ?? null,
    manufacturer: r.item.manufacturer ?? null,
  }));
}
