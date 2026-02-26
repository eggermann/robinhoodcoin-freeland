/**
 * transfer-mint-authority.ts — Transfer RHC mint authority to multisig custody.
 *
 * Usage:
 *   npx tsx src/token/transfer-mint-authority.ts --mint <mint-address> --to <multisig-address>
 *
 * Defaults:
 *   --mint uses RHC_MINT_ADDRESS from .env
 *   --to uses TREASURY_MULTISIG_ADDRESS from .env
 */

import { AuthorityType, setAuthority } from "@solana/spl-token";
import { PublicKey } from "@solana/web3.js";
import { connection, loadKeypair } from "../shared/config.js";

interface Args {
  mintAddress: string;
  newAuthority: string;
}

function parseArgs(): Args {
  const args = process.argv.slice(2);
  const map: Record<string, string> = {};

  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, "");
    const value = args[i + 1];
    if (!key || !value) continue;
    map[key] = value;
  }

  const mintAddress = map.mint ?? process.env.RHC_MINT_ADDRESS;
  const newAuthority = map.to ?? process.env.TREASURY_MULTISIG_ADDRESS;

  if (!mintAddress || !newAuthority) {
    console.error("Usage: npx tsx src/token/transfer-mint-authority.ts --mint <mint-address> --to <multisig-address>");
    console.error("Or set RHC_MINT_ADDRESS and TREASURY_MULTISIG_ADDRESS in .env");
    process.exit(1);
  }

  return { mintAddress, newAuthority };
}

function toExplorerUrl(address: string): string {
  const endpoint = connection.rpcEndpoint.toLowerCase();
  if (endpoint.includes("mainnet")) {
    return `https://explorer.solana.com/address/${address}`;
  }
  if (endpoint.includes("testnet")) {
    return `https://explorer.solana.com/address/${address}?cluster=testnet`;
  }
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

async function main(): Promise<void> {
  const { mintAddress, newAuthority } = parseArgs();
  const signer = loadKeypair();

  const mintPubkey = new PublicKey(mintAddress);
  const nextAuthorityPubkey = new PublicKey(newAuthority);

  console.log("🔐 RobinHoodCoin — Transfer Mint Authority");
  console.log("────────────────────────────────────────");
  console.log(`  Mint              : ${mintPubkey.toBase58()}`);
  console.log(`  Current authority : ${signer.publicKey.toBase58()}`);
  console.log(`  New authority     : ${nextAuthorityPubkey.toBase58()}`);
  console.log(`  RPC               : ${connection.rpcEndpoint}`);
  console.log();

  const signature = await setAuthority(
    connection,
    signer,
    mintPubkey,
    signer.publicKey,
    AuthorityType.MintTokens,
    nextAuthorityPubkey,
  );

  await connection.confirmTransaction(signature);

  console.log("✅ Mint authority transferred.");
  console.log(`  Signature         : ${signature}`);
  console.log(`  Explorer          : ${toExplorerUrl(mintPubkey.toBase58())}`);
  console.log();
  console.log("Next steps:");
  console.log("  1. Persist the new authority in your ops docs/.env (RHC_MINT_AUTHORITY)");
  console.log("  2. Verify mint authority in Solana Explorer");
  console.log("  3. Keep deployer key strictly offline after transfer");
}

main().catch((err) => {
  console.error("❌ Mint authority transfer failed:", err);
  process.exit(1);
});
