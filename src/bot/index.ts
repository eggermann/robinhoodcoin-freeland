/**
 * OpenClaw / RobinHoodCoin Telegram Bot — "Soul"
 *
 * Bootstraps runtime configuration and registers command/event modules.
 */

import { Bot, session } from "grammy";
import {
  AUTOEXPERIENCE,
  BOT,
  CAMPAIGN_MODE,
  MEMORY,
  TELEGRAM,
  assertSecrets,
} from "../shared/config.js";
import { FileLeaderLock, type LeaderLockHandle } from "./leader-lock.js";
import { TextFileMemoryStore } from "./text-memory.js";
import { configureAskMemory } from "./commands/ask.js";
import { handleAutonomy } from "./commands/autonomy.js";
import { handleModel } from "./commands/model.js";
import { handleStart } from "./commands/start.js";
import { handleHelp } from "./commands/help.js";
import { handleTreasury } from "./commands/treasury.js";
import { handleMission } from "./commands/mission.js";
import {
  handlePropose,
  handleProposals,
  handleProposalDetail,
  handleActivate,
  handleVote,
  handleFinalize,
} from "./commands/governance.js";
import {
  handleStamps,
  handleTiers,
  handleLands,
  handleLandStamp,
  handleStampMint,
  handleMember,
} from "./commands/stamps.js";
import {
  handleEvents,
  handleReport,
  handleRemind,
} from "./commands/community.js";
import {
  handleSoulStatus,
  handleOpportunities,
  handleScout,
  handleApproveOpportunity,
} from "./commands/soul.js";
import { registerChatHandlers } from "./handlers/chat.js";
import { startReminderLoop } from "./loops/reminders.js";
import { startLandScoutLoop } from "./loops/land-scout.js";
import { startFinanceMonitorLoop } from "./loops/finance-monitor.js";
import { startOpenClawAutonomyLoop } from "./loops/openclaw-autonomy.js";
import { startOpenClawExperienceLoop } from "./loops/openclaw-experience.js";
import { getSoulNetwork } from "../soul/network.js";
import type { BotContext, SessionData } from "./types.js";

const TELEGRAM_CONFLICT_RETRY_ATTEMPTS = Number(
  process.env.BOT_TELEGRAM_CONFLICT_RETRY_ATTEMPTS ?? "5",
);
const TELEGRAM_CONFLICT_RETRY_DELAY_MS = Number(
  process.env.BOT_TELEGRAM_CONFLICT_RETRY_DELAY_MS ?? "2500",
);

function buildLeaderId(): string {
  const host = process.env.HOSTNAME ?? "unknown-host";
  return `${host}:${process.pid}`;
}

async function acquireLeaderLock(): Promise<LeaderLockHandle | null> {
  if (BOT.leaderLockMode !== "file") {
    return null;
  }

  const leaderLock = new FileLeaderLock({
    lockFile: BOT.leaderLockFile,
    ownerId: buildLeaderId(),
    ttlMs: BOT.leaderLockTtlMs,
    heartbeatMs: BOT.leaderLockHeartbeatMs,
    retryWaitMs: BOT.leaderLockRetryWaitMs,
  });

  console.log("🔒 Leader lock mode: file");
  console.log(`   Waiting for leadership lock at ${BOT.leaderLockFile}`);

  const handle = await leaderLock.waitForLeadership((error) => {
    console.error("❌ Leader lock lost:", error.message);
    process.exit(1);
  });

  console.log(`✅ Leadership acquired as ${handle.ownerId}`);
  return handle;
}

function configureMemory(): void {
  if (!MEMORY.enabled) {
    configureAskMemory(null);
    console.log("🧠 Text memory disabled (set BOT_MEMORY_ENABLED=true to enable).");
    return;
  }

  const textMemoryStore = new TextFileMemoryStore({
    memoryDir: MEMORY.dir,
    maxRecallResults: MEMORY.maxRecallResults,
    recentFactsCount: MEMORY.recentFactsCount,
    maxEntriesPerScope: MEMORY.maxEntriesPerScope,
  });

  configureAskMemory({
    retrieve: (input) => textMemoryStore.retrieve(input),
    capture: (input) => textMemoryStore.capture(input),
  });

  console.log(`🧠 Text memory enabled at ${MEMORY.dir}`);
}

function registerCommands(bot: Bot<BotContext>): void {
  // Core commands
  bot.command("start", handleStart);
  bot.command("help", handleHelp);
  bot.command("treasury", handleTreasury);
  bot.command("mission", handleMission);
  bot.command("autonomy", handleAutonomy);
  bot.command("model", handleModel);

  // Governance commands
  bot.command("propose", handlePropose);
  bot.command("proposals", handleProposals);
  bot.command("proposal", handleProposalDetail);
  bot.command("activate", handleActivate);
  bot.command("vote", handleVote);
  bot.command("finalize", handleFinalize);

  // Stamp commands
  bot.command("stamps", handleStamps);
  bot.command("tiers", handleTiers);
  bot.command("lands", handleLands);
  bot.command("landstamp", handleLandStamp);
  bot.command("stampmint", handleStampMint);
  bot.command("member", handleMember);

  // Community commands
  bot.command("events", handleEvents);
  bot.command("report", handleReport);
  bot.command("remind", handleRemind);

  // Soul/Ops commands
  bot.command("soul", handleSoulStatus);
  bot.command("opportunities", handleOpportunities);
  bot.command("scout", handleScout);
  bot.command("approveopp", handleApproveOpportunity);
}

function spawnSoulAgents(): void {
  const soulNet = getSoulNetwork();
  soulNet.spawnSubAgent("finance", "telegram");
  soulNet.spawnSubAgent("land-scout", "telegram");
  soulNet.spawnSubAgent("pr", "telegram");
  soulNet.spawnSubAgent("moderator", "telegram");
  soulNet.spawnSubAgent("governance", "telegram");
}

function isTelegramPollingConflict(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const candidate = err as { error_code?: unknown; description?: unknown };
  if (candidate.error_code === 409) return true;
  return typeof candidate.description === "string"
    && candidate.description.toLowerCase().includes("terminated by other getupdates request");
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function main() {
  assertSecrets();

  if (!TELEGRAM.botToken) {
    console.error("❌ TELEGRAM_BOT_TOKEN is not set. Check your .env file.");
    process.exit(1);
  }

  const leaderLockHandle = await acquireLeaderLock();
  const bot = new Bot<BotContext>(TELEGRAM.botToken);

  configureMemory();
  spawnSoulAgents();

  bot.use(
    session({
      initial: (): SessionData => ({
        messageCount: 0,
        lastActive: new Date().toISOString(),
      }),
    }),
  );

  registerCommands(bot);
  registerChatHandlers(bot, getSoulNetwork(), {
    aiEnabled: BOT.chatAiEnabled,
  });

  if (CAMPAIGN_MODE.enabled) {
    console.log(
      "🎯 OpenClaw campaign mode enabled (OpenClaw chat + autonomous experience + fusion).",
    );
  }

  if (!BOT.chatAiEnabled) {
    console.log("💬 Chat AI disabled (BOT_CHAT_AI_ENABLED=false). Running command/FAQ and autonomous workers only.");
  }

  let reminderLoop: NodeJS.Timeout | null = null;
  let openClawExperienceLoop: NodeJS.Timeout | null = null;
  let landScoutLoop: NodeJS.Timeout | null = null;
  let financeMonitorLoop: NodeJS.Timeout | null = null;
  let openClawAutonomyLoop: NodeJS.Timeout | null = null;
  let loopsStarted = false;

  const startBackgroundLoops = () => {
    if (loopsStarted) {
      return;
    }
    loopsStarted = true;

    reminderLoop = startReminderLoop(bot);
    openClawExperienceLoop = startOpenClawExperienceLoop(bot);
    const runIndependentLoops = !(AUTOEXPERIENCE.enabled && AUTOEXPERIENCE.exclusive);
    if (!runIndependentLoops) {
      console.log("🤖 OpenClaw experience is running in exclusive mode; standalone autonomy loops are skipped.");
    }
    landScoutLoop = runIndependentLoops ? startLandScoutLoop(bot) : null;
    financeMonitorLoop = runIndependentLoops ? startFinanceMonitorLoop(bot) : null;
    openClawAutonomyLoop = runIndependentLoops ? startOpenClawAutonomyLoop(bot) : null;
  };

  const stopBackgroundLoops = () => {
    if (reminderLoop) {
      clearInterval(reminderLoop);
      reminderLoop = null;
    }
    if (landScoutLoop) {
      clearInterval(landScoutLoop);
      landScoutLoop = null;
    }
    if (financeMonitorLoop) {
      clearInterval(financeMonitorLoop);
      financeMonitorLoop = null;
    }
    if (openClawAutonomyLoop) {
      clearInterval(openClawAutonomyLoop);
      openClawAutonomyLoop = null;
    }
    if (openClawExperienceLoop) {
      clearInterval(openClawExperienceLoop);
      openClawExperienceLoop = null;
    }
    loopsStarted = false;
  };

  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  console.log("🏹 RobinHoodCoin Soul Bot starting…");
  console.log(`   Agents active: ${getSoulNetwork().getActiveAgents().length}`);

  const startPolling = async () => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        await bot.start({
          onStart: (info) => {
            console.log(`✅ Soul online as @${info.username}`);
            console.log("   All modules loaded. Ready to create freedom. 🌿");
            startBackgroundLoops();
          },
        });
        return;
      } catch (err) {
        const shouldRetry =
          isTelegramPollingConflict(err) && attempt <= TELEGRAM_CONFLICT_RETRY_ATTEMPTS;
        if (shouldRetry) {
          stopBackgroundLoops();
          bot.stop();
          console.error(
            `⚠️ Telegram polling conflict (409): another bot instance is already running (${attempt}/${TELEGRAM_CONFLICT_RETRY_ATTEMPTS}).`,
          );
          console.error(
            `   Retrying in ${TELEGRAM_CONFLICT_RETRY_DELAY_MS}ms. Stop duplicate processes if this persists.`,
          );
          await wait(TELEGRAM_CONFLICT_RETRY_DELAY_MS);
          continue;
        }
        throw err;
      }
    }
  };

  void startPolling().catch((err) => {
    if (isTelegramPollingConflict(err)) {
      console.error(
        "❌ Telegram polling conflict (409): retries exhausted. Another bot instance is still running with the same TELEGRAM_BOT_TOKEN.",
      );
      console.error(
        "   Stop duplicate processes (supervisor/dev session) and restart a single instance.",
      );
    } else {
      console.error("❌ Bot polling failed:", err);
    }
    stopBackgroundLoops();
    leaderLockHandle?.release();
    process.exit(1);
  });

  const shutdown = (signal: string) => {
    console.log(`🛑 Received ${signal}, shutting down`);
    stopBackgroundLoops();
    bot.stop();
    leaderLockHandle?.release();
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("❌ Bot startup failed:", err);
  process.exit(1);
});
