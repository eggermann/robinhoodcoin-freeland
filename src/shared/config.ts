import "dotenv/config";
import { Keypair, Connection, clusterApiUrl } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";

const campaignModeEnabled =
  (process.env.OPENCLAW_CAMPAIGN_MODE ?? "false").toLowerCase() === "true";

// ── Solana connection ────────────────────────────────────
const SOLANA_CLUSTER = (process.env.SOLANA_CLUSTER ?? "").toLowerCase();

function resolveClusterRpcUrl(cluster: string): string | null {
  if (cluster === "devnet" || cluster === "testnet" || cluster === "mainnet-beta") {
    return clusterApiUrl(cluster);
  }
  return null;
}

export const RPC_URL =
  process.env.SOLANA_RPC_URL
  ?? resolveClusterRpcUrl(SOLANA_CLUSTER)
  ?? clusterApiUrl("devnet");

export const connection = new Connection(RPC_URL, "confirmed");

// ── Keypair loader ───────────────────────────────────────
export function loadKeypair(
  envVar = "SOLANA_KEYPAIR_PATH",
  fallback = "./keys/deployer.json",
): Keypair {
  const filePath = process.env[envVar] ?? fallback;
  const resolved = path.resolve(filePath);

  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Keypair file not found at "${resolved}". ` +
        `Generate one with: solana-keygen new -o ${filePath}`,
    );
  }

  const raw = JSON.parse(fs.readFileSync(resolved, "utf-8")) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(raw));
}

// ── Token config ─────────────────────────────────────────
export const TOKEN = {
  name: process.env.RHC_TOKEN_NAME ?? "RobinHoodCoin",
  symbol: process.env.RHC_TOKEN_SYMBOL ?? "RHC",
  decimals: Number(process.env.RHC_TOKEN_DECIMALS ?? 9),
  totalSupply: BigInt(process.env.RHC_TOTAL_SUPPLY ?? "1000000000"),
} as const;

// ── NFT config ───────────────────────────────────────────
export const NFT = {
  collectionName: process.env.NFT_COLLECTION_NAME ?? "Freeland Stamps",
  collectionSymbol: process.env.NFT_COLLECTION_SYMBOL ?? "FSTAMP",
  baseUri: process.env.NFT_BASE_URI ?? "https://robinhoodcoin.org/api/metadata/",
} as const;

// ── Telegram bot config ──────────────────────────────────
export const TELEGRAM = {
  botToken: process.env.TELEGRAM_BOT_TOKEN ?? "",
} as const;

// ── SMTP config ────────────────────────────────────────
export const SMTP = {
  host: process.env.SMTP_HOST ?? "",
  port: Number(process.env.SMTP_PORT ?? "587"),
  secure: (process.env.SMTP_SECURE ?? "false").toLowerCase() === "true",
  user: process.env.SMTP_USER ?? "",
  pass: process.env.SMTP_PASS ?? "",
  from: process.env.SMTP_FROM ?? "Soul - RobinHoodCoin <noreply@yourdomain.tld>",
} as const;

// ── Bot runtime config ──────────────────────────────────
export const BOT = {
  adminIds: (process.env.BOT_ADMIN_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
  chatAiEnabled:
    campaignModeEnabled
    || (process.env.BOT_CHAT_AI_ENABLED ?? "true").toLowerCase() !== "false",
  leaderLockMode: (process.env.BOT_LEADER_LOCK_MODE ?? "none").toLowerCase(),
  leaderLockFile: process.env.BOT_LEADER_LOCK_FILE ?? "./data/bot/leader.lock",
  leaderLockTtlMs: Number(process.env.BOT_LEADER_LOCK_TTL_MS ?? "60000"),
  leaderLockHeartbeatMs: Number(process.env.BOT_LEADER_LOCK_HEARTBEAT_MS ?? "15000"),
  leaderLockRetryWaitMs: Number(process.env.BOT_LEADER_LOCK_RETRY_WAIT_MS ?? "5000"),
} as const;

// ── AI config ────────────────────────────────────────────
const aiProvider = campaignModeEnabled
  ? "openclaw"
  : (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
const defaultAiModel = aiProvider === "openai"
  ? "gpt-4.1-mini"
  : aiProvider === "openclaw"
    ? "openclaw"
    : "claude-sonnet-4-20250514";

export const AI = {
  provider: aiProvider,
  apiKey: process.env.AI_API_KEY ?? "",
  model: process.env.AI_MODEL ?? defaultAiModel,
} as const;

// ── AI runtime model switching (for AI_PROVIDER=openclaw) ─
export const AI_RUNTIME = {
  modelOrder: parseCsv(
    process.env.AI_RUNTIME_MODEL_ORDER ?? "openclaw,nvidia-kimi",
  ).map((value) => value.toLowerCase()),
  defaultModel: (process.env.AI_RUNTIME_DEFAULT_MODEL ?? "openclaw").toLowerCase(),
  autoSwitch:
    (process.env.AI_RUNTIME_AUTO_SWITCH ?? "true").toLowerCase() !== "false",
  fallbackNote:
    (process.env.AI_RUNTIME_FALLBACK_NOTE ?? "true").toLowerCase() !== "false",
  persistFile: process.env.AI_RUNTIME_PERSIST_FILE ?? ".env",
  restartCommand: process.env.AI_RUNTIME_RESTART_COMMAND ?? "",
  restartDelayMs: Number(process.env.AI_RUNTIME_RESTART_DELAY_MS ?? "1200"),
  restartOnManualSwitch:
    (process.env.AI_RUNTIME_RESTART_ON_MANUAL_SWITCH ?? "true").toLowerCase() !== "false",
  restartOnAutoSwitch:
    (process.env.AI_RUNTIME_RESTART_ON_AUTO_SWITCH ?? "true").toLowerCase() !== "false",
} as const;

// ── NVIDIA Kimi fallback (OpenAI-compatible endpoint) ───
export const NVIDIA = {
  enabled:
    (process.env.NVIDIA_FALLBACK_ENABLED ?? "true").toLowerCase() !== "false",
  apiKey: process.env.NVIDIA_API_KEY ?? "",
  baseUrl: process.env.NVIDIA_BASE_URL ?? "https://integrate.api.nvidia.com/v1",
  model: process.env.NVIDIA_MODEL ?? "moonshotai/kimi-k2.5",
  maxTokens: Number(process.env.NVIDIA_MAX_TOKENS ?? "1024"),
  temperature: Number(process.env.NVIDIA_TEMPERATURE ?? "0.7"),
  topP: Number(process.env.NVIDIA_TOP_P ?? "1"),
  thinking: (process.env.NVIDIA_THINKING ?? "false").toLowerCase() === "true",
} as const;

// ── OpenClaw gateway config ──────────────────────────────
export const OPENCLAW = {
  gatewayUrl: process.env.OPENCLAW_GATEWAY_URL ?? "http://127.0.0.1:18789",
  bearerToken:
    process.env.OPENCLAW_GATEWAY_TOKEN
    ?? process.env.OPENCLAW_GATEWAY_PASSWORD
    ?? "",
  agentId: process.env.OPENCLAW_AGENT_ID ?? "main",
  enableRoleRouting:
    (process.env.OPENCLAW_ENABLE_ROLE_ROUTING ?? "true").toLowerCase() !== "false",
  debugRouting:
    (process.env.OPENCLAW_DEBUG_ROUTING ?? "false").toLowerCase() === "true",
  agents: {
    soul: process.env.OPENCLAW_AGENT_SOUL_ID
      ?? process.env.OPENCLAW_AGENT_ID
      ?? "main",
    finance: process.env.OPENCLAW_AGENT_FINANCE_ID ?? "finance",
    landScout: process.env.OPENCLAW_AGENT_LAND_SCOUT_ID ?? "land-scout",
    pr: process.env.OPENCLAW_AGENT_PR_ID ?? "pr",
    moderator: process.env.OPENCLAW_AGENT_MODERATOR_ID ?? "moderator",
    governance: process.env.OPENCLAW_AGENT_GOVERNANCE_ID ?? "governance",
  },
  model: process.env.OPENCLAW_MODEL ?? "openclaw",
  chatCompletionsPath:
    process.env.OPENCLAW_CHAT_COMPLETIONS_PATH ?? "/v1/chat/completions",
  timeoutMs: Number(process.env.OPENCLAW_TIMEOUT_MS ?? "60000"),
} as const;

function parseCsv(raw: string): string[] {
  return raw
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

// ── OpenClaw campaign mode profile ──────────────────────
export const CAMPAIGN_MODE = {
  enabled: campaignModeEnabled,
  forceOpenClawProvider: campaignModeEnabled,
  forceChatAi: campaignModeEnabled,
  forceExperience: campaignModeEnabled,
  forceExperienceExclusive: campaignModeEnabled,
  forceFusion: campaignModeEnabled,
} as const;

// ── OpenClaw autonomous role workers ───────────────────
export const AUTOCLAW = {
  enabled:
    (process.env.OPENCLAW_AUTONOMOUS_ENABLED ?? "false").toLowerCase() === "true",
  runOnBoot:
    (process.env.OPENCLAW_AUTONOMOUS_RUN_ON_BOOT ?? "true").toLowerCase() !== "false",
  intervalMs: Number(process.env.OPENCLAW_AUTONOMOUS_INTERVAL_MS ?? "900000"),
  roles: parseCsv(
    process.env.OPENCLAW_AUTONOMOUS_ROLES ?? "governance,pr,moderator",
  ),
  notifyChatId: process.env.OPENCLAW_AUTONOMOUS_NOTIFY_CHAT_ID ?? "",
  maxTokens: Number(process.env.OPENCLAW_AUTONOMOUS_MAX_TOKENS ?? "900"),
  temperature: Number(process.env.OPENCLAW_AUTONOMOUS_TEMPERATURE ?? "0.2"),
} as const;

// ── OpenClaw DAO/User/Stamp fusion driver ─────────────
export const AUTOFUSION = {
  enabled:
    campaignModeEnabled
    || (process.env.OPENCLAW_FUSION_ENABLED ?? "true").toLowerCase() !== "false",
  maxActions: Number(process.env.OPENCLAW_FUSION_MAX_ACTIONS ?? "3"),
  maxTokens: Number(process.env.OPENCLAW_FUSION_MAX_TOKENS ?? "1000"),
  temperature: Number(process.env.OPENCLAW_FUSION_TEMPERATURE ?? "0.1"),
} as const;

// ── OpenClaw autonomous experience (orchestrated cycle) ─
export const AUTOEXPERIENCE = {
  enabled:
    campaignModeEnabled
    || (process.env.OPENCLAW_EXPERIENCE_ENABLED ?? "false").toLowerCase() === "true",
  runOnBoot:
    campaignModeEnabled
    || (process.env.OPENCLAW_EXPERIENCE_RUN_ON_BOOT ?? "true").toLowerCase() !== "false",
  intervalMs: Number(process.env.OPENCLAW_EXPERIENCE_INTERVAL_MS ?? "1800000"),
  notifyChatId: process.env.OPENCLAW_EXPERIENCE_NOTIFY_CHAT_ID ?? "",
  notifyOnNoAlert:
    (process.env.OPENCLAW_EXPERIENCE_NOTIFY_ON_NO_ALERT ?? "false").toLowerCase() === "true",
  // When true, this orchestrated loop replaces individual role/scout/finance loops.
  exclusive:
    campaignModeEnabled
    || (process.env.OPENCLAW_EXPERIENCE_EXCLUSIVE ?? "true").toLowerCase() !== "false",
} as const;

// ── File-based memory config ─────────────────────────────
export const MEMORY = {
  enabled: (process.env.BOT_MEMORY_ENABLED ?? "true").toLowerCase() !== "false",
  dir: process.env.BOT_MEMORY_DIR ?? "./data/memory",
  maxRecallResults: Number(process.env.BOT_MEMORY_MAX_RECALL_RESULTS ?? "8"),
  recentFactsCount: Number(process.env.BOT_MEMORY_RECENT_FACTS_COUNT ?? "4"),
  maxEntriesPerScope: Number(process.env.BOT_MEMORY_MAX_ENTRIES_PER_SCOPE ?? "500"),
} as const;

// ── Autonomous land scout config ───────────────────────
export const AUTOSCOUT = {
  enabled:
    (process.env.LAND_SCOUT_AUTONOMOUS_ENABLED ?? "false").toLowerCase() === "true",
  runOnBoot:
    (process.env.LAND_SCOUT_AUTONOMOUS_RUN_ON_BOOT ?? "true").toLowerCase() !== "false",
  intervalMs: Number(process.env.LAND_SCOUT_AUTONOMOUS_INTERVAL_MS ?? "3600000"),
  maxCandidatesPerRun: Number(process.env.LAND_SCOUT_AUTONOMOUS_MAX_CANDIDATES ?? "5"),
  shortlistMinScore: Number(process.env.LAND_SCOUT_AUTONOMOUS_SHORTLIST_MIN_SCORE ?? "72"),
  verifySourceReachability:
    (process.env.LAND_SCOUT_VERIFY_SOURCE_REACHABILITY ?? "true").toLowerCase() !== "false",
  sourceTimeoutMs: Number(process.env.LAND_SCOUT_SOURCE_TIMEOUT_MS ?? "5000"),
  notifyChatId: process.env.LAND_SCOUT_NOTIFY_CHAT_ID ?? "",
  regionHint: process.env.LAND_SCOUT_REGION_HINT ?? "",
} as const;

// ── Autonomous finance monitor config ──────────────────
export const AUTOFINANCE = {
  enabled: (process.env.FINANCE_MONITOR_ENABLED ?? "false").toLowerCase() === "true",
  runOnBoot: (process.env.FINANCE_MONITOR_RUN_ON_BOOT ?? "true").toLowerCase() !== "false",
  intervalMs: Number(process.env.FINANCE_MONITOR_INTERVAL_MS ?? "300000"),
  minBalanceSolAlert: Number(process.env.FINANCE_MONITOR_MIN_BALANCE_SOL_ALERT ?? "5"),
  largeOutflowSolAlert: Number(process.env.FINANCE_MONITOR_LARGE_OUTFLOW_SOL_ALERT ?? "25"),
  largeInflowSolAlert: Number(process.env.FINANCE_MONITOR_LARGE_INFLOW_SOL_ALERT ?? "25"),
  notifyChatId: process.env.FINANCE_MONITOR_NOTIFY_CHAT_ID ?? "",
  notifyOnNoAlert:
    (process.env.FINANCE_MONITOR_NOTIFY_ON_NO_ALERT ?? "false").toLowerCase() === "true",
} as const;

// ── Autonomous execution policy (no Telegram required) ──
export const AUTOEXEC = {
  enabled:
    (process.env.AUTONOMY_EXECUTOR_ENABLED ?? "true").toLowerCase() !== "false",
  autoActivateProposals:
    (process.env.AUTONOMY_EXECUTOR_AUTO_ACTIVATE_PROPOSALS ?? "true").toLowerCase() !== "false",
  votingWindowHours: Number(process.env.AUTONOMY_EXECUTOR_VOTING_WINDOW_HOURS ?? "168"),
  opportunityMinScore: Number(process.env.AUTONOMY_EXECUTOR_OPPORTUNITY_MIN_SCORE ?? "80"),
  opportunityMaxPerCycle: Number(process.env.AUTONOMY_EXECUTOR_OPPORTUNITY_MAX_PER_CYCLE ?? "2"),
  landMinScore: Number(process.env.AUTONOMY_EXECUTOR_LAND_MIN_SCORE ?? "82"),
  landMaxPerCycle: Number(process.env.AUTONOMY_EXECUTOR_LAND_MAX_PER_CYCLE ?? "1"),
  generateMonthlyReport:
    (process.env.AUTONOMY_EXECUTOR_MONTHLY_REPORT ?? "true").toLowerCase() !== "false",
  maxStateEntries: Number(process.env.AUTONOMY_EXECUTOR_MAX_STATE_ENTRIES ?? "2000"),
} as const;

// ── Standalone OpenClaw daemon (headless autonomy) ─────
export const AUTONOMY_DAEMON = {
  enabled:
    (process.env.OPENCLAW_DAEMON_ENABLED ?? "false").toLowerCase() === "true",
  runOnBoot:
    (process.env.OPENCLAW_DAEMON_RUN_ON_BOOT ?? "true").toLowerCase() !== "false",
  intervalMs: Number(process.env.OPENCLAW_DAEMON_INTERVAL_MS ?? "1800000"),
  once:
    (process.env.OPENCLAW_DAEMON_ONCE ?? "false").toLowerCase() === "true",
  notifyChatId: process.env.OPENCLAW_DAEMON_NOTIFY_CHAT_ID ?? "",
  notifyOnNoAlert:
    (process.env.OPENCLAW_DAEMON_NOTIFY_ON_NO_ALERT ?? "false").toLowerCase() === "true",
} as const;

// ── PayPal / Operations split ───────────────────────────
// Rule: From the 10% operations budget, 40% must be paid into PayPal.
// => 0.10 * 0.40 = 0.04 (4%) of total inflows, conceptually earmarked.
export const PAYPAL = {
  // Secret: MUST come from .env. Do not hardcode or display publicly.
  receiver: process.env.PAYPAL_RECEIVER,
  // Share of the OPERATIONS bucket (not of total)
  operationsShare: Number(process.env.OPERATIONS_PAYPAL_SHARE ?? "0.4"),
} as const;

export function assertSecrets(): void {
  if (!PAYPAL.receiver) {
    throw new Error("Missing PAYPAL_RECEIVER in environment (.env).");
  }
}
