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
