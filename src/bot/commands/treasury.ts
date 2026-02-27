import type { Context } from "grammy";
import { connection } from "../../shared/config.js";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const TREASURY_ADDRESS_RAW = process.env.TREASURY_MULTISIG_ADDRESS ?? "";

function normalizeTreasuryAddress(raw: string): string {
  const trimmed = raw.trim().replace(/^['\"]|['\"]$/g, "");
  if (!trimmed) return "";
  const eqIndex = trimmed.indexOf("=");
  if (eqIndex >= 0) return trimmed.slice(eqIndex + 1).trim().replace(/^['\"]|['\"]$/g, "");
  return trimmed;
}

export async function handleTreasury(ctx: Context): Promise<void> {
  const treasuryAddress = normalizeTreasuryAddress(TREASURY_ADDRESS_RAW);

  if (!treasuryAddress) {
    await ctx.reply(
      "⚠️ Treasury address not configured yet. Set TREASURY_MULTISIG_ADDRESS in .env.",
    );
    return;
  }

  let pubkey: PublicKey;

  try {
    pubkey = new PublicKey(treasuryAddress);
  } catch {
    await ctx.reply(
      "⚠️ TREASURY_MULTISIG_ADDRESS is set, but it is not a valid Solana address (base58). Please update .env with a valid multisig vault pubkey.",
    );
    return;
  }

  try {
    const balanceLamports = await connection.getBalance(pubkey);
    const balanceSol = (balanceLamports / LAMPORTS_PER_SOL).toFixed(4);

    await ctx.reply(
      `💰 *Robin Hood Treasury*\n\nAddress: \`${treasuryAddress}\`\nBalance: *${balanceSol} SOL*\n\n🔗 [View on Solana Explorer](https://explorer.solana.com/address/${treasuryAddress}?cluster=devnet)`,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    console.error("Treasury query failed:", err);
    await ctx.reply("❌ Could not fetch treasury balance. Try again later.");
  }
}
