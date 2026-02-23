/**
 * OpenClaw / RobinHoodCoin Telegram Bot — "Soul"
 *
 * The integrated AI assistant that coordinates all aspects of the
 * Freeland Initiative. This bot is more than a chatbot — it is the
 * digital heart of the Robin Hood Clan.
 *
 * Integrates:
 *   - Charter-aware AI Q&A (Anthropic)
 *   - DAO governance (proposals, voting)
 *   - Treasury monitoring
 *   - Community coordination (welcome, reminders, polls, events)
 *   - FAQ auto-responder
 *   - Soul network & sub-agent coordination
 *   - Transparency reporting
 *   - Stamp campaign tracking
 *
 * Usage:
 *   npx tsx src/bot/index.ts          (dev)
 *   node dist/bot/index.js            (production)
 */

import { Bot, Context, session, type SessionFlavor } from "grammy";
import { BOT, TELEGRAM, assertSecrets } from "../shared/config.js";
import { FileLeaderLock, type LeaderLockHandle } from "./leader-lock.js";

// ── Command Handlers ─────────────────────────────────────
import { handleStart } from "./commands/start.js";
import { handleHelp } from "./commands/help.js";
import { handleTreasury } from "./commands/treasury.js";
import { handleMission } from "./commands/mission.js";
import { handleAsk } from "./commands/ask.js";
import {
  handlePropose,
  handleProposals,
  handleProposalDetail,
  handleActivate,
  handleVote,
  handleFinalize,
} from "./commands/governance.js";

// ── Soul Modules ─────────────────────────────────────────
import { getSoulNetwork } from "../soul/network.js";
import {
  matchFAQ,
  generatePersonalWelcome,
  getDueReminders,
  markReminderFired,
  createReminder,
  getUpcomingEvents,
  getActivePolls,
} from "../soul/community.js";
import { generateReport, formatReportTelegram } from "../soul/reporting.js";
import { getActiveCampaigns, getCampaignProgress, STAMP_TIERS } from "../nft/stamp-tiers.js";
import { createLandStampBatch, listSelectableLands } from "../nft/land-stamp-factory.js";
import {
  addOpportunity,
  createProposalFromOpportunity,
  listOpportunities,
  setOpportunityStatus,
  type OpportunityType,
} from "../soul/opportunity-scout.js";

// ── Session ──────────────────────────────────────────────

interface SessionData {
  messageCount: number;
  lastActive: string;
}

type BotContext = Context & SessionFlavor<SessionData>;

function buildLeaderId(): string {
  const host = process.env.HOSTNAME ?? "unknown-host";
  return `${host}:${process.pid}`;
}

// ── Boot ─────────────────────────────────────────────────

async function main() {
  assertSecrets();

  if (!TELEGRAM.botToken) {
    console.error("❌ TELEGRAM_BOT_TOKEN is not set. Check your .env file.");
    process.exit(1);
  }

  let leaderLockHandle: LeaderLockHandle | null = null;
  if (BOT.leaderLockMode === "file") {
    const leaderLock = new FileLeaderLock({
      lockFile: BOT.leaderLockFile,
      ownerId: buildLeaderId(),
      ttlMs: BOT.leaderLockTtlMs,
      heartbeatMs: BOT.leaderLockHeartbeatMs,
      retryWaitMs: BOT.leaderLockRetryWaitMs,
    });

    console.log("🔒 Leader lock mode: file");
    console.log(`   Waiting for leadership lock at ${BOT.leaderLockFile}`);

    leaderLockHandle = await leaderLock.waitForLeadership((error) => {
      console.error("❌ Leader lock lost:", error.message);
      process.exit(1);
    });

    console.log(`✅ Leadership acquired as ${leaderLockHandle.ownerId}`);
  }

  const bot = new Bot<BotContext>(TELEGRAM.botToken);

  // Initialize the Soul Network
  const soulNet = getSoulNetwork();
  soulNet.spawnSubAgent("finance", "telegram");
  soulNet.spawnSubAgent("land-scout", "telegram");
  soulNet.spawnSubAgent("pr", "telegram");
  soulNet.spawnSubAgent("moderator", "telegram");
  soulNet.spawnSubAgent("governance", "telegram");

  // Session middleware
  bot.use(
    session({
      initial: (): SessionData => ({
        messageCount: 0,
        lastActive: new Date().toISOString(),
      }),
    }),
  );

  // ── Core Commands ──────────────────────────────────
  bot.command("start", handleStart);
  bot.command("help", handleHelp);
  bot.command("treasury", handleTreasury);
  bot.command("mission", handleMission);

  // ── Governance Commands ────────────────────────────
  bot.command("propose", handlePropose);
  bot.command("proposals", handleProposals);
  bot.command("proposal", handleProposalDetail);
  bot.command("activate", handleActivate);
  bot.command("vote", handleVote);
  bot.command("finalize", handleFinalize);

  // ── Stamp Commands ─────────────────────────────────
  bot.command("stamps", handleStamps);
  bot.command("tiers", handleTiers);
  bot.command("lands", handleLands);
  bot.command("landstamp", handleLandStamp);

  // ── Community Commands ─────────────────────────────
  bot.command("events", handleEvents);
  bot.command("report", handleReport);
  bot.command("remind", handleRemind);
  bot.command("soul", handleSoulStatus);
  bot.command("opportunities", handleOpportunities);
  bot.command("scout", handleScout);
  bot.command("approveopp", handleApproveOpportunity);

  // ── New member welcome ─────────────────────────────
  bot.on("message:new_chat_members", async (ctx) => {
    const members = ctx.message.new_chat_members;
    for (const member of members) {
      if (member.is_bot) continue;
      const name = member.first_name ?? member.username ?? "friend";
      const welcome = generatePersonalWelcome(name);
      await ctx.reply(welcome, { parse_mode: "Markdown" });

      // Track influence
      soulNet.recordInfluence({
        platform: "telegram",
        community: ctx.chat.title ?? "DM",
        action: `Welcomed new member: ${name}`,
        outcome: "Welcome message sent",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // ── Free-text handler (FAQ → AI fallback) ──────────
  bot.on("message:text", async (ctx) => {
    ctx.session.messageCount++;
    ctx.session.lastActive = new Date().toISOString();

    const text = ctx.message.text;
    const isDM = ctx.chat.type === "private";
    const mentionsBot = text.toLowerCase().includes("@robinhoodcoinbot");

    if (!isDM && !mentionsBot) return;

    // Try FAQ first
    const faqAnswer = matchFAQ(text);
    if (faqAnswer) {
      await ctx.reply(faqAnswer);
      return;
    }

    // Fall back to AI
    await handleAsk(ctx, text);

    // Track influence for non-DM interactions
    if (!isDM) {
      soulNet.recordInfluence({
        platform: "telegram",
        community: ctx.chat.title ?? "unknown",
        action: `Answered question: "${text.slice(0, 50)}…"`,
        outcome: "AI response provided",
        timestamp: new Date().toISOString(),
      });
    }
  });

  // ── Reminder check loop ────────────────────────────
  setInterval(async () => {
    const dueReminders = getDueReminders();
    for (const reminder of dueReminders) {
      try {
        await bot.api.sendMessage(reminder.chatId, `⏰ *Reminder*: ${reminder.message}`, {
          parse_mode: "Markdown",
        });
        markReminderFired(reminder.id);
      } catch (err) {
        console.error(`Failed to send reminder ${reminder.id}:`, err);
      }
    }
  }, 30_000); // Check every 30 seconds

  // ── Error handler ──────────────────────────────────
  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  // ── Start polling ──────────────────────────────────
  console.log("🏹 RobinHoodCoin Soul Bot starting…");
  console.log(`   Agents active: ${soulNet.getActiveAgents().length}`);
  bot.start({
    onStart: (info) => {
      console.log(`✅ Soul online as @${info.username}`);
      console.log("   All modules loaded. Ready to create freedom. 🌿");
    },
  });

  const shutdown = (signal: string) => {
    console.log(`🛑 Received ${signal}, shutting down`);
    leaderLockHandle?.release();
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

// ── Stamp Commands Handler ───────────────────────────────

async function handleStamps(ctx: Context): Promise<void> {
  const campaigns = getActiveCampaigns();

  if (campaigns.length === 0) {
    await ctx.reply(
      "🎨 No active stamp campaigns right now. Stay tuned!\n\nSee available tiers: /tiers",
    );
    return;
  }

  const lines = campaigns.map((c) => {
    const progress = getCampaignProgress(c.id);
    const bar = progress
      ? `${"█".repeat(Math.floor(progress.percentFunded / 10))}${"░".repeat(10 - Math.floor(progress.percentFunded / 10))} ${progress.percentFunded}%`
      : "";
    return `🎨 *${c.name}* (${c.tier})
   💰 ${c.priceSOL} SOL each — ${c.minted}/${c.maxSupply || "∞"} minted
   📊 Funding: ${bar}
   🎯 Goal: ${c.goalSOL} SOL | Raised: ${c.raisedSOL} SOL`;
  });

  await ctx.reply(
    `🎨 *Active Stamp Campaigns*\n\n${lines.join("\n\n")}`,
    { parse_mode: "Markdown" },
  );
}

async function handleTiers(ctx: Context): Promise<void> {
  const tiers = Object.values(STAMP_TIERS);
  const lines = tiers.map((t) => {
    const supply = t.maxSupply > 0 ? `${t.maxSupply} max` : "unlimited";
    return `*${t.name}* — ${t.priceSOL} SOL (${supply})
   ${t.description}
   Benefits: ${t.benefits.join("; ")}`;
  });

  await ctx.reply(
    `🏷️ *Freeland Stamp Tiers*\n\n${lines.join("\n\n")}`,
    { parse_mode: "Markdown" },
  );
}

async function handleLands(ctx: Context): Promise<void> {
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

async function handleLandStamp(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? "";
  const args = text.replace(/^\/landstamp\s*/, "").trim();

  if (!args) {
    await ctx.reply(
      "🎟️ Create stamp batch from selected land.\n\nUsage:\n/landstamp <LAND-ID> | <maxSupply?> | <goalSOL?> | <valueSOL 0.5-1.5?>\n\nExample:\n/landstamp LAND-ABC123 | 180 | 162 | 0.9\n\nTip: run /lands first to see valid land IDs.",
    );
    return;
  }

  const parts = args.split("|").map((p) => p.trim()).filter(Boolean);
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

// ── Events Handler ───────────────────────────────────────

async function handleEvents(ctx: Context): Promise<void> {
  const events = getUpcomingEvents();

  if (events.length === 0) {
    await ctx.reply("📅 No upcoming events. Suggest one to the team!");
    return;
  }

  const lines = events.map((e) =>
    `📅 *${e.title}*\n   📍 ${e.location}\n   🕐 ${new Date(e.date).toLocaleDateString()}\n   👥 ${e.rsvps.length} RSVP(s)`,
  );

  await ctx.reply(
    `📅 *Upcoming Events*\n\n${lines.join("\n\n")}`,
    { parse_mode: "Markdown" },
  );
}

// ── Report Handler ───────────────────────────────────────

async function handleReport(ctx: Context): Promise<void> {
  await ctx.replyWithChatAction("typing");

  try {
    const treasuryAddr = process.env.TREASURY_MULTISIG_ADDRESS;
    const report = await generateReport(treasuryAddr);
    const formatted = formatReportTelegram(report);
    await ctx.reply(formatted, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("Report generation failed:", err);
    await ctx.reply("❌ Could not generate report. Try again later.");
  }
}

// ── Remind Handler ───────────────────────────────────────

async function handleRemind(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? "";
  const args = text.replace(/^\/remind\s*/, "").trim();

  if (!args) {
    await ctx.reply(
      `⏰ *Set a Reminder*\n\nUsage: \`/remind <minutes> <message>\`\n\nExample: \`/remind 60 Check the treasury balance\``,
      { parse_mode: "Markdown" },
    );
    return;
  }

  const match = args.match(/^(\d+)\s+(.+)$/);
  if (!match) {
    await ctx.reply("Usage: `/remind <minutes> <message>`", { parse_mode: "Markdown" });
    return;
  }

  const minutes = parseInt(match[1], 10);
  const message = match[2];
  const fireAt = new Date(Date.now() + minutes * 60_000).toISOString();
  const chatId = ctx.chat?.id?.toString() ?? "";
  const userId = ctx.from?.id?.toString() ?? "unknown";

  createReminder(message, fireAt, userId, chatId);
  await ctx.reply(`⏰ Reminder set! I'll remind you in ${minutes} minute(s): "${message}"`);
}

// ── Soul Status Handler ──────────────────────────────────

async function handleSoulStatus(ctx: Context): Promise<void> {
  const soulNet = getSoulNetwork();
  const agents = soulNet.getActiveAgents();
  const influence = soulNet.getInfluenceStats();

  const agentList = agents.map((a) => `  🤖 *${a.name}* (${a.role}) — ${a.platform}`).join("\n");

  await ctx.reply(
    `🧠 *Soul Network Status*

Active agents: ${agents.length}
${agentList}

🌱 *Influence*
Total actions: ${influence.totalActions}
Platforms: ${Object.entries(influence.byPlatform).map(([p, c]) => `${p}: ${c}`).join(", ") || "none yet"}

_The Soul spreads the idea of Freeland through every interaction.
Every conversation is a seed planted. 🌿_`,
    { parse_mode: "Markdown" },
  );
}

async function handleOpportunities(ctx: Context): Promise<void> {
  const opportunities = listOpportunities().slice(0, 8);

  if (opportunities.length === 0) {
    await ctx.reply(
      "🔎 No opportunities tracked yet. Little John can start scouting grants, auctions, and sponsorship leads.",
    );
    return;
  }

  const lines = opportunities.map((o, idx) => {
    const value = o.estimatedValueSOL ? `${o.estimatedValueSOL} SOL` : "n/a";
    const deadline = o.deadline ? new Date(o.deadline).toLocaleDateString() : "open";
    return `${idx + 1}. *${o.title}* (${o.type})
   score: ${o.score}/100 | value: ${value} | status: ${o.status}
   deadline: ${deadline}
   source: ${o.source}`;
  });

  await ctx.reply(
    `🎯 *Top Opportunities*\n\n${lines.join("\n\n")}`,
    { parse_mode: "Markdown" },
  );
}

async function handleScout(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? "";
  const args = text.replace(/^\/scout\s*/, "").trim();

  if (!args) {
    await ctx.reply(
      `🔎 *Add Opportunity*\n\nUsage:\n\`/scout <type> | <title> | <source> | <url> | <valueSOL> | <deadline> | <region> | <tags comma> | <requirements ;> | <notes>\`\n\nExample:\n\`/scout grant | CLT Seed Grant 2026 | Civic Grants Org | https://example.org/grant | 120 | 2026-04-15 | EU | community-land-trust,climate | nonprofit required; budget plan | strong fit for parcel #1\`\n\nTypes: \`grant\`, \`auction\`, \`sponsorship\``,
      { parse_mode: "Markdown" },
    );
    return;
  }

  const parts = args.split("|").map((p) => p.trim());
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
    ? parts[7].split(",").map((t) => t.trim()).filter(Boolean)
    : [];
  const requirements = parts[8]
    ? parts[8].split(";").map((r) => r.trim()).filter(Boolean)
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

async function handleApproveOpportunity(ctx: Context): Promise<void> {
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

main().catch((err) => {
  console.error("❌ Bot startup failed:", err);
  process.exit(1);
});
