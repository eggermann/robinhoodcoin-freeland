/**
 * opportunity-scout.ts — Funding and Resource Opportunity Scouting
 *
 * Robin-Hood style here means:
 * - voluntary contributions and sponsorships
 * - grants and public-good funding
 * - distressed/auctioned resources that can be moved into commons ownership
 */

import fs from "node:fs";
import path from "node:path";
import { createProposal, type Proposal } from "../dao/governance.js";

export type OpportunityType = "grant" | "auction" | "sponsorship";
export type OpportunityStatus = "new" | "reviewing" | "shortlisted" | "pursuing" | "won" | "lost";

export interface Opportunity {
  id: string;
  type: OpportunityType;
  title: string;
  source: string;
  sourceUrl: string;
  region?: string;
  estimatedValueSOL?: number;
  deadline?: string;
  requirements: string[];
  notes?: string;
  tags: string[];
  discoveredAt: string;
  status: OpportunityStatus;
  score: number;
}

const DATA_DIR = "./data/opportunities";
const OPPORTUNITIES_FILE = path.join(DATA_DIR, "opportunities.json");

function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadOpportunities(): Opportunity[] {
  ensureDir();
  if (!fs.existsSync(OPPORTUNITIES_FILE)) return [];
  return JSON.parse(fs.readFileSync(OPPORTUNITIES_FILE, "utf-8")) as Opportunity[];
}

function saveOpportunities(opportunities: Opportunity[]): void {
  ensureDir();
  fs.writeFileSync(OPPORTUNITIES_FILE, JSON.stringify(opportunities, null, 2));
}

export function scoreOpportunity(
  input: Omit<Opportunity, "id" | "discoveredAt" | "status" | "score">,
): number {
  let score = 0;

  if ((input.estimatedValueSOL ?? 0) >= 100) score += 30;
  else if ((input.estimatedValueSOL ?? 0) >= 25) score += 20;
  else if ((input.estimatedValueSOL ?? 0) > 0) score += 10;

  if (input.type === "grant") score += 20;
  if (input.type === "auction") score += 15;
  if (input.type === "sponsorship") score += 10;

  const tags = input.tags.map((t) => t.toLowerCase());
  if (tags.includes("community-land-trust")) score += 15;
  if (tags.includes("climate") || tags.includes("rewilding")) score += 10;
  if (tags.includes("urgent")) score += 8;
  if (tags.includes("under-market-value")) score += 12;

  if ((input.requirements?.length ?? 0) <= 3) score += 5;
  else if ((input.requirements?.length ?? 0) >= 8) score -= 5;

  return Math.max(0, Math.min(100, score));
}

export function addOpportunity(
  input: Omit<Opportunity, "id" | "discoveredAt" | "status" | "score">,
): Opportunity {
  const opportunities = loadOpportunities();

  const full: Opportunity = {
    ...input,
    id: `OPP-${Date.now().toString(36).toUpperCase()}`,
    discoveredAt: new Date().toISOString(),
    status: "new",
    score: scoreOpportunity(input),
  };

  opportunities.push(full);
  saveOpportunities(opportunities);
  return full;
}

export function listOpportunities(type?: OpportunityType): Opportunity[] {
  const all = loadOpportunities();
  const filtered = type ? all.filter((o) => o.type === type) : all;
  return filtered.sort((a, b) => b.score - a.score);
}

export function getOpportunityById(id: string): Opportunity | undefined {
  return loadOpportunities().find((o) => o.id === id);
}

export function setOpportunityStatus(id: string, status: OpportunityStatus): Opportunity {
  const opportunities = loadOpportunities();
  const opp = opportunities.find((o) => o.id === id);
  if (!opp) throw new Error(`Opportunity ${id} not found`);
  opp.status = status;
  saveOpportunities(opportunities);
  return opp;
}

export function generateScoutPrompt(): string {
  return `Find funding and acquisition opportunities aligned with RobinHoodCoin:

1) Grants:
- Community land trust grants
- Regenerative agriculture and food sovereignty grants
- Climate, rewilding, and mutual-aid funding

2) Auctions and distressed assets:
- Government land auctions
- Tax foreclosure and distressed property listings
- Under-market-value properties that can become community commons

3) Sponsorships:
- Mission-aligned patrons and impact backers
- Donors seeking social impact, not speculative returns

Return structured data:
- type (grant|auction|sponsorship)
- title
- source + URL
- deadline
- estimated value (in SOL or USD)
- requirements
- why this matches the charter`;
}

export function generateFundraisingNarrativePrompt(): string {
  return `Draft a fundraising narrative for RobinHoodCoin.

Goals:
- mobilize voluntary contributions from many supporters
- explain Freeland ownership as a public-good action
- highlight transparency (on-chain treasury, DAO votes, reports)

Output:
- 1 Telegram post
- 1 Discord announcement
- 1 short X/Twitter thread
- 1 CTA variant for Freeland Stamp campaign

Constraints:
- never promise financial returns
- keep tone inspiring, practical, and mission-first`;
}

export function createGrantProposalFromOpportunity(
  opportunityId: string,
  proposer: string = "soul-prime",
): Proposal {
  const opportunity = getOpportunityById(opportunityId);
  if (!opportunity) throw new Error(`Opportunity ${opportunityId} not found`);
  if (opportunity.type !== "grant") throw new Error(`Opportunity ${opportunityId} is not a grant`);

  return createProposal({
    title: `Apply for grant: ${opportunity.title}`,
    description: [
      `Source: ${opportunity.source}`,
      `Link: ${opportunity.sourceUrl}`,
      `Estimated value: ${opportunity.estimatedValueSOL ?? 0} SOL`,
      `Requirements: ${opportunity.requirements.join("; ") || "n/a"}`,
      `Reason: aligned with Freeland mission and commons acquisition.`,
    ].join("\n"),
    type: "grant",
    proposer,
    closesAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
  });
}

export function createProposalFromOpportunity(
  opportunityId: string,
  proposer: string = "soul-prime",
): Proposal {
  const opportunity = getOpportunityById(opportunityId);
  if (!opportunity) throw new Error(`Opportunity ${opportunityId} not found`);

  if (opportunity.type === "grant") {
    return createGrantProposalFromOpportunity(opportunityId, proposer);
  }

  if (opportunity.type === "auction") {
    return createProposal({
      title: `Evaluate acquisition: ${opportunity.title}`,
      description: [
        `Type: auction/distressed asset`,
        `Source: ${opportunity.source}`,
        `Link: ${opportunity.sourceUrl}`,
        `Estimated value: ${opportunity.estimatedValueSOL ?? 0} SOL`,
        `Requirements: ${opportunity.requirements.join("; ") || "n/a"}`,
        `Notes: ${opportunity.notes ?? "n/a"}`,
        `Reason: potential under-market resource for commons ownership.`,
      ].join("\n"),
      type: "land_purchase",
      proposer,
      closesAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
    });
  }

  return createProposal({
    title: `Sponsorship opportunity: ${opportunity.title}`,
    description: [
      `Type: sponsorship/patron lead`,
      `Source: ${opportunity.source}`,
      `Link: ${opportunity.sourceUrl}`,
      `Estimated value: ${opportunity.estimatedValueSOL ?? 0} SOL`,
      `Requirements: ${opportunity.requirements.join("; ") || "n/a"}`,
      `Notes: ${opportunity.notes ?? "n/a"}`,
      `Reason: mission-aligned voluntary contribution opportunity.`,
    ].join("\n"),
    type: "general",
    proposer,
    closesAt: new Date(Date.now() + 7 * 24 * 3600_000).toISOString(),
  });
}
