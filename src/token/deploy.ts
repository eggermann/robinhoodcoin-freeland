/**
 * deploy.ts — Deploy the RobinHoodCoin (RHC) SPL token on Solana.
 *
 * Usage:
 *   npx tsx src/token/deploy.ts
 *
 * Prerequisites:
 *   1. A funded Solana keypair at ./keys/deployer.json
 *   2. .env with SOLANA_RPC_URL (defaults to devnet)
 */

import {
  createMint,
  getOrCreateAssociatedTokenAccount,
  mintTo,
} from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { connection, loadKeypair, TOKEN } from "../shared/config.js";

async function main() {
  console.log("🏹 RobinHoodCoin — SPL Token Deployment");
  console.log("────────────────────────────────────────");

  const deployer = loadKeypair();
  console.log(`  Deployer : ${deployer.publicKey.toBase58()}`);
  console.log(`  RPC      : ${connection.rpcEndpoint}`);
  console.log(`  Token    : ${TOKEN.name} (${TOKEN.symbol})`);
  console.log(`  Decimals : ${TOKEN.decimals}`);
  console.log(`  Supply   : ${TOKEN.totalSupply.toLocaleString()}`);
  console.log();

  // 1. Create the mint
  console.log("⏳ Creating mint…");
  const mint = await createMint(
    connection,
    deployer,
    deployer.publicKey, // mint authority
    deployer.publicKey, // freeze authority (can be set to null later)
    TOKEN.decimals,
  );
  console.log(`✅ Mint created: ${mint.toBase58()}`);

  // 2. Create an associated token account for the deployer (treasury)
  console.log("⏳ Creating treasury token account…");
  const treasuryAta = await getOrCreateAssociatedTokenAccount(
    connection,
    deployer,
    mint,
    deployer.publicKey,
  );
  console.log(`✅ Treasury ATA: ${treasuryAta.address.toBase58()}`);

  // 3. Mint the full supply into the treasury
  const rawAmount = TOKEN.totalSupply * BigInt(10 ** TOKEN.decimals);
  console.log(`⏳ Minting ${TOKEN.totalSupply.toLocaleString()} ${TOKEN.symbol}…`);
  await mintTo(
    connection,
    deployer,
    mint,
    treasuryAta.address,
    deployer,
    rawAmount,
  );
  console.log("✅ Full supply minted to treasury");

  // Summary
  console.log();
  console.log("═══════════════════════════════════════");
  console.log("  DEPLOYMENT COMPLETE");
  console.log(`  Mint Address : ${mint.toBase58()}`);
  console.log(`  Treasury ATA : ${treasuryAta.address.toBase58()}`);
  console.log("═══════════════════════════════════════");
  console.log();
  console.log("Next steps:");
  console.log("  1. Save the mint address in .env as RHC_MINT_ADDRESS");
  console.log("  2. Verify on Solana Explorer:");
  console.log(`     https://explorer.solana.com/address/${mint.toBase58()}?cluster=devnet`);
  console.log("  3. Consider transferring mint authority to a multisig");
}

main().catch((err) => {
  console.error("❌ Deployment failed:", err);
  process.exit(1);
});
