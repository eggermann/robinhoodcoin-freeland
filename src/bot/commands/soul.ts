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

function escapeTelegramMarkdown(input: string): string {
  return input.replace(/([_*`\[])/g, "\\$1");
}

function formatDateLabel(value?: string): string {
  if (!value) return "open";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "open";
  return date.toLocaleDateString();
}

export async function handleSoulStatus(ctx: Context): Promise<void> {
  const soulNet = getSoulNetwork();
  const agents = soulNet.getActiveAgents();
  const influence = soulNet.getInfluenceStats();

  const agentList = agents.length > 0
    ? agents
      .map((agent) => `  🤖 *${escapeTelegramMarkdown(agent.name)}* (${escapeTelegramMarkdown(agent.role)}) — ${escapeTelegramMarkdown(agent.platform)}`)
      .join("\n")
    : "  none";
  const platformStats = Object.entries(influence.byPlatform)
    .map(([platform, count]) => `${escapeTelegramMarkdown(platform)}: ${count}`)
    .join(", ") || "none yet";

  await ctx.reply(
    `🧠 *Soul Network Status*

Active agents: ${agents.length}
${agentList}

🌱 *Influence*
Total actions: ${influence.totalActions}
Platforms: ${platformStats}

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
    const deadline = formatDateLabel(opportunity.deadline);
    return `${idx + 1}. *${escapeTelegramMarkdown(opportunity.title)}* (${escapeTelegramMarkdown(opportunity.type)})
   score: ${opportunity.score}/100 | value: ${value} | status: ${opportunity.status}
   deadline: ${deadline}
   source: ${escapeTelegramMarkdown(opportunity.source)}`;
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
  const sourceUrl = parts[3] ?? "";
  const deadlineRaw = parts[5] && parts[5] !== "-" ? parts[5] : undefined;
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

  let normalizedSourceUrl = "";
  try {
    const parsedUrl = new URL(sourceUrl);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      throw new Error("protocol");
    }
    normalizedSourceUrl = parsedUrl.toString();
  } catch {
    await ctx.reply("❌ `url` must be a valid http(s) URL.", {
      parse_mode: "Markdown",
    });
    return;
  }

  let estimatedValueSOL: number | undefined;
  if (parts[4] && parts[4] !== "-") {
    const parsedValue = Number(parts[4]);
    if (!Number.isFinite(parsedValue) || parsedValue < 0) {
      await ctx.reply("❌ `valueSOL` must be a non-negative number (or `-`).", {
        parse_mode: "Markdown",
      });
      return;
    }
    estimatedValueSOL = parsedValue;
  }

  let deadline: string | undefined;
  if (deadlineRaw) {
    const parsedDeadline = new Date(deadlineRaw);
    if (Number.isNaN(parsedDeadline.getTime())) {
      await ctx.reply("❌ `deadline` must be a valid date (example: `2026-04-15`) or `-`.", {
        parse_mode: "Markdown",
      });
      return;
    }
    deadline = parsedDeadline.toISOString();
  }

  const opp = addOpportunity({
    type: rawType,
    title,
    source,
    sourceUrl: normalizedSourceUrl,
    region,
    estimatedValueSOL,
    deadline,
    requirements,
    notes,
    tags,
  });

  await ctx.reply(
    `✅ *Opportunity added*\n\n🆔 \`${escapeTelegramMarkdown(opp.id)}\`\n🏷️ ${escapeTelegramMarkdown(opp.type)}\n📌 ${escapeTelegramMarkdown(opp.title)}\n📊 Score: *${opp.score}/100*\n📍 Region: ${escapeTelegramMarkdown(opp.region ?? "n/a")}\n💰 Value: ${opp.estimatedValueSOL ?? "n/a"} SOL${
      opp.score >= 80
        ? `\n\n🚦 High-priority lead. Admin can approve with: \`/approveopp ${escapeTelegramMarkdown(opp.id)}\``
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
      `✅ Opportunity approved by admin.\n\n📋 Proposal created: \`${escapeTelegramMarkdown(proposal.id)}\`\n📝 Title: *${escapeTelegramMarkdown(proposal.title)}*\n📊 Status: ${escapeTelegramMarkdown(proposal.status)}\n\nNext: \`/activate ${escapeTelegramMarkdown(proposal.id)}\``,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ ${escapeTelegramMarkdown(message)}`, { parse_mode: "Markdown" });
  }
}
