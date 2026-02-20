/**
 * setup-multisig.ts — Create a Squads v4 multisig for the Robin Hood Treasury.
 *
 * Usage:
 *   npx tsx src/treasury/setup-multisig.ts \
 *     --members <pubkey1>,<pubkey2>,<pubkey3> \
 *     --threshold 2
 *
 * This creates a Squads Protocol multisig that requires `threshold` out of
 * `members` to approve any treasury transaction (land purchase, grant, etc.).
 */

import * as multisig from "@sqds/multisig";
import { Connection, Keypair, PublicKey } from "@solana/web3.js";
import { connection, loadKeypair } from "../shared/config.js";

interface MultisigArgs {
  members: PublicKey[];
  threshold: number;
}

function parseArgs(): MultisigArgs {
  const args = process.argv.slice(2);
  const map: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, "");
    const val = args[i + 1];
    if (key && val) map[key] = val;
  }

  if (!map.members || !map.threshold) {
    console.error(
      "Usage: npx tsx src/treasury/setup-multisig.ts --members <pk1>,<pk2>,... --threshold <n>",
    );
    process.exit(1);
  }

  const members = map.members.split(",").map((s) => new PublicKey(s.trim()));
  const threshold = Number(map.threshold);

  if (members.length < threshold) {
    console.error("❌ Threshold cannot exceed number of members.");
    process.exit(1);
  }

  return { members, threshold };
}

async function main() {
  const { members, threshold } = parseArgs();

  console.log("🏦 Robin Hood Treasury — Multisig Setup");
  console.log("────────────────────────────────────────");
  console.log(`  Members   : ${members.length}`);
  members.forEach((m, i) => console.log(`    ${i + 1}. ${m.toBase58()}`));
  console.log(`  Threshold : ${threshold}-of-${members.length}`);
  console.log();

  const creator = loadKeypair();
  console.log(`  Creator   : ${creator.publicKey.toBase58()}`);

  // Generate a unique create key for the multisig
  const createKey = Keypair.generate();

  // Derive the multisig PDA
  const [multisigPda] = multisig.getMultisigPda({
    createKey: createKey.publicKey,
  });

  console.log("⏳ Creating multisig…");

  const memberEntries: multisig.types.Member[] = members.map((key) => ({
    key,
    permissions: multisig.types.Permissions.all(),
  }));

  const tx = multisig.transactions.multisigCreateV2({
    blockhash: (await connection.getLatestBlockhash()).blockhash,
    treasury: creator.publicKey,
    createKey: createKey.publicKey,
    creator: creator.publicKey,
    multisigPda,
    configAuthority: null,
    threshold,
    members: memberEntries,
    timeLock: 0,
    rentCollector: null,
  });

  tx.sign([creator, createKey]);
  const sig = await connection.sendRawTransaction(tx.serialize());
  await connection.confirmTransaction(sig);

  // Derive the vault PDA (index 0)
  const [vaultPda] = multisig.getVaultPda({
    multisigPda,
    index: 0,
  });

  console.log("✅ Multisig created!");
  console.log();
  console.log("═══════════════════════════════════════");
  console.log("  TREASURY SETUP COMPLETE");
  console.log(`  Multisig PDA : ${multisigPda.toBase58()}`);
  console.log(`  Vault (0)    : ${vaultPda.toBase58()}`);
  console.log(`  Threshold    : ${threshold}-of-${members.length}`);
  console.log("═══════════════════════════════════════");
  console.log();
  console.log("Next steps:");
  console.log("  1. Save the vault address in .env as TREASURY_MULTISIG_ADDRESS");
  console.log("  2. Transfer mint authority of RHC to this multisig");
  console.log("  3. Direct NFT sale proceeds to the vault address");
}

main().catch((err) => {
  console.error("❌ Multisig setup failed:", err);
  process.exit(1);
});
