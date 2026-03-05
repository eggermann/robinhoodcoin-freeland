import type { Context } from "grammy";
import {
  getActiveCampaigns,
  getCampaign,
  getCampaignProgress,
  recordMint,
  STAMP_TIERS,
} from "../../nft/stamp-tiers.js";
import { createLandStampBatch, listSelectableLands } from "../../nft/land-stamp-factory.js";
import {
  formatMemberProfile,
  getMemberProfile,
  recordStampMintForMember,
} from "../../soul/member-ledger.js";
import { replyPlain } from "../telegram-reply.js";

export async function handleStamps(ctx: Context): Promise<void> {
  const campaigns = getActiveCampaigns();

  if (campaigns.length === 0) {
    await ctx.reply(
      "🎨 No active stamp campaigns right now. Stay tuned!\n\nSee available tiers: /tiers",
    );
    return;
  }

  const lines = campaigns.map((campaign) => {
    const progress = getCampaignProgress(campaign.id);
    const bar = progress
      ? `${"█".repeat(Math.floor(progress.percentFunded / 10))}${"░".repeat(10 - Math.floor(progress.percentFunded / 10))} ${progress.percentFunded}%`
      : "";

    return `🎨 *${campaign.name}* (${campaign.tier})
   💰 ${campaign.priceSOL} SOL each — ${campaign.minted}/${campaign.maxSupply || "∞"} minted
   📊 Funding: ${bar}
   🎯 Goal: ${campaign.goalSOL} SOL | Raised: ${campaign.raisedSOL} SOL`;
  });

  await replyPlain(ctx, `🎨 *Active Stamp Campaigns*\n\n${lines.join("\n\n")}`);
}

export async function handleTiers(ctx: Context): Promise<void> {
  const tiers = Object.values(STAMP_TIERS);
  const lines = tiers.map((tier) => {
    const supply = tier.maxSupply > 0 ? `${tier.maxSupply} max` : "unlimited";
    return `*${tier.name}* — ${tier.priceSOL} SOL (${supply})
   ${tier.description}
   Benefits: ${tier.benefits.join("; ")}`;
  });

  await replyPlain(ctx, `🏷️ *Freeland Stamp Tiers*\n\n${lines.join("\n\n")}`);
}

export async function handleLands(ctx: Context): Promise<void> {
  const lands = listSelectableLands();

  if (lands.length === 0) {
    await ctx.reply(
      "🏡 No selectable lands yet. Add land to portfolio or shortlist first.",
    );
    return;
  }

  const lines = lands.map((land, idx) =>
    `${idx + 1}. [${land.source}] ${land.id} — ${land.name}
   ${land.location} | ${land.sizeAcres} acres | land target ${land.landPriceSOL} SOL | est. stamp value ${land.estimatedValueSOL} SOL`,
  );

  await ctx.reply(
    `🏡 Selectable lands for stamp drops:\n\n${lines.join("\n\n")}\n\nUse: /landstamp <LAND-ID> | <maxSupply?> | <goalSOL?> | <valueSOL 0.5-1.5?>`,
  );
}

export async function handleLandStamp(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? "";
  const args = text.replace(/^\/landstamp\s*/, "").trim();

  if (!args) {
    await ctx.reply(
      "🎟️ Create stamp batch from selected land.\n\nUsage:\n/landstamp <LAND-ID> | <maxSupply?> | <goalSOL?> | <valueSOL 0.5-1.5?>\n\nExample:\n/landstamp LAND-ABC123 | 180 | 162 | 0.9\n\nTip: run /lands first to see valid land IDs.",
    );
    return;
  }

  const parts = args.split("|").map((part) => part.trim()).filter(Boolean);
  const selectedLandId = parts[0];
  const maxSupply = parts[1] ? Number(parts[1]) : undefined;
  const goalSOL = parts[2] ? Number(parts[2]) : undefined;
  const requestedValueSOL = parts[3] ? Number(parts[3]) : undefined;

  if (!selectedLandId) {
    await ctx.reply("❌ Missing LAND-ID. Use /lands to list options.");
    return;
  }

  if (parts[1] && !Number.isFinite(maxSupply)) {
    await ctx.reply("❌ maxSupply must be a number.");
    return;
  }
  if (parts[2] && !Number.isFinite(goalSOL)) {
    await ctx.reply("❌ goalSOL must be a number.");
    return;
  }
  if (parts[3] && !Number.isFinite(requestedValueSOL)) {
    await ctx.reply("❌ valueSOL must be a number between 0.5 and 1.5.");
    return;
  }

  await ctx.replyWithChatAction("typing");

  try {
    const result = await createLandStampBatch({
      selectedLandId,
      maxSupply,
      goalSOL,
      requestedValueSOL,
      language: "en",
    });

    const motifs = result.semanticPhrases.slice(0, 6).join(" | ");
    const promptPreview = result.prompt.slice(0, 300).replace(/\n/g, " ");

    await ctx.reply(
      `✅ Stamp campaign created from selected land.

Campaign ID: ${result.campaign.id}
Name: ${result.campaign.name}
Land: ${result.selectedLand.id} (${result.selectedLand.name})
Supply: ${result.campaign.maxSupply}
Value per stamp: ${result.valueSOL} SOL
Goal: ${result.campaign.goalSOL} SOL

Daily Wikipedia topic: ${result.wikiTopic.title}
Topic URL: ${result.wikiTopic.canonicalUrl}
Semantic motifs: ${motifs}

Prompt preview: ${promptPreview}...`,
    );
  } catch (err) {
    await ctx.reply(`❌ Could not create land stamp campaign: ${err}`);
  }
}

export async function handleStampMint(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? "";
  const args = text.replace(/^\/stampmint\s*/, "").trim();

  if (!args) {
    await ctx.reply(
      "Usage: `/stampmint <CAMPAIGN-ID> <qty?>`\nExample: `/stampmint CAMP-ABC123 2`",
    );
    return;
  }

  const [campaignIdRaw, qtyRaw] = args.split(/\s+/);
  const campaignId = campaignIdRaw?.trim();
  const qty = qtyRaw ? Number(qtyRaw) : 1;

  if (!campaignId) {
    await ctx.reply("❌ Missing campaign ID.");
    return;
  }

  if (!Number.isFinite(qty) || qty < 1 || qty > 20) {
    await ctx.reply("❌ qty must be a number between 1 and 20.");
    return;
  }

  const campaign = getCampaign(campaignId);
  if (!campaign) {
    await ctx.reply(`❌ Campaign ${campaignId} not found.`);
    return;
  }

  let minted = 0;
  let latest = campaign;
  let mintError: string | null = null;

  for (let i = 0; i < qty; i++) {
    try {
      latest = recordMint(campaignId);
      minted += 1;
    } catch (err) {
      mintError = err instanceof Error ? err.message : String(err);
      break;
    }
  }

  if (minted === 0) {
    await ctx.reply(`❌ Could not mint stamps: ${mintError ?? "unknown error"}`);
    return;
  }

  const userId = ctx.from?.id?.toString() ?? "unknown-user";
  const profile = recordStampMintForMember({
    userId,
    campaignId,
    tier: latest.tier,
    quantity: minted,
    priceSOL: latest.priceSOL,
    username: ctx.from?.username ?? undefined,
    displayName: [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ").trim() || undefined,
  });

  const contribution = (latest.priceSOL * minted).toFixed(4);

  await ctx.reply(
    `✅ Mint recorded.

Campaign: ${latest.name} (\`${latest.id}\`)
Tier: ${latest.tier}
Minted now: ${minted}
Contribution: ${contribution} SOL
Raised: ${latest.raisedSOL.toFixed(4)} / ${latest.goalSOL.toFixed(4)} SOL

Your governance weight: ${profile.governanceWeight}
Your total contribution: ${profile.totalContributedSOL.toFixed(4)} SOL${
      mintError ? `\n\n⚠️ Partial mint: ${mintError}` : ""
    }`,
  );
}

export async function handleMember(ctx: Context): Promise<void> {
  const userId = ctx.from?.id?.toString() ?? "unknown-user";
  const profile = getMemberProfile(userId);

  if (!profile) {
    await replyPlain(
      ctx,
      "No member profile yet. Join chat activity, mint a stamp with `/stampmint`, or vote to create one.",
    );
    return;
  }

  await ctx.reply(`👤 Member Profile\n\n${formatMemberProfile(profile)}`);
}
