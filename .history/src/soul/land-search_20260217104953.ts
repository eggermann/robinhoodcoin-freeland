/**
 * land-search.ts — Automated Land Search & Evaluation Module
 *
 * From the plan: "The AI can perform web searches and basic data gathering...
 * find available cheap land listings under $50k in region X"
 *
 * This module provides:
 *   - Land listing search criteria
 *   - Property evaluation scoring
 *   - Shortlist management for DAO votes
 *   - Integration points for real estate APIs
 */

import fs from "node:fs";
import path from "node:path";
import { CHARTER } from "../shared/charter.js";

// ── Types ────────────────────────────────────────────────

export interface SearchCriteria {
  maxPriceSOL: number;
  minSizeAcres: number;
  maxSizeAcres?: number;
  regions: string[];
  acceptableUses: string[];
  /** Zoning requirements (residential, agricultural, mixed, etc.) */
  zoningTypes: string[];
  /** Must have road access? */
  requireRoadAccess: boolean;
  /** Must have water source? */
  requireWater: boolean;
}

export interface LandListing {
  id: string;
  title: string;
  location: {
    country: string;
    region: string;
    city?: string;
    coordinates?: { lat: number; lng: number };
  };
  sizeAcres: number;
  priceUSD: number;
  priceSol?: number;
  zoning: string;
  description: string;
  features: string[];
  sourceUrl: string;
  /** When the listing was found */
  discoveredAt: string;
  /** Evaluation score (0-100) */
  score?: number;
  /** Evaluation breakdown */
  evaluation?: PropertyEvaluation;
}

export interface PropertyEvaluation {
  affordabilityScore: number;     // 0-25: how well it fits budget
  communityImpactScore: number;   // 0-25: potential for community use
  accessibilityScore: number;     // 0-25: road, water, infrastructure
  regulatoryScore: number;        // 0-25: zoning friendliness, legal ease
  totalScore: number;             // sum of above
  notes: string[];
  recommendation: "strong-buy" | "consider" | "pass";
}

// ── Constants ────────────────────────────────────────────

const DATA_DIR = "./data/land-search";
const LISTINGS_FILE = path.join(DATA_DIR, "listings.json");
const CRITERIA_FILE = path.join(DATA_DIR, "criteria.json");
const SHORTLIST_FILE = path.join(DATA_DIR, "shortlist.json");

function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// ── Default Search Criteria ──────────────────────────────

export const DEFAULT_CRITERIA: SearchCriteria = {
  maxPriceSOL: 500, // ~$50k at $100/SOL
  minSizeAcres: 1,
  maxSizeAcres: 100,
  regions: ["Europe", "North America", "South America"],
  acceptableUses: CHARTER.freelandDefinition.uses,
  zoningTypes: ["agricultural", "residential", "mixed-use", "rural"],
  requireRoadAccess: true,
  requireWater: false,
};

// ── Land Search Manager ──────────────────────────────────

export class LandSearchManager {
  private criteria: SearchCriteria;
  private listings: LandListing[] = [];
  private shortlist: LandListing[] = [];

  constructor(criteria?: SearchCriteria) {
    this.criteria = criteria ?? DEFAULT_CRITERIA;
    this.loadState();
  }

  // ── Criteria ────────────────────────────────────────

  getCriteria(): SearchCriteria {
    return { ...this.criteria };
  }

  updateCriteria(updates: Partial<SearchCriteria>): void {
    this.criteria = { ...this.criteria, ...updates };
    this.saveState();
    console.log("🔍 Search criteria updated");
  }

  // ── Listings ────────────────────────────────────────

  addListing(listing: Omit<LandListing, "id" | "discoveredAt">): LandListing {
    const full: LandListing = {
      ...listing,
      id: `LAND-${Date.now().toString(36).toUpperCase()}`,
      discoveredAt: new Date().toISOString(),
    };

    // Auto-evaluate
    full.evaluation = this.evaluateProperty(full);
    full.score = full.evaluation.totalScore;

    this.listings.push(full);
    this.saveState();

    console.log(
      `🏞️ New listing: "${full.title}" — ${full.sizeAcres} acres in ${full.location.region} — Score: ${full.score}/100`,
    );
    return full;
  }

  getListings(): LandListing[] {
    return [...this.listings].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  }

  getListingById(id: string): LandListing | undefined {
    return this.listings.find((l) => l.id === id);
  }

  // ── Evaluation ──────────────────────────────────────

  evaluateProperty(listing: LandListing): PropertyEvaluation {
    const notes: string[] = [];
    let affordability = 0;
    let communityImpact = 0;
    let accessibility = 0;
    let regulatory = 0;

    // Affordability (0-25)
    const maxPrice = this.criteria.maxPriceSOL * 100; // rough SOL→USD
    const priceRatio = listing.priceUSD / maxPrice;
    if (priceRatio <= 0.5) {
      affordability = 25;
      notes.push("Excellent price — well within budget");
    } else if (priceRatio <= 0.8) {
      affordability = 20;
      notes.push("Good price — comfortably within budget");
    } else if (priceRatio <= 1.0) {
      affordability = 15;
      notes.push("Price at budget limit");
    } else {
      affordability = 5;
      notes.push("⚠️ Price exceeds current budget");
    }

    // Community Impact (0-25)
    const hasMultipleUses = listing.features.some(
      (f) =>
        f.toLowerCase().includes("farm") ||
        f.toLowerCase().includes("garden") ||
        f.toLowerCase().includes("building") ||
        f.toLowerCase().includes("house"),
    );
    communityImpact = hasMultipleUses ? 22 : 15;
    if (listing.sizeAcres >= 5) {
      communityImpact = Math.min(25, communityImpact + 3);
      notes.push("Good size for community activities");
    }

    // Accessibility (0-25)
    const hasRoad = listing.features.some((f) =>
      f.toLowerCase().includes("road") || f.toLowerCase().includes("access"),
    );
    const hasWater = listing.features.some((f) =>
      f.toLowerCase().includes("water") || f.toLowerCase().includes("well") || f.toLowerCase().includes("river"),
    );
    accessibility = 10;
    if (hasRoad) {
      accessibility += 8;
      notes.push("Road access confirmed");
    }
    if (hasWater) {
      accessibility += 7;
      notes.push("Water source available");
    }

    // Regulatory (0-25)
    const friendlyZoning = this.criteria.zoningTypes.some(
      (z) => listing.zoning.toLowerCase().includes(z.toLowerCase()),
    );
    regulatory = friendlyZoning ? 20 : 10;
    if (friendlyZoning) {
      notes.push("Zoning is compatible with community use");
    } else {
      notes.push("⚠️ Zoning may require variance or special permit");
    }

    const totalScore = affordability + communityImpact + accessibility + regulatory;

    let recommendation: PropertyEvaluation["recommendation"];
    if (totalScore >= 75) recommendation = "strong-buy";
    else if (totalScore >= 50) recommendation = "consider";
    else recommendation = "pass";

    return {
      affordabilityScore: affordability,
      communityImpactScore: communityImpact,
      accessibilityScore: accessibility,
      regulatoryScore: regulatory,
      totalScore,
      notes,
      recommendation,
    };
  }

  // ── Shortlist ───────────────────────────────────────

  addToShortlist(listingId: string): void {
    const listing = this.getListingById(listingId);
    if (!listing) throw new Error(`Listing ${listingId} not found`);
    if (!this.shortlist.find((l) => l.id === listingId)) {
      this.shortlist.push(listing);
      this.saveState();
      console.log(`⭐ Added to shortlist: "${listing.title}"`);
    }
  }

  removeFromShortlist(listingId: string): void {
    this.shortlist = this.shortlist.filter((l) => l.id !== listingId);
    this.saveState();
  }

  getShortlist(): LandListing[] {
    return [...this.shortlist];
  }

  // ── AI Search Prompt ────────────────────────────────

  /**
   * Generate a prompt that an AI agent can use to search for land.
   * This is fed to the "Little John" sub-agent.
   */
  generateSearchPrompt(): string {
    const c = this.criteria;
    return `Search for available land listings matching these criteria:

- Budget: up to $${(c.maxPriceSOL * 100).toLocaleString()} USD (~${c.maxPriceSOL} SOL)
- Size: ${c.minSizeAcres}–${c.maxSizeAcres ?? "∞"} acres
- Regions: ${c.regions.join(", ")}
- Acceptable zoning: ${c.zoningTypes.join(", ")}
- Road access: ${c.requireRoadAccess ? "required" : "preferred"}
- Water: ${c.requireWater ? "required" : "preferred"}

Target uses: ${c.acceptableUses.join("; ")}

Look for:
- Distressed properties or motivated sellers
- Government land auctions
- Community land trust opportunities
- Grants for communal/social land projects
- Properties with existing structures (barns, cabins) are a bonus

Return structured data: title, location, size, price, zoning, features, source URL.`;
  }

  // ── Persistence ─────────────────────────────────────

  private loadState(): void {
    ensureDir();
    try {
      if (fs.existsSync(LISTINGS_FILE)) {
        this.listings = JSON.parse(fs.readFileSync(LISTINGS_FILE, "utf-8"));
      }
      if (fs.existsSync(SHORTLIST_FILE)) {
        this.shortlist = JSON.parse(fs.readFileSync(SHORTLIST_FILE, "utf-8"));
      }
      if (fs.existsSync(CRITERIA_FILE)) {
        this.criteria = JSON.parse(fs.readFileSync(CRITERIA_FILE, "utf-8"));
      }
    } catch {
      // Start fresh on error
    }
  }

  private saveState(): void {
    ensureDir();
    fs.writeFileSync(LISTINGS_FILE, JSON.stringify(this.listings, null, 2));
    fs.writeFileSync(SHORTLIST_FILE, JSON.stringify(this.shortlist, null, 2));
    fs.writeFileSync(CRITERIA_FILE, JSON.stringify(this.criteria, null, 2));
  }
}

// ── Singleton ────────────────────────────────────────────

let _manager: LandSearchManager | null = null;

export function getLandSearchManager(): LandSearchManager {
  if (!_manager) {
    _manager = new LandSearchManager();
  }
  return _manager;
}
