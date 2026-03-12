import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

type ScoutEntry = {
  id: string;
  country?: string;
  region?: string;
  municipality?: string;
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

type JsonListing = {
  id: string;
  title: string;
  location: {
    country: string;
    region: string;
    city?: string;
  };
  sizeAcres: number;
  priceUSD: number;
  score?: number;
  sourceUrl: string;
};

type ParcelRecord = {
  externalId: string;
  title: string;
  location: string;
  country: string | null;
  sizeAcres: number | null;
  priceUsd: number | null;
  score: number | null;
  sourceUrl: string | null;
  status: string;
};

const EU_SEED_FILE = path.resolve("../../docs/EU_PARCEL_TABLE_V1.json");
const LISTINGS_FILE = path.resolve("../../data/land-search/listings.json");
const SHORTLIST_FILE = path.resolve("../../data/land-search/shortlist.json");

function loadJson<T>(filePath: string): T | null {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as T;
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
    US: "United States",
  };

  return names[code ?? ""] ?? (code?.trim() || "");
}

function toAcres(sizeM2: number | null | undefined): number | null {
  if (!Number.isFinite(sizeM2) || !sizeM2 || sizeM2 <= 0) return null;
  return Math.round(sizeM2 * 0.000247105 * 100) / 100;
}

function joinLocation(parts: Array<string | undefined>): string {
  return Array.from(
    new Set(
      parts
        .map((part) => part?.trim())
        .filter((part): part is string => !!part && part !== "TBD"),
    ),
  ).join(", ");
}

function isScoutTable(value: unknown): value is ScoutTable {
  return !!value && typeof value === "object" && Array.isArray((value as ScoutTable).entries);
}

function normalizeSeedEntry(entry: ScoutEntry): ParcelRecord {
  const region = entry.region?.trim() || countryName(entry.country) || "Europe";
  const listingLabel = entry.listingType?.trim() ? formatWords(entry.listingType) : "Scout Lead";
  const sizeAcres = toAcres(entry.sizeM2);
  const hasParcelFacts = sizeAcres != null && entry.priceEUR != null;

  return {
    externalId: entry.id,
    title: `${region} ${listingLabel}`.trim(),
    location:
      joinLocation([entry.municipality, entry.region, countryName(entry.country)]) || countryName(entry.country) || "Europe",
    country: entry.country?.trim() || null,
    sizeAcres,
    priceUsd: null,
    score: entry.score ?? null,
    sourceUrl: entry.sourceUrl ?? null,
    status: hasParcelFacts ? "candidate" : "lane",
  };
}

function formatListingLocation(listing: JsonListing): string {
  return [listing.location.city, listing.location.region, countryName(listing.location.country)]
    .filter(Boolean)
    .join(", ");
}

function normalizeListing(listing: JsonListing, shortlistedIds: Set<string>): ParcelRecord {
  return {
    externalId: listing.id,
    title: listing.title,
    location: formatListingLocation(listing),
    country: listing.location.country || null,
    sizeAcres: listing.sizeAcres,
    priceUsd: Math.round(listing.priceUSD),
    score: listing.score ?? null,
    sourceUrl: listing.sourceUrl,
    status: shortlistedIds.has(listing.id) ? "shortlisted" : "listing",
  };
}

async function upsertRecords(records: Iterable<ParcelRecord>) {
  let count = 0;
  for (const record of records) {
    await prisma.parcel.upsert({
      where: { externalId: record.externalId },
      update: record,
      create: record,
    });
    count += 1;
  }
  return count;
}

async function main() {
  const records = new Map<string, ParcelRecord>();

  const euSeed = loadJson<unknown>(EU_SEED_FILE);
  if (isScoutTable(euSeed)) {
    for (const entry of euSeed.entries) {
      records.set(entry.id, normalizeSeedEntry(entry));
    }
  }

  const listings = loadJson<JsonListing[]>(LISTINGS_FILE) ?? [];
  const shortlist = loadJson<JsonListing[]>(SHORTLIST_FILE) ?? [];
  const shortlistedIds = new Set(shortlist.map((listing) => listing.id));

  for (const listing of listings) {
    records.set(listing.id, normalizeListing(listing, shortlistedIds));
  }

  const synced = await upsertRecords(records.values());
  console.log(
    `Synced ${synced} portfolio records into Prisma (${isScoutTable(euSeed) ? euSeed.entries.length : 0} EU seed, ${listings.length} listings).`,
  );
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
