import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type FlatCandidate = {
  id: string;
  title?: string;
  location?: string;
  country?: string;
  sizeAcres?: number | null;
  sizeM2?: number | null;
  priceUSD?: number | null;
  priceEUR?: number | null;
  score?: number | null;
  sourceUrl?: string | null;
  status?: string | null;
};

type ScoutEntry = {
  id: string;
  country?: string;
  region?: string;
  municipality?: string;
  source?: string;
  sourceUrl?: string | null;
  listingType?: string;
  priceEUR?: number | null;
  sizeM2?: number | null;
  score?: number | null;
  status?: string | null;
};

type ScoutTable = {
  entries: ScoutEntry[];
};

type NormalizedCandidate = {
  id: string;
  title: string;
  location: string;
  country?: string | null;
  sizeAcres?: number | null;
  priceUSD?: number | null;
  score?: number | null;
  sourceUrl?: string | null;
  status?: string | null;
};

function parseArg(name: string): string {
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index === -1) return "";
  return process.argv[index + 1] ?? "";
}

function pickSourceFile(): string {
  const argFile = parseArg("file");
  if (argFile) return path.resolve(argFile);

  const candidates = [
    "../../site/data/candidates.json",
    "../../docs/EU_PARCEL_TABLE_V1.json",
  ].map((candidate) => path.resolve(candidate));

  const file = candidates.find((candidate) => fs.existsSync(candidate));
  if (file) return file;

  throw new Error(`Missing source file. Looked for: ${candidates.join(", ")}`);
}

function isScoutTable(value: unknown): value is ScoutTable {
  return !!value && typeof value === "object" && Array.isArray((value as ScoutTable).entries);
}

function formatWords(value: string): string {
  return value
    .split(/[-_]/g)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function countryName(code: string | undefined): string {
  const names: Record<string, string> = {
    CH: "Switzerland",
    DE: "Germany",
    ES: "Spain",
    PT: "Portugal",
  };

  return names[code ?? ""] ?? (code?.trim() || "");
}

function toAcres(sizeM2: number | null | undefined): number | null {
  if (!Number.isFinite(sizeM2) || !sizeM2 || sizeM2 <= 0) return null;
  return Math.round(sizeM2 * 0.000247105 * 100) / 100;
}

function joinLocation(parts: Array<string | undefined>): string {
  return Array.from(new Set(parts
    .map((part) => part?.trim())
    .filter((part): part is string => !!part && part !== "TBD")
  )).join(", ");
}

function normalizeFlatCandidate(candidate: FlatCandidate): NormalizedCandidate {
  return {
    id: candidate.id,
    title: candidate.title?.trim() || candidate.id,
    location: candidate.location?.trim() || countryName(candidate.country) || "Location pending",
    country: candidate.country?.trim() || null,
    sizeAcres: candidate.sizeAcres ?? toAcres(candidate.sizeM2) ?? null,
    // Keep EUR-denominated scout rows null here until we have a real FX normalization step.
    priceUSD: candidate.priceUSD ?? null,
    score: candidate.score ?? null,
    sourceUrl: candidate.sourceUrl ?? null,
    status: candidate.status?.trim() || "candidate",
  };
}

function normalizeScoutEntry(entry: ScoutEntry): NormalizedCandidate {
  const region = entry.region?.trim() || countryName(entry.country) || "EU";
  const listingLabel = entry.listingType?.trim()
    ? formatWords(entry.listingType)
    : "Scout Lead";

  return {
    id: entry.id,
    title: `${region} ${listingLabel}`.trim(),
    location: joinLocation([
      entry.municipality,
      entry.region,
      countryName(entry.country),
    ]) || "EU",
    country: entry.country?.trim() || null,
    sizeAcres: toAcres(entry.sizeM2),
    priceUSD: null,
    score: entry.score ?? null,
    sourceUrl: entry.sourceUrl ?? null,
    status: "lane",
  };
}

function loadCandidates(file: string): NormalizedCandidate[] {
  const raw = JSON.parse(fs.readFileSync(file, "utf-8")) as FlatCandidate[] | ScoutTable;

  if (Array.isArray(raw)) {
    return raw.map(normalizeFlatCandidate);
  }

  if (isScoutTable(raw)) {
    return raw.entries.map(normalizeScoutEntry);
  }

  throw new Error(`Unsupported import payload in ${file}`);
}

async function main() {
  const file = pickSourceFile();
  const candidates = loadCandidates(file);

  for (const c of candidates) {
    await prisma.parcel.upsert({
      where: { externalId: c.id },
      update: {
        title: c.title,
        location: c.location,
        country: c.country ?? null,
        sizeAcres: c.sizeAcres ?? null,
        priceUsd: c.priceUSD ?? null,
        score: c.score ?? null,
        sourceUrl: c.sourceUrl ?? null,
        status: c.status ?? "candidate",
      },
      create: {
        externalId: c.id,
        title: c.title,
        location: c.location,
        country: c.country ?? null,
        sizeAcres: c.sizeAcres ?? null,
        priceUsd: c.priceUSD ?? null,
        score: c.score ?? null,
        sourceUrl: c.sourceUrl ?? null,
        status: c.status ?? "candidate",
      },
    });
  }

  console.log(`Imported ${candidates.length} candidates into parcels table from ${file}.`);
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
