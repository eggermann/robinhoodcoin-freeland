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
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  transfer,
} from "@solana/spl-token";
import {
  generateSigner,
  keypairIdentity,
  percentAmount,
  publicKey,
} from "@metaplex-foundation/umi";
import { Connection, PublicKey } from "@solana/web3.js";
import { connection, loadKeypair, STAMP_RUNTIME } from "../shared/config.js";
import fs from "node:fs";
import { pathToFileURL } from "node:url";

interface StampArgs {
  name: string;
  uri: string;
  recipient?: string;
}

export interface MintStampResult {
  mintAddress: string;
  recipient?: string;
  transferSignature?: string;
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

function loadCollectionInfo(): { symbol: string; collectionMint: string } {
  const collectionInfoPath = STAMP_RUNTIME.collectionInfoPath;
  if (!fs.existsSync(collectionInfoPath)) {
    throw new Error(
      `Collection info not found at "${collectionInfoPath}". Run \`npx tsx src/nft/deploy.ts\` first.`,
    );
  }
  return JSON.parse(fs.readFileSync(collectionInfoPath, "utf-8")) as {
    symbol: string;
    collectionMint: string;
  };
}

async function transferMintToRecipient(input: {
  connection: Connection;
  mintAddress: string;
  ownerKeypair: ReturnType<typeof loadKeypair>;
  recipient: string;
}): Promise<string> {
  const mintPubkey = new PublicKey(input.mintAddress);
  const recipientPubkey = new PublicKey(input.recipient);
  const sourceAta = getAssociatedTokenAddressSync(mintPubkey, input.ownerKeypair.publicKey);
  const destination = await getOrCreateAssociatedTokenAccount(
    input.connection,
    input.ownerKeypair,
    mintPubkey,
    recipientPubkey,
  );

  return transfer(
    input.connection,
    input.ownerKeypair,
    sourceAta,
    destination.address,
    input.ownerKeypair,
    1n,
  );
}

export async function mintStamp(input: StampArgs): Promise<MintStampResult> {
  const { name, uri, recipient } = input;
  const collectionInfo = loadCollectionInfo();

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

  const mintAddress = stampMint.publicKey.toString();
  let transferSignature: string | undefined;

  if (recipient) {
    transferSignature = await transferMintToRecipient({
      connection,
      mintAddress,
      ownerKeypair: solanaKeypair,
      recipient,
    });
  }

  return {
    mintAddress,
    recipient,
    transferSignature,
  };
}

async function main() {
  const { name, uri, recipient } = parseArgs();

  console.log(`🎟️  Minting Freeland Stamp: "${name}"`);
  console.log("────────────────────────────────────────");

  const result = await mintStamp({ name, uri, recipient });

  console.log(`✅ Stamp minted: ${result.mintAddress}`);
  if (result.recipient) {
    console.log(`📬 Transferred to recipient: ${result.recipient}`);
    if (result.transferSignature) {
      console.log(`🔏 Transfer signature: ${result.transferSignature}`);
    }
  }

  console.log();
  console.log(`  Mint     : ${result.mintAddress}`);
  console.log(`  Name     : ${name}`);
  console.log(`  Metadata : ${uri}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error("❌ Stamp minting failed:", err);
    process.exit(1);
  });
}
