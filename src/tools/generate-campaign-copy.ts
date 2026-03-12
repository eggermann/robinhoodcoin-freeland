import fs from "node:fs";
import path from "node:path";
import type { StampCampaign } from "../nft/stamp-tiers.js";
import { getActiveCampaigns, getCampaign, getCampaignProgress } from "../nft/stamp-tiers.js";
import { getPortfolio } from "../soul/reporting.js";

interface CopyContext {
  campaignId: string;
  campaignName: string;
  parcelName: string;
  location: string;
  active: boolean;
  goalSOL: number;
  priceSOL: number;
  progressLine: string;
  supplyLine: string;
}

function getArg(name: string): string {
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index === -1) return "";
  return process.argv[index + 1] ?? "";
}

function getNumberArg(name: string, fallback: number): number {
  const raw = getArg(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function resolveCampaign(): StampCampaign | null {
  const campaignId = getArg("campaign");
  if (campaignId) {
    const campaign = getCampaign(campaignId);
    if (!campaign) {
      throw new Error(`Campaign ${campaignId} not found.`);
    }
    return campaign;
  }

  return getActiveCampaigns()[0] ?? null;
}

function resolveContext(): CopyContext {
  const campaign = resolveCampaign();

  if (campaign) {
    const progress = getCampaignProgress(campaign.id);
    const parcel = campaign.parcelId
      ? getPortfolio().find((item) => item.id === campaign.parcelId)
      : undefined;

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      parcelName: parcel?.name ?? campaign.name,
      location: parcel?.location ?? "current shortlist",
      active: campaign.active,
      goalSOL: campaign.goalSOL,
      priceSOL: campaign.priceSOL,
      progressLine: progress
        ? `${progress.raisedSOL.toFixed(2)} / ${progress.goalSOL.toFixed(2)} SOL raised`
        : `${campaign.raisedSOL.toFixed(2)} / ${campaign.goalSOL.toFixed(2)} SOL raised`,
      supplyLine: progress
        ? `${progress.minted}/${progress.maxSupply} stamps minted`
        : `${campaign.minted}/${campaign.maxSupply} stamps minted`,
    };
  }

  const parcelName = getArg("name");
  const location = getArg("location");
  if (!parcelName || !location) {
    throw new Error("No active campaign found. Use --campaign <ID> or provide --name and --location for a draft copy pack.");
  }

  const goalSOL = getNumberArg("goal", 120);
  const priceSOL = getNumberArg("price", 0.9);
  const raisedSOL = getNumberArg("raised", 0);
  const minted = getNumberArg("minted", 0);
  const maxSupply = getNumberArg("supply", 120);

  return {
    campaignId: "DRAFT-CAMPAIGN",
    campaignName: `${parcelName} Freeland Draft`,
    parcelName,
    location,
    active: false,
    goalSOL,
    priceSOL,
    progressLine: `${raisedSOL.toFixed(2)} / ${goalSOL.toFixed(2)} SOL raised`,
    supplyLine: `${minted}/${maxSupply} stamps minted`,
  };
}

function writeOutput(markdown: string, outPath?: string): void {
  if (!outPath) {
    console.log(markdown);
    return;
  }

  const target = path.resolve(outPath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, markdown, "utf-8");
  console.log(`Campaign copy written to ${target}`);
}

function main(): void {
  const context = resolveContext();
  const markdown = `# Campaign Copy Pack

Generated: ${new Date().toISOString()}
Campaign: ${context.campaignId} — ${context.campaignName}
Parcel: ${context.parcelName}
Location: ${context.location}
Status: ${context.active ? "active" : "draft"}
Progress: ${context.progressLine}
Supply: ${context.supplyLine}

## Telegram

RobinHoodCoin is raising support for ${context.parcelName} in ${context.location}. The goal is ${context.goalSOL.toFixed(2)} SOL through the ${context.campaignName} stamp campaign. Current tracked progress: ${context.progressLine} and ${context.supplyLine}. Follow the parcel, join the waitlist, and open the public bot at https://t.me/RobinHoodCoinBot for the latest movement updates. Full site: https://freeland.rocks/

## Discord

Freeland update: ${context.parcelName} is the current campaign focus.

- Target: ${context.goalSOL.toFixed(2)} SOL
- Stamp price: ${context.priceSOL.toFixed(2)} SOL
- Progress: ${context.progressLine}
- Supply: ${context.supplyLine}
- Site: https://freeland.rocks/
- Bot: https://t.me/RobinHoodCoinBot

This is a mission campaign for real land acquisition, not a promise of return. Collect, share, and bring aligned supporters into the waitlist.

## X Thread

1. RobinHoodCoin is pushing the next Freeland parcel campaign: ${context.parcelName} in ${context.location}. Real land, public mission, tracked progress. https://freeland.rocks/

2. Current campaign math: ${context.progressLine}. Each stamp currently tracks support at ${context.priceSOL.toFixed(2)} SOL. This is commons funding, not speculation.

3. If you want updates, join the waitlist on the site or open the public Telegram bot: https://t.me/RobinHoodCoinBot

## Donor Email Subject

Help fund ${context.parcelName} through the Freeland campaign

## Donor Email

Hello,

We are building a public-facing land campaign around ${context.parcelName} in ${context.location}. The current stamp-backed target is ${context.goalSOL.toFixed(2)} SOL, and the tracked campaign progress is ${context.progressLine}.

Why this matters:
- the campaign is tied to a real parcel and public mission
- supporters can follow progress through the site and Telegram bot
- the project is structured around community governance and transparent reporting

If this fits your mission, we would like to show you the parcel context and current campaign materials.

Links:
- Site: https://freeland.rocks/
- Bot: https://t.me/RobinHoodCoinBot
- Community: https://t.me/robinhoodcoin
`;

  writeOutput(markdown, getArg("out") || undefined);
}

try {
  main();
} catch (error) {
  console.error("Failed to generate campaign copy:", error instanceof Error ? error.message : error);
  process.exit(1);
}
