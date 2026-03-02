import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type Candidate = {
  id: string;
  title: string;
  location: string;
  sizeAcres?: number;
  priceUSD?: number;
  score?: number;
  sourceUrl?: string;
};

async function main() {
  const file = path.resolve("../../site/data/candidates.json");
  if (!fs.existsSync(file)) {
    throw new Error(`Missing source file: ${file}`);
  }

  const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as Candidate[];
  for (const c of raw) {
    await prisma.parcel.upsert({
      where: { externalId: c.id },
      update: {
        title: c.title,
        location: c.location,
        sizeAcres: c.sizeAcres ?? null,
        priceUsd: c.priceUSD ?? null,
        score: c.score ?? null,
        sourceUrl: c.sourceUrl ?? null,
      },
      create: {
        externalId: c.id,
        title: c.title,
        location: c.location,
        sizeAcres: c.sizeAcres ?? null,
        priceUsd: c.priceUSD ?? null,
        score: c.score ?? null,
        sourceUrl: c.sourceUrl ?? null,
      },
    });
  }

  console.log(`Imported ${raw.length} candidates into parcels table.`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
