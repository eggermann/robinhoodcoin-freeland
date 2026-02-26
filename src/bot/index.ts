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
  const reminderLoop = startReminderLoop(bot);
  const openClawExperienceLoop = startOpenClawExperienceLoop(bot);
  const runIndependentLoops = !(AUTOEXPERIENCE.enabled && AUTOEXPERIENCE.exclusive);
  if (!runIndependentLoops) {
    console.log("🤖 OpenClaw experience is running in exclusive mode; standalone autonomy loops are skipped.");
  }
  const landScoutLoop = runIndependentLoops ? startLandScoutLoop(bot) : null;
  const financeMonitorLoop = runIndependentLoops ? startFinanceMonitorLoop(bot) : null;
  const openClawAutonomyLoop = runIndependentLoops ? startOpenClawAutonomyLoop(bot) : null;

  bot.catch((err) => {
    console.error("Bot error:", err);
  });

  console.log("🏹 RobinHoodCoin Soul Bot starting…");
  console.log(`   Agents active: ${getSoulNetwork().getActiveAgents().length}`);

  bot.start({
    onStart: (info) => {
      console.log(`✅ Soul online as @${info.username}`);
      console.log("   All modules loaded. Ready to create freedom. 🌿");
    },
  });

  const shutdown = (signal: string) => {
    console.log(`🛑 Received ${signal}, shutting down`);
    clearInterval(reminderLoop);
    if (landScoutLoop) {
      clearInterval(landScoutLoop);
    }
    if (financeMonitorLoop) {
      clearInterval(financeMonitorLoop);
    }
    if (openClawAutonomyLoop) {
      clearInterval(openClawAutonomyLoop);
    }
    if (openClawExperienceLoop) {
      clearInterval(openClawExperienceLoop);
    }
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
