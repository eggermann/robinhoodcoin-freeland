/**
 * stamp-tiers.ts — Freeland Stamp NFT Tiering System
 *
 * From the plan:
 *   - "General Supporter Stamps: affordable NFTs anyone can buy"
 *   - "Parcel Stamps: a special series released whenever a new piece of land
 *      is being crowdfunded, with artwork of that specific site"
 *
 * This module defines the stamp tiers, manages campaigns tied to specific
 * land acquisitions, and tracks minting progress.
 */

import fs from "node:fs";
import path from "node:path";

// ── Types ────────────────────────────────────────────────

export type StampTier = "supporter" | "parcel" | "patron" | "genesis";

export interface StampTierConfig {
  tier: StampTier;
  name: string;
  description: string;
  priceSOL: number;
  /** Max supply (0 = unlimited) */
  maxSupply: number;
  /** Benefits of holding this stamp */
  benefits: string[];
}

export interface StampCampaign {
  id: string;
  name: string;
  description: string;
  /** Which parcel this campaign funds (null for general) */
  parcelId: string | null;
  tier: StampTier;
  priceSOL: number;
  maxSupply: number;
  minted: number;
  /** Target amount in SOL to raise */
  goalSOL: number;
  /** Amount raised so far */
  raisedSOL: number;
  /** Campaign artwork description (for AI generation) */
  artworkPrompt: string;
  /** Is the campaign active? */
  active: boolean;
  createdAt: string;
  closesAt?: string;
}

// ── Tier Definitions ─────────────────────────────────────

export const STAMP_TIERS: Record<StampTier, StampTierConfig> = {
  genesis: {
    tier: "genesis",
    name: "Genesis Stamp",
    description:
      "The first 1,000 stamps ever minted. Reserved for founding members of the Robin Hood Clan.",
    priceSOL: 1,
    maxSupply: 1000,
    benefits: [
      "Founding member badge in the community",
      "Early access to all future stamp drops",
      "Vote weight bonus on governance proposals",
      "Name inscribed on the Genesis Wall (website)",
    ],
  },
  supporter: {
    tier: "supporter",
    name: "General Supporter Stamp",
    description:
      "An affordable NFT anyone can buy to show support and contribute funds to the Freeland Initiative.",
    priceSOL: 0.5,
    maxSupply: 0, // unlimited
    benefits: [
      "Proof of contribution to the Freeland Initiative",
      "Access to the supporters-only Telegram channel",
      "Monthly transparency reports delivered via the Soul",
    ],
  },
  parcel: {
    tier: "parcel",
    name: "Parcel Stamp",
    description:
      "A limited-edition stamp released for a specific land acquisition campaign. " +
      "Each parcel stamp features AI-generated artwork of the target site.",
    priceSOL: 2,
    maxSupply: 500, // per campaign
    benefits: [
      "Direct contribution to a specific land purchase",
      "Unique artwork of the target freeland parcel",
      "Special recognition as a parcel funder",
      "Voting priority on decisions about that specific parcel",
    ],
  },
  patron: {
    tier: "patron",
    name: "Patron Stamp",
    description:
      "For major supporters who want to make a significant contribution. " +
      "Patrons receive enhanced governance rights and recognition.",
    priceSOL: 10,
    maxSupply: 100,
    benefits: [
      "All benefits of lower tiers",
      "Enhanced vote weight in DAO governance",
      "Advisory seat on the Merry Men council",
      "Personal thank-you from the Soul and the team",
      "Name featured on the website's Patron Wall",
    ],
  },
};

// ── Campaign Management ──────────────────────────────────

const DATA_DIR = "./data/stamps";
const CAMPAIGNS_FILE = path.join(DATA_DIR, "campaigns.json");

function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadCampaigns(): StampCampaign[] {
  ensureDir();
  if (!fs.existsSync(CAMPAIGNS_FILE)) return [];
  return JSON.parse(fs.readFileSync(CAMPAIGNS_FILE, "utf-8")) as StampCampaign[];
}

function saveCampaigns(campaigns: StampCampaign[]): void {
  ensureDir();
  fs.writeFileSync(CAMPAIGNS_FILE, JSON.stringify(campaigns, null, 2));
}

export function createCampaign(
  opts: Omit<StampCampaign, "id" | "minted" | "raisedSOL" | "active" | "createdAt">,
): StampCampaign {
  const campaign: StampCampaign = {
    ...opts,
    id: `CAMP-${Date.now().toString(36).toUpperCase()}`,
    minted: 0,
    raisedSOL: 0,
    active: true,
    createdAt: new Date().toISOString(),
  };

  const campaigns = loadCampaigns();
  campaigns.push(campaign);
  saveCampaigns(campaigns);

  console.log(
    `🎨 Stamp campaign created: "${campaign.name}" (${campaign.tier}) — Goal: ${campaign.goalSOL} SOL`,
  );
  return campaign;
}

export function recordMint(campaignId: string): StampCampaign {
  const campaigns = loadCampaigns();
  const campaign = campaigns.find((c) => c.id === campaignId);
  if (!campaign) throw new Error(`Campaign ${campaignId} not found`);
  if (!campaign.active) throw new Error(`Campaign ${campaignId} is not active`);
  if (campaign.maxSupply > 0 && campaign.minted >= campaign.maxSupply) {
    throw new Error(`Campaign ${campaignId} is sold out`);
  }

  campaign.minted++;
  campaign.raisedSOL += campaign.priceSOL;

  // Auto-close if sold out
  if (campaign.maxSupply > 0 && campaign.minted >= campaign.maxSupply) {
    campaign.active = false;
    console.log(`🎉 Campaign "${campaign.name}" is SOLD OUT!`);
  }

  saveCampaigns(campaigns);
  return campaign;
}

export function getCampaign(id: string): StampCampaign | undefined {
  return loadCampaigns().find((c) => c.id === id);
}

export function getActiveCampaigns(): StampCampaign[] {
  return loadCampaigns().filter((c) => c.active);
}

export function getAllCampaigns(): StampCampaign[] {
  return loadCampaigns();
}

export function getCampaignProgress(campaignId: string): {
  minted: number;
  maxSupply: number;
  raisedSOL: number;
  goalSOL: number;
  percentFunded: number;
  percentMinted: number;
} | null {
  const campaign = getCampaign(campaignId);
  if (!campaign) return null;

  return {
    minted: campaign.minted,
    maxSupply: campaign.maxSupply,
    raisedSOL: campaign.raisedSOL,
    goalSOL: campaign.goalSOL,
    percentFunded: campaign.goalSOL > 0
      ? Math.round((campaign.raisedSOL / campaign.goalSOL) * 100)
      : 0,
    percentMinted: campaign.maxSupply > 0
      ? Math.round((campaign.minted / campaign.maxSupply) * 100)
      : 0,
  };
}

/**
 * Generate an AI artwork prompt for a parcel stamp.
 * The resulting prompt can be fed to Midjourney, DALL-E, Stable Diffusion, etc.
 */
export function generateArtworkPrompt(
  parcelName: string,
  location: string,
  features: string[],
): string {
  return `Create a collectible digital stamp artwork for the "${parcelName}" Freeland Stamp.

Style: A blend of medieval Robin Hood folklore and modern decentralized themes. Think illuminated manuscript meets cyberpunk nature.

Scene: ${location}. Features: ${features.join(", ")}.

Include symbolic elements:
- An arrow transforming into a growing tree (investing money into land growth)
- A faint blockchain lattice woven into the sky or forest canopy
- The Robin Hood Clan emblem (a bow and arrow crossed with a sprouting seed)
- Warm, earthy tones with accents of digital green

The stamp should have a decorative border reminiscent of vintage postage stamps.
Include the text "${parcelName}" and "FREELAND" subtly integrated into the design.

Medium: Digital art, high detail, 1:1 aspect ratio, suitable for NFT display.`;
}
