import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { connection } from "../../shared/config.js";

export interface TreasuryTrackerSnapshot {
  configured: boolean;
  address: string | null;
  balanceLamports: number;
  balanceSOL: number;
  cluster: "devnet" | "testnet" | "mainnet-beta" | "custom";
  rpcEndpoint: string;
  explorerUrl: string | null;
  fetchedAt: string;
  error?: string;
}

const ENV_TREASURY_ADDRESS = process.env.TREASURY_MULTISIG_ADDRESS ?? "";

function normalizeTreasuryAddress(raw: string): string {
  const trimmed = raw.trim().replace(/^['\"]|['\"]$/g, "");
  if (!trimmed) return "";

  // Accept accidental full assignment strings pasted into env values, e.g.
  // "TREASURY_MULTISIG_ADDRESS=..."
  const eqIndex = trimmed.indexOf("=");
  if (eqIndex >= 0) {
    return trimmed.slice(eqIndex + 1).trim().replace(/^['\"]|['\"]$/g, "");
  }

  return trimmed;
}

function detectCluster(rpcEndpoint: string): TreasuryTrackerSnapshot["cluster"] {
  const endpoint = rpcEndpoint.toLowerCase();
  if (endpoint.includes("devnet")) return "devnet";
  if (endpoint.includes("testnet")) return "testnet";
  if (endpoint.includes("mainnet")) return "mainnet-beta";
  return "custom";
}

function buildExplorerUrl(
  address: string,
  cluster: TreasuryTrackerSnapshot["cluster"],
): string {
  return cluster === "mainnet-beta"
    ? `https://explorer.solana.com/address/${address}`
    : `https://explorer.solana.com/address/${address}?cluster=${cluster}`;
}

/**
 * Web3 Treasury Tracker skill for the AI.
 * Returns a structured treasury balance payload for reasoning and comparisons.
 */
export async function getTreasuryBalanceSnapshot(
  treasuryAddress: string = ENV_TREASURY_ADDRESS,
): Promise<TreasuryTrackerSnapshot> {
  const fetchedAt = new Date().toISOString();
  const rpcEndpoint = connection.rpcEndpoint;
  const cluster = detectCluster(rpcEndpoint);
  const normalizedAddress = normalizeTreasuryAddress(treasuryAddress);

  if (!normalizedAddress) {
    return {
      configured: false,
      address: null,
      balanceLamports: 0,
      balanceSOL: 0,
      cluster,
      rpcEndpoint,
      explorerUrl: null,
      fetchedAt,
      error: "TREASURY_MULTISIG_ADDRESS is not configured.",
    };
  }

  try {
    const pubkey = new PublicKey(normalizedAddress);
    const balanceLamports = await connection.getBalance(pubkey);

    return {
      configured: true,
      address: normalizedAddress,
      balanceLamports,
      balanceSOL: balanceLamports / LAMPORTS_PER_SOL,
      cluster,
      rpcEndpoint,
      explorerUrl: buildExplorerUrl(normalizedAddress, cluster),
      fetchedAt,
    };
  } catch (err) {
    return {
      configured: false,
      address: normalizedAddress,
      balanceLamports: 0,
      balanceSOL: 0,
      cluster,
      rpcEndpoint,
      explorerUrl: null,
      fetchedAt,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
