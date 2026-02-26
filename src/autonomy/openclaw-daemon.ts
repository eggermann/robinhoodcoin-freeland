import fs from "node:fs";
import path from "node:path";
import {
  AUTONOMY_DAEMON,
  TELEGRAM,
} from "../shared/config.js";
import {
  formatOpenClawAutonomousExperience,
  runOpenClawAutonomousExperience,
} from "../soul/skills/openclaw-autonomous-experience.js";
import {
  formatAutonomousGovernanceExecutorReport,
  runAutonomousGovernanceExecutor,
} from "../soul/skills/autonomous-governance-executor.js";
import { syncWebDashboardData } from "../soul/web-dashboard.js";

const DAEMON_LOG_FILE = "./data/autonomy/daemon-cycles.jsonl";

interface DaemonCycleSummary {
  startedAt: string;
  finishedAt: string;
  experience: Awaited<ReturnType<typeof runOpenClawAutonomousExperience>>;
  executor: Awaited<ReturnType<typeof runAutonomousGovernanceExecutor>>;
  dashboardSyncedAt?: string;
  dashboardSyncError?: string;
  error?: string;
}

function ensureLogDir(): void {
  fs.mkdirSync(path.dirname(DAEMON_LOG_FILE), { recursive: true });
}

function appendCycleLog(entry: DaemonCycleSummary): void {
  ensureLogDir();
  fs.appendFileSync(DAEMON_LOG_FILE, `${JSON.stringify(entry)}\n`, "utf-8");
}

function truncateForTelegram(text: string): string {
  return text.length <= 3900 ? text : `${text.slice(0, 3890)}\n...`;
}

async function sendTelegram(text: string): Promise<void> {
  const chatId = AUTONOMY_DAEMON.notifyChatId.trim();
  if (!chatId) return;
  if (!TELEGRAM.botToken.trim()) return;

  const endpoint = `https://api.telegram.org/bot${TELEGRAM.botToken}/sendMessage`;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: truncateForTelegram(text),
      disable_web_page_preview: true,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`telegram notify failed ${response.status}: ${body}`);
  }
}

function shouldNotify(summary: DaemonCycleSummary): boolean {
  if (AUTONOMY_DAEMON.notifyOnNoAlert) return true;
  if (summary.error) return true;
  if (summary.dashboardSyncError) return true;
  if (summary.experience.totalAlerts > 0) return true;
  if (summary.executor.errors.length > 0) return true;
  if (summary.executor.createdProposalIds.length > 0) return true;
  return false;
}

function formatDaemonCycle(summary: DaemonCycleSummary): string {
  const experience = formatOpenClawAutonomousExperience(summary.experience);
  const executor = formatAutonomousGovernanceExecutorReport(summary.executor);
  const dashboard = summary.dashboardSyncError
    ? `🌐 Dashboard sync: failed (${summary.dashboardSyncError})`
    : `🌐 Dashboard sync: ${summary.dashboardSyncedAt ?? "not-run"}`;

  return [
    "🤖 *OpenClaw Standalone Daemon Cycle*",
    dashboard,
    experience,
    "",
    executor,
    summary.error ? `\n❌ Daemon error: ${summary.error}` : "",
  ].join("\n");
}

async function runDaemonCycle(): Promise<DaemonCycleSummary> {
  const startedAt = new Date().toISOString();

  try {
    const experience = await runOpenClawAutonomousExperience();
    const executor = await runAutonomousGovernanceExecutor();
    let dashboardSyncedAt: string | undefined;
    let dashboardSyncError: string | undefined;

    try {
      const dashboard = await syncWebDashboardData();
      dashboardSyncedAt = dashboard.generatedAt;
    } catch (err) {
      dashboardSyncError = err instanceof Error ? err.message : String(err);
      console.error("Dashboard sync failed:", dashboardSyncError);
    }

    const summary: DaemonCycleSummary = {
      startedAt,
      finishedAt: new Date().toISOString(),
      experience,
      executor,
      dashboardSyncedAt,
      dashboardSyncError,
    };

    appendCycleLog(summary);
    console.log(formatDaemonCycle(summary));

    if (shouldNotify(summary)) {
      try {
        await sendTelegram(formatDaemonCycle(summary));
      } catch (notifyErr) {
        console.error("Standalone daemon notification failed:", notifyErr);
      }
    }

    return summary;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    const summary: DaemonCycleSummary = {
      startedAt,
      finishedAt: new Date().toISOString(),
      experience: {
        startedAt,
        finishedAt: startedAt,
        landScout: {
          startedAt,
          finishedAt: startedAt,
          configured: false,
          routedAgentId: "land-scout",
          requested: 0,
          received: 0,
          added: 0,
          shortlisted: 0,
          rejected: 0,
          checks: [],
          error: message,
        },
        financeMonitor: {
          startedAt,
          finishedAt: startedAt,
          snapshot: {
            configured: false,
            address: null,
            balanceLamports: 0,
            balanceSOL: 0,
            cluster: "custom",
            rpcEndpoint: "",
            explorerUrl: null,
            fetchedAt: startedAt,
            error: message,
          },
          previousBalanceSOL: null,
          deltaSOL: null,
          alerts: [],
          error: message,
        },
        roleCycle: {
          startedAt,
          finishedAt: startedAt,
          roles: [],
        },
        fusion: {
          startedAt,
          finishedAt: startedAt,
          summary: "Fusion driver failed.",
          actionsRequested: [],
          executed: [],
          skipped: [],
          errors: [message],
          raw: "",
        },
        totalActions: 0,
        totalAlerts: 1,
        topActions: [],
        topAlerts: [message],
        errors: [message],
      },
      executor: {
        startedAt,
        finishedAt: startedAt,
        createdProposalIds: [],
        activatedProposalIds: [],
        updatedOpportunityIds: [],
        generatedReportPeriods: [],
        skipped: [],
        errors: [message],
      },
      error: message,
    };

    appendCycleLog(summary);
    console.error("OpenClaw standalone daemon cycle failed:", message);
    return summary;
  }
}

async function main(): Promise<void> {
  if (!AUTONOMY_DAEMON.enabled) {
    console.log("🤖 Standalone daemon disabled (set OPENCLAW_DAEMON_ENABLED=true).");
    process.exit(0);
  }

  let running = false;

  const execute = async (): Promise<void> => {
    if (running) {
      console.log("🤖 Skipping daemon cycle: previous run still in progress.");
      return;
    }
    running = true;
    try {
      await runDaemonCycle();
    } finally {
      running = false;
    }
  };

  if (AUTONOMY_DAEMON.runOnBoot) {
    await execute();
  }

  if (AUTONOMY_DAEMON.once) {
    console.log("🤖 Standalone daemon finished one-shot cycle (OPENCLAW_DAEMON_ONCE=true).");
    process.exit(0);
  }

  const intervalMs = Math.max(30_000, AUTONOMY_DAEMON.intervalMs);
  console.log(`🤖 Standalone daemon active (${intervalMs}ms interval).`);

  const timer = setInterval(() => {
    void execute();
  }, intervalMs);

  const shutdown = (signal: string) => {
    clearInterval(timer);
    console.log(`🛑 Standalone daemon shutting down on ${signal}`);
    process.exit(0);
  };

  process.once("SIGINT", () => shutdown("SIGINT"));
  process.once("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("❌ Standalone daemon failed to start:", err);
  process.exit(1);
});
