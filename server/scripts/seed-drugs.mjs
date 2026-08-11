// seed-drugs.mjs
// Deterministic, idempotent seed of the Drug dictionary for M8 (E-Prescriptions).
// Reads the curated dict at src/services/pharmacy/drugs.json and upserts rows by name.
// Usage: node scripts/seed-drugs.mjs

import { prisma } from "../src/config/db.js";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const drugs = JSON.parse(readFileSync(join(__dirname, "..", "src", "services", "pharmacy", "drugs.json"), "utf8"));

let upserted = 0;
for (const drug of drugs) {
  await prisma.drug.upsert({
    where: { name: drug.name },
    update: {
      category: drug.category,
      uses: drug.uses,
      sideEffects: drug.sideEffects,
      strength: drug.strength,
      packSize: drug.packSize,
      manufacturer: drug.manufacturer,
    },
    create: {
      name: drug.name,
      category: drug.category,
      uses: drug.uses,
      sideEffects: drug.sideEffects,
      strength: drug.strength,
      packSize: drug.packSize,
      manufacturer: drug.manufacturer,
    },
  });
  upserted++;
}

const count = await prisma.drug.count();
console.log(`seed-drugs: upserted ${upserted}, Drug table now has ${count} rows`);
await prisma.$disconnect();
