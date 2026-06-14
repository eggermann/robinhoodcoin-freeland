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
import { TELEGRAM } from "../shared/config.js";
import { escapeTelegramMarkdown } from "./telegram.js";

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

// ── Session ──────────────────────────────────────────────

interface SessionData {
  messageCount: number;
  lastActive: string;
}

type BotContext = Context & SessionFlavor<SessionData>;

// ── Boot ─────────────────────────────────────────────────

function main() {
  if (!TELEGRAM.botToken) {
    console.error("❌ TELEGRAM_BOT_TOKEN is not set. Check your .env file.");
    process.exit(1);
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

  // ── Community Commands ─────────────────────────────
  bot.command("events", handleEvents);
  bot.command("report", handleReport);
  bot.command("remind", handleRemind);
  bot.command("soul", handleSoulStatus);

  // ── New member welcome ─────────────────────────────
  bot.on("message:new_chat_members", async (ctx) => {
    const members = ctx.message.new_chat_members;
    for (const member of members) {
      if (member.is_bot) continue;
      const name = member.first_name ?? member.username ?? "friend";
      const welcome = generatePersonalWelcome(escapeTelegramMarkdown(name));
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
        await bot.api.sendMessage(
          reminder.chatId,
          `⏰ *Reminder*: ${escapeTelegramMarkdown(reminder.message)}`,
          { parse_mode: "Markdown" },
        );
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

main();
