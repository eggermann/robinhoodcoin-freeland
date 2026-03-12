import fs from "node:fs";
import path from "node:path";
import { NFT, STAMP_RUNTIME } from "../shared/config.js";
import type { StampCampaign } from "./stamp-tiers.js";

export interface StampMetadataBuildResult {
  fileName: string;
  filePath: string;
  uri: string;
  metadata: Record<string, unknown>;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function buildImageUri(fileName: string, explicitImageUri?: string): string | undefined {
  if (explicitImageUri?.trim()) return explicitImageUri.trim();
  if (!STAMP_RUNTIME.imageBaseUri.trim()) return undefined;
  const base = STAMP_RUNTIME.imageBaseUri.replace(/\/+$/, "");
  const stem = fileName.replace(/\.json$/i, "");
  return `${base}/${stem}.png`;
}

export function createCampaignStampMetadata(input: {
  campaign: StampCampaign;
  serial: number;
  recipient?: string;
  imageUri?: string;
}): StampMetadataBuildResult {
  const serial = Math.max(1, Math.floor(input.serial));
  const fileName = `${slugify(input.campaign.id)}-${serial}.json`;
  const filePath = path.resolve(STAMP_RUNTIME.metadataOutputDir, fileName);
  const imageUri = buildImageUri(fileName, input.imageUri);
  const uriBase = NFT.baseUri.replace(/\/+$/, "");
  const uri = `${uriBase}/${fileName}`;

  const metadata: Record<string, unknown> = {
    name: `${input.campaign.name} #${serial}`,
    symbol: NFT.collectionSymbol,
    description: input.campaign.description,
    seller_fee_basis_points: 0,
    external_url: STAMP_RUNTIME.externalUrl,
    attributes: [
      { trait_type: "campaign_id", value: input.campaign.id },
      { trait_type: "tier", value: input.campaign.tier },
      { trait_type: "parcel_id", value: input.campaign.parcelId ?? "general" },
      { trait_type: "serial", value: serial },
      ...(input.recipient ? [{ trait_type: "recipient", value: input.recipient }] : []),
    ],
    properties: {
      category: "image",
      files: imageUri ? [{ uri: imageUri, type: "image/png" }] : [],
    },
  };

  if (imageUri) {
    metadata.image = imageUri;
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(metadata, null, 2), "utf-8");

  return {
    fileName,
    filePath,
    uri,
    metadata,
  };
}
