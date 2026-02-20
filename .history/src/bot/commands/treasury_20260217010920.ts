import type { Context } from "grammy";
import { connection } from "../../shared/config.js";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

const TREASURY_ADDRESS = process.env.TREASURY_MULTISIG_ADDRESS ?? "";

export async function handleTreasury(ctx: Context): Promise<void> {
  if (!TREASURY_ADDRESS) {
    await ctx.reply(
      "⚠️ Treasury address not configured yet. Set TREASURY_MULTISIG_ADDRESS in .env.",
    );
    return;
  }

  try {
    const pubkey = new PublicKey(TREASURY_ADDRESS);
    const balanceLamports = await connection.getBalance(pubkey);
    const balanceSol = (balanceLamports / LAMPORTS_PER_SOL).toFixed(4);

    await ctx.reply(
      `💰 *Robin Hood Treasury*

Address: \`${TREASURY_ADDRESS}\`
Balance: *${balanceSol} SOL*

🔗 [View on Solana Explorer](https://explorer.solana.com/address/${TREASURY_ADDRESS}?cluster=devnet)`,
      { parse_mode: "Markdown" },
    );
  } catch (err) {
    console.error("Treasury query failed:", err);
    await ctx.reply("❌ Could not fetch treasury balance. Try again later.");
  }
}
