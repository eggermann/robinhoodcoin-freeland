import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

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

const LISTINGS_FILE = path.resolve("../../data/land-search/listings.json");
const SHORTLIST_FILE = path.resolve("../../data/land-search/shortlist.json");

function loadJsonArray<T>(filePath: string): T[] {
  if (!fs.existsSync(filePath)) return [];
  const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as unknown;
  return Array.isArray(raw) ? raw as T[] : [];
}

function formatLocation(listing: JsonListing): string {
  return [listing.location.city, listing.location.region, listing.location.country]
    .filter(Boolean)
    .join(", ");
}

async function main() {
  const listings = loadJsonArray<JsonListing>(LISTINGS_FILE);
  const shortlist = loadJsonArray<JsonListing>(SHORTLIST_FILE);
  const shortlistedIds = new Set(shortlist.map((listing) => listing.id));

  for (const listing of listings) {
    await prisma.parcel.upsert({
      where: { externalId: listing.id },
      update: {
        title: listing.title,
        location: formatLocation(listing),
        country: listing.location.country || null,
        sizeAcres: listing.sizeAcres,
        priceUsd: Math.round(listing.priceUSD),
        score: listing.score ?? null,
        sourceUrl: listing.sourceUrl,
        status: shortlistedIds.has(listing.id) ? "shortlisted" : "listing",
      },
      create: {
        externalId: listing.id,
        title: listing.title,
        location: formatLocation(listing),
        country: listing.location.country || null,
        sizeAcres: listing.sizeAcres,
        priceUsd: Math.round(listing.priceUSD),
        score: listing.score ?? null,
        sourceUrl: listing.sourceUrl,
        status: shortlistedIds.has(listing.id) ? "shortlisted" : "listing",
      },
    });
  }

  console.log(`Synced ${listings.length} land-search listings into Prisma (${shortlistedIds.size} shortlisted).`);
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
