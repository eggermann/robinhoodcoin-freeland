import "dotenv/config";
import { Keypair, Connection, clusterApiUrl } from "@solana/web3.js";
import fs from "node:fs";
import path from "node:path";

// ── Solana connection ────────────────────────────────────
export const RPC_URL =
  process.env.SOLANA_RPC_URL ?? clusterApiUrl("devnet");

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

// ── Bot runtime config ──────────────────────────────────
export const BOT = {
  adminIds: (process.env.BOT_ADMIN_IDS ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean),
  leaderLockMode: (process.env.BOT_LEADER_LOCK_MODE ?? "none").toLowerCase(),
  leaderLockFile: process.env.BOT_LEADER_LOCK_FILE ?? "./data/bot/leader.lock",
  leaderLockTtlMs: Number(process.env.BOT_LEADER_LOCK_TTL_MS ?? "60000"),
  leaderLockHeartbeatMs: Number(process.env.BOT_LEADER_LOCK_HEARTBEAT_MS ?? "15000"),
  leaderLockRetryWaitMs: Number(process.env.BOT_LEADER_LOCK_RETRY_WAIT_MS ?? "5000"),
} as const;

// ── AI config ────────────────────────────────────────────
const aiProvider = (process.env.AI_PROVIDER ?? "anthropic").toLowerCase();
const defaultAiModel = aiProvider === "openai"
  ? "gpt-4.1-mini"
  : "claude-sonnet-4-20250514";

export const AI = {
  provider: aiProvider,
  apiKey: process.env.AI_API_KEY ?? "",
  model: process.env.AI_MODEL ?? defaultAiModel,
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
