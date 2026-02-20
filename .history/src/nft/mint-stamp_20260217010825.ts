/**
 * mint-stamp.ts — Mint a single Freeland Stamp NFT into the collection.
 *
 * Usage:
 *   npx tsx src/nft/mint-stamp.ts --name "Genesis Stamp #1" --uri "https://..."
 *
 * Reads the collection address from ./keys/collection-info.json
 */

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  createNft,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  generateSigner,
  keypairIdentity,
  percentAmount,
  publicKey,
} from "@metaplex-foundation/umi";
import { connection, loadKeypair } from "../shared/config.js";
import fs from "node:fs";

interface StampArgs {
  name: string;
  uri: string;
  recipient?: string;
}

function parseArgs(): StampArgs {
  const args = process.argv.slice(2);
  const map: Record<string, string> = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i]?.replace(/^--/, "");
    const val = args[i + 1];
    if (key && val) map[key] = val;
  }

  if (!map.name || !map.uri) {
    console.error("Usage: npx tsx src/nft/mint-stamp.ts --name <name> --uri <uri> [--recipient <pubkey>]");
    process.exit(1);
  }

  return { name: map.name, uri: map.uri, recipient: map.recipient };
}

async function main() {
  const { name, uri, recipient } = parseArgs();

  console.log(`🎟️  Minting Freeland Stamp: "${name}"`);
  console.log("────────────────────────────────────────");

  // Load collection info
  const collectionInfoPath = "./keys/collection-info.json";
  if (!fs.existsSync(collectionInfoPath)) {
    throw new Error(
      "Collection not found. Run `npx tsx src/nft/deploy.ts` first.",
    );
  }
  const collectionInfo = JSON.parse(
    fs.readFileSync(collectionInfoPath, "utf-8"),
  );

  const solanaKeypair = loadKeypair();
  const umi = createUmi(connection.rpcEndpoint).use(mplTokenMetadata());

  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(
    solanaKeypair.secretKey,
  );
  umi.use(keypairIdentity(umiKeypair));

  const stampMint = generateSigner(umi);

  console.log("⏳ Minting…");
  await createNft(umi, {
    mint: stampMint,
    name,
    uri,
    symbol: collectionInfo.symbol,
    sellerFeeBasisPoints: percentAmount(0),
    collection: {
      key: publicKey(collectionInfo.collectionMint),
      verified: false,
    },
  }).sendAndConfirm(umi);

  console.log(`✅ Stamp minted: ${stampMint.publicKey}`);

  if (recipient) {
    console.log(`📬 Transfer to recipient: ${recipient}`);
    // TODO: implement SPL token transfer to recipient
    console.log("   (Transfer not yet implemented — stamp is in deployer wallet)");
  }

  console.log();
  console.log(`  Mint     : ${stampMint.publicKey}`);
  console.log(`  Name     : ${name}`);
  console.log(`  Metadata : ${uri}`);
}

main().catch((err) => {
  console.error("❌ Stamp minting failed:", err);
  process.exit(1);
});
