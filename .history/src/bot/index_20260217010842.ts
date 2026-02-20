/**
 * OpenClaw / RobinHoodCoin Telegram Bot
 *
 * A grammY-based Telegram bot that serves as the project's AI assistant.
 * It handles:
 *   - FAQ and project information
 *   - Treasury balance queries
 *   - Community coordination
 *   - Reminders and announcements
 *
 * Usage:
 *   npx tsx src/bot/index.ts          (dev)
 *   node dist/bot/index.js            (production)
 */

import { Bot, Context, session, type SessionFlavor } from "grammy";
import { TELEGRAM, AI } from "../shared/config.js";
import { handleStart } from "./commands/start.js";
import { handleHelp } from "./commands/help.js";
import { handleTreasury } from "./commands/treasury.js";
import { handleMission } from "./commands/mission.js";
import { handleAsk } from "./commands/ask.js";

// ── Session data ─────────────────────────────────────────
interface SessionData {
  /** Number of messages the user has sent */
  messageCount: number;
}

type BotContext = Context & SessionFlavor<SessionData>;

// ── Boot ─────────────────────────────────────────────────
function main() {
  if (!TELEGRAM.botToken) {
    console.error("❌ TELEGRAM_BOT_TOKEN is not set. Check your .env file.");
    process.exit(1);
  }

  const bot = new Bot<BotContext>(TELEGRAM.botToken);

  // Session middleware
  bot.use(
    session({
      initial: (): SessionData => ({ messageCount: 0 }),
    }),
  );

  // ── Commands ─────────────────────────────────────────
  bot.command("start", handleStart);
  bot.command("help", handleHelp);
  bot.command("treasury", handleTreasury);
  bot.command("mission", handleMission);

  // ── Free-text handler (AI Q&A) ──────────────────────
  bot.on("message:text", async (ctx) => {
    ctx.session.messageCount++;

    // If the message mentions the bot or is a DM, route to AI
    const text = ctx.message.text;
    const isDM = ctx.chat.type === "private";
    const mentionsBot = text.toLowerCase().includes("@robinhoodcoinbot");

    if (isDM || mentionsBot) {
      await handleAsk(ctx, text);
    }
  });

  // ── Error handler ────────────────────────────────────
  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  // ── Start polling ────────────────────────────────────
  console.log("🏹 RobinHoodCoin Bot starting…");
  bot.start({
    onStart: (info) => {
      console.log(`✅ Bot online as @${info.username}`);
    },
  });
}

main();
