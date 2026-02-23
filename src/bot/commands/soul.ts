import type { Context } from "grammy";
import { BOT } from "../../shared/config.js";
import { getSoulNetwork } from "../../soul/network.js";
import {
  addOpportunity,
  createProposalFromOpportunity,
  listOpportunities,
  setOpportunityStatus,
  type OpportunityType,
} from "../../soul/opportunity-scout.js";

export async function handleSoulStatus(ctx: Context): Promise<void> {
  const soulNet = getSoulNetwork();
  const agents = soulNet.getActiveAgents();
  const influence = soulNet.getInfluenceStats();

  const agentList = agents.map((agent) => `  🤖 *${agent.name}* (${agent.role}) — ${agent.platform}`).join("\n");

  await ctx.reply(
    `🧠 *Soul Network Status*

Active agents: ${agents.length}
${agentList}

🌱 *Influence*
Total actions: ${influence.totalActions}
Platforms: ${Object.entries(influence.byPlatform).map(([platform, count]) => `${platform}: ${count}`).join(", ") || "none yet"}

_The Soul spreads the idea of Freeland through every interaction.
Every conversation is a seed planted. 🌿_`,
    { parse_mode: "Markdown" },
  );
}

export async function handleOpportunities(ctx: Context): Promise<void> {
  const opportunities = listOpportunities().slice(0, 8);

  if (opportunities.length === 0) {
    await ctx.reply(
      "🔎 No opportunities tracked yet. Little John can start scouting grants, auctions, and sponsorship leads.",
    );
    return;
  }

  const lines = opportunities.map((opportunity, idx) => {
    const value = opportunity.estimatedValueSOL ? `${opportunity.estimatedValueSOL} SOL` : "n/a";
    const deadline = opportunity.deadline ? new Date(opportunity.deadline).toLocaleDateString() : "open";
    return `${idx + 1}. *${opportunity.title}* (${opportunity.type})
   score: ${opportunity.score}/100 | value: ${value} | status: ${opportunity.status}
   deadline: ${deadline}
   source: ${opportunity.source}`;
  });

  await ctx.reply(
    `🎯 *Top Opportunities*\n\n${lines.join("\n\n")}`,
    { parse_mode: "Markdown" },
  );
}

export async function handleScout(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? "";
  const args = text.replace(/^\/scout\s*/, "").trim();

  if (!args) {
    await ctx.reply(
      "🔎 *Add Opportunity*\n\nUsage:\n`/scout <type> | <title> | <source> | <url> | <valueSOL> | <deadline> | <region> | <tags comma> | <requirements ;> | <notes>`\n\nExample:\n`/scout grant | CLT Seed Grant 2026 | Civic Grants Org | https://example.org/grant | 120 | 2026-04-15 | EU | community-land-trust,climate | nonprofit required; budget plan | strong fit for parcel #1`\n\nTypes: `grant`, `auction`, `sponsorship`",
      { parse_mode: "Markdown" },
    );
    return;
  }

  const parts = args.split("|").map((part) => part.trim());
  if (parts.length < 4) {
    await ctx.reply("❌ Invalid format. Use `/scout` without args to see the template.", {
      parse_mode: "Markdown",
    });
    return;
  }

  const rawType = parts[0]?.toLowerCase() as OpportunityType;
  if (!["grant", "auction", "sponsorship"].includes(rawType)) {
    await ctx.reply("❌ Type must be one of: `grant`, `auction`, `sponsorship`.", {
      parse_mode: "Markdown",
    });
    return;
  }

  const title = parts[1];
  const source = parts[2];
  const sourceUrl = parts[3];
  const estimatedValueSOL = parts[4] ? Number(parts[4]) : undefined;
  const deadline = parts[5] && parts[5] !== "-" ? parts[5] : undefined;
  const region = parts[6] && parts[6] !== "-" ? parts[6] : undefined;
  const tags = parts[7]
    ? parts[7].split(",").map((tag) => tag.trim()).filter(Boolean)
    : [];
  const requirements = parts[8]
    ? parts[8].split(";").map((req) => req.trim()).filter(Boolean)
    : [];
  const notes = parts[9] && parts[9] !== "-" ? parts[9] : undefined;

  if (!title || !source || !sourceUrl) {
    await ctx.reply("❌ `title`, `source`, and `url` are required.", {
      parse_mode: "Markdown",
    });
    return;
  }

  const opp = addOpportunity({
    type: rawType,
    title,
    source,
    sourceUrl,
    region,
    estimatedValueSOL: Number.isFinite(estimatedValueSOL) ? estimatedValueSOL : undefined,
    deadline,
    requirements,
    notes,
    tags,
  });

  await ctx.reply(
    `✅ *Opportunity added*\n\n🆔 \`${opp.id}\`\n🏷️ ${opp.type}\n📌 ${opp.title}\n📊 Score: *${opp.score}/100*\n📍 Region: ${opp.region ?? "n/a"}\n💰 Value: ${opp.estimatedValueSOL ?? "n/a"} SOL${
      opp.score >= 80
        ? `\n\n🚦 High-priority lead. Admin can approve with: \`/approveopp ${opp.id}\``
        : ""
    }`,
    { parse_mode: "Markdown" },
  );
}

function isAdminUser(ctx: Context): boolean {
  const userId = ctx.from?.id?.toString();
  if (!userId) return false;
  return BOT.adminIds.includes(userId);
}

export async function handleApproveOpportunity(ctx: Context): Promise<void> {
  if (BOT.adminIds.length === 0) {
    await ctx.reply(
      "⚠️ BOT_ADMIN_IDS is not configured. Add admin Telegram IDs in `.env` first.",
    );
    return;
  }

  if (!isAdminUser(ctx)) {
    await ctx.reply("❌ Only configured bot admins can approve opportunities.");
    return;
  }

  const text = ctx.message?.text ?? "";
  const opportunityId = text.replace(/^\/approveopp\s*/, "").trim();

  if (!opportunityId) {
    await ctx.reply("Usage: `/approveopp <opportunity-ID>`", { parse_mode: "Markdown" });
    return;
  }

  try {
    const proposal = createProposalFromOpportunity(
      opportunityId,
      ctx.from?.id?.toString() ?? "admin",
    );
    setOpportunityStatus(opportunityId, "pursuing");

    await ctx.reply(
      `✅ Opportunity approved by admin.\n\n📋 Proposal created: \`${proposal.id}\`\n📝 Title: *${proposal.title}*\n📊 Status: ${proposal.status}\n\nNext: \`/activate ${proposal.id}\``,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    await ctx.reply(`❌ ${err}`);
  }
}
