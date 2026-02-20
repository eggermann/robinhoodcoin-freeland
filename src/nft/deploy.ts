/**
 * deploy.ts — Create the Freeland Stamps NFT collection on Solana (Metaplex).
 *
 * Usage:
 *   npx tsx src/nft/deploy.ts
 *
 * This script:
 *   1. Creates a collection NFT that acts as the parent for all stamps.
 *   2. Outputs the collection address for use in minting individual stamps.
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
  type Umi,
} from "@metaplex-foundation/umi";
import { connection, loadKeypair, NFT } from "../shared/config.js";
import fs from "node:fs";

async function main() {
  console.log("🎨 Freeland Stamps — NFT Collection Deployment");
  console.log("────────────────────────────────────────────────");

  // Load the deployer keypair
  const solanaKeypair = loadKeypair();
  console.log(`  Deployer   : ${solanaKeypair.publicKey.toBase58()}`);
  console.log(`  Collection : ${NFT.collectionName} (${NFT.collectionSymbol})`);
  console.log();

  // Set up Umi
  const umi = createUmi(connection.rpcEndpoint).use(mplTokenMetadata());

  // Convert Solana keypair to Umi keypair format
  const umiKeypair = umi.eddsa.createKeypairFromSecretKey(
    solanaKeypair.secretKey,
  );
  umi.use(keypairIdentity(umiKeypair));

  // Generate a signer for the collection mint
  const collectionMint = generateSigner(umi);

  console.log("⏳ Creating collection NFT…");
  await createNft(umi, {
    mint: collectionMint,
    name: NFT.collectionName,
    symbol: NFT.collectionSymbol,
    uri: `${NFT.baseUri}collection.json`,
    sellerFeeBasisPoints: percentAmount(0), // no royalties — this is for a cause
    isCollection: true,
  }).sendAndConfirm(umi);

  console.log(`✅ Collection NFT created: ${collectionMint.publicKey}`);

  // Save collection info
  const collectionInfo = {
    collectionMint: String(collectionMint.publicKey),
    name: NFT.collectionName,
    symbol: NFT.collectionSymbol,
    deployedAt: new Date().toISOString(),
    rpc: connection.rpcEndpoint,
  };

  const outPath = "./keys/collection-info.json";
  fs.mkdirSync("./keys", { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(collectionInfo, null, 2));
  console.log(`📄 Collection info saved to ${outPath}`);

  console.log();
  console.log("═════════════════════════════════════════════════");
  console.log("  COLLECTION DEPLOYMENT COMPLETE");
  console.log(`  Collection Mint : ${collectionMint.publicKey}`);
  console.log("═════════════════════════════════════════════════");
  console.log();
  console.log("Next steps:");
  console.log("  1. Upload collection metadata JSON to your baseUri");
  console.log("  2. Use src/nft/mint-stamp.ts to mint individual stamps");
  console.log("  3. Create artwork for each stamp using AI image generation");
}

main().catch((err) => {
  console.error("❌ Collection deployment failed:", err);
  process.exit(1);
});
