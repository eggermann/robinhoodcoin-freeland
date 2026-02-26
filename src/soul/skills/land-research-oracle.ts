import { getLandSearchManager, type LandListing } from "../land-search.js";
import {
  generateScoutPrompt,
  listOpportunities,
  type Opportunity,
  type OpportunityType,
} from "../opportunity-scout.js";

export interface LandResearchOracleOpportunity {
  id: string;
  type: OpportunityType;
  title: string;
  source: string;
  sourceUrl: string;
  region: string | null;
  deadline: string | null;
  estimatedValueSOL: number | null;
  score: number;
  status: string;
  tags: string[];
}

export interface LandResearchOracleListing {
  id: string;
  title: string;
  location: string;
  sizeAcres: number;
  priceUSD: number;
  priceSOL: number | null;
  zoning: string;
  score: number;
  recommendation: "strong-buy" | "consider" | "pass" | "unknown";
  sourceUrl: string;
}

export interface LandResearchOracleSnapshot {
  generatedAt: string;
  query: string | null;
  typeFilter: OpportunityType | null;
  limit: number;
  opportunitiesReturned: number;
  shortlistReturned: number;
  opportunities: LandResearchOracleOpportunity[];
  shortlist: LandResearchOracleListing[];
  scoutPrompt: string;
  summary: string;
}

const DEFAULT_LIMIT = 6;
const MAX_LIMIT = 20;

function clampLimit(raw?: number): number {
  if (!Number.isFinite(raw)) return DEFAULT_LIMIT;
  const normalized = Math.floor(raw ?? DEFAULT_LIMIT);
  return Math.max(1, Math.min(MAX_LIMIT, normalized));
}

function normalizeType(value?: string): OpportunityType | null {
  if (!value) return null;
  const lowered = value.trim().toLowerCase();
  if (lowered === "grant" || lowered === "auction" || lowered === "sponsorship") {
    return lowered;
  }
  return null;
}

function includesQuery(haystack: Array<string | undefined>, query: string): boolean {
  const merged = haystack
    .filter((value): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();

  return merged.includes(query.toLowerCase());
}

function toListingLocation(listing: LandListing): string {
  return [listing.location.city, listing.location.region, listing.location.country]
    .filter(Boolean)
    .join(", ");
}

function mapOpportunity(opportunity: Opportunity): LandResearchOracleOpportunity {
  return {
    id: opportunity.id,
    type: opportunity.type,
    title: opportunity.title,
    source: opportunity.source,
    sourceUrl: opportunity.sourceUrl,
    region: opportunity.region ?? null,
    deadline: opportunity.deadline ?? null,
    estimatedValueSOL: opportunity.estimatedValueSOL ?? null,
    score: opportunity.score,
    status: opportunity.status,
    tags: opportunity.tags,
  };
}

function mapListing(listing: LandListing): LandResearchOracleListing {
  return {
    id: listing.id,
    title: listing.title,
    location: toListingLocation(listing),
    sizeAcres: listing.sizeAcres,
    priceUSD: listing.priceUSD,
    priceSOL: listing.priceSol ?? null,
    zoning: listing.zoning,
    score: listing.score ?? 0,
    recommendation: listing.evaluation?.recommendation ?? "unknown",
    sourceUrl: listing.sourceUrl,
  };
}

export function queryLandResearchOracle(input?: {
  query?: string;
  type?: string;
  limit?: number;
}): LandResearchOracleSnapshot {
  const normalizedQuery = input?.query?.trim() ?? "";
  const typeFilter = normalizeType(input?.type);
  const limit = clampLimit(input?.limit);

  const opportunities = listOpportunities(typeFilter ?? undefined)
    .filter((opportunity) => {
      if (!normalizedQuery) return true;
      return includesQuery(
        [
          opportunity.title,
          opportunity.source,
          opportunity.region,
          opportunity.notes,
          ...opportunity.tags,
          ...opportunity.requirements,
        ],
        normalizedQuery,
      );
    })
    .slice(0, limit)
    .map(mapOpportunity);

  const shortlist = getLandSearchManager()
    .getShortlist()
    .filter((listing) => {
      if (!normalizedQuery) return true;
      return includesQuery(
        [
          listing.title,
          listing.description,
          listing.zoning,
          listing.location.city,
          listing.location.region,
          listing.location.country,
          ...listing.features,
        ],
        normalizedQuery,
      );
    })
    .slice(0, limit)
    .map(mapListing);

  const summary = opportunities.length === 0 && shortlist.length === 0
    ? "No matching research leads are currently tracked."
    : `Research snapshot contains ${opportunities.length} opportunit${opportunities.length === 1 ? "y" : "ies"} and ${shortlist.length} shortlisted propert${shortlist.length === 1 ? "y" : "ies"}.`;

  return {
    generatedAt: new Date().toISOString(),
    query: normalizedQuery || null,
    typeFilter,
    limit,
    opportunitiesReturned: opportunities.length,
    shortlistReturned: shortlist.length,
    opportunities,
    shortlist,
    scoutPrompt: generateScoutPrompt(),
    summary,
  };
}
