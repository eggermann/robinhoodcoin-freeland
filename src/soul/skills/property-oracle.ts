import { getLandSearchManager, type LandListing } from "../land-search.js";

export type PropertyRecommendation = "strong-buy" | "consider" | "pass" | "unknown";

export interface PropertyOracleListing {
  id: string;
  title: string;
  location: string;
  sizeAcres: number;
  priceUSD: number;
  priceSOL: number | null;
  zoning: string;
  score: number;
  recommendation: PropertyRecommendation;
  sourceUrl: string;
  features: string[];
}

export interface PropertyOracleSnapshot {
  generatedAt: string;
  query: string | null;
  totalShortlisted: number;
  returned: number;
  listings: PropertyOracleListing[];
  summary: string;
}

function listingLocation(listing: LandListing): string {
  return [
    listing.location.city,
    listing.location.region,
    listing.location.country,
  ]
    .filter(Boolean)
    .join(", ");
}

function toOracleListing(listing: LandListing): PropertyOracleListing {
  return {
    id: listing.id,
    title: listing.title,
    location: listingLocation(listing),
    sizeAcres: listing.sizeAcres,
    priceUSD: listing.priceUSD,
    priceSOL: listing.priceSol ?? null,
    zoning: listing.zoning,
    score: listing.score ?? 0,
    recommendation: listing.evaluation?.recommendation ?? "unknown",
    sourceUrl: listing.sourceUrl,
    features: listing.features,
  };
}

function matchesQuery(listing: LandListing, query: string): boolean {
  const haystack = [
    listing.title,
    listing.description,
    listing.zoning,
    listing.location.city,
    listing.location.region,
    listing.location.country,
    ...listing.features,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

/**
 * Real Estate Oracle skill for the AI.
 * Returns a structured shortlist snapshot for natural-language answers.
 */
export function queryPropertyOracle(query?: string): PropertyOracleSnapshot {
  const shortlist = getLandSearchManager().getShortlist();
  const normalizedQuery = query?.trim() ?? "";

  const filtered = normalizedQuery.length > 0
    ? shortlist.filter((listing) => matchesQuery(listing, normalizedQuery))
    : shortlist;

  const listings = filtered
    .map(toOracleListing)
    .sort((a, b) => b.score - a.score);

  const summary = shortlist.length === 0
    ? "No shortlisted properties are available right now."
    : normalizedQuery.length > 0
      ? `Found ${listings.length} shortlisted propert${listings.length === 1 ? "y" : "ies"} matching \"${normalizedQuery}\".`
      : `Tracking ${listings.length} shortlisted propert${listings.length === 1 ? "y" : "ies"} for DAO review.`;

  return {
    generatedAt: new Date().toISOString(),
    query: normalizedQuery.length > 0 ? normalizedQuery : null,
    totalShortlisted: shortlist.length,
    returned: listings.length,
    listings,
    summary,
  };
}
