import type { Context } from "grammy";
import { getActiveCampaigns, getCampaignProgress, STAMP_TIERS } from "../../nft/stamp-tiers.js";
import { createLandStampBatch, listSelectableLands } from "../../nft/land-stamp-factory.js";

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

  await ctx.reply(
    `🎨 *Active Stamp Campaigns*\n\n${lines.join("\n\n")}`,
    { parse_mode: "Markdown" },
  );
}

export async function handleTiers(ctx: Context): Promise<void> {
  const tiers = Object.values(STAMP_TIERS);
  const lines = tiers.map((tier) => {
    const supply = tier.maxSupply > 0 ? `${tier.maxSupply} max` : "unlimited";
    return `*${tier.name}* — ${tier.priceSOL} SOL (${supply})
   ${tier.description}
   Benefits: ${tier.benefits.join("; ")}`;
  });

  await ctx.reply(
    `🏷️ *Freeland Stamp Tiers*\n\n${lines.join("\n\n")}`,
    { parse_mode: "Markdown" },
  );
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
