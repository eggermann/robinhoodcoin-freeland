import path from "node:path";
import {
  previewLandStampBatch,
  previewManualSemanticStampConcept,
} from "../nft/land-stamp-factory.js";
import { generateHuggingFaceStampArt } from "../nft/huggingface-stamp-art.js";
import { createCampaignStampMetadata } from "../nft/stamp-metadata.js";
import { getCampaign } from "../nft/stamp-tiers.js";

const DEFAULT_NEGATIVE_PROMPT = "blurry, watermark, text artifacts, distorted anatomy, duplicate elements, low contrast";

function getArg(name: string): string {
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index === -1) return "";
  return process.argv[index + 1] ?? "";
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function getNumberArg(name: string, fallback: number): number {
  const raw = getArg(name);
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function usage(): never {
  console.error(
    "Usage:\n"
    + "  npm run generate:hf-stamp -- --land <LAND-ID-or-name> [--out <file>] [--model <hf-model>] [--negative <text>] [--dry-run]\n"
    + "  npm run generate:hf-stamp -- --name <land name> --location <place> [--out <file>] [--model <hf-model>] [--negative <text>] [--dry-run]",
  );
  process.exit(1);
}

async function main(): Promise<void> {
  const campaignId = getArg("campaign");
  const land = getArg("land");
  const name = getArg("name");
  const location = getArg("location");
  const out = getArg("out");
  const model = getArg("model");
  const negative = getArg("negative") || DEFAULT_NEGATIVE_PROMPT;
  const dryRun = hasFlag("dry-run");
  const serial = getNumberArg("serial", 1);

  const campaign = campaignId
    ? getCampaign(campaignId)
    : null;
  if (campaignId && !campaign) {
    throw new Error(`Campaign ${campaignId} not found.`);
  }

  const selectedLandId = land || campaign?.parcelId || "";
  const preview = selectedLandId
    ? await previewLandStampBatch({ selectedLandId })
    : name && location
      ? await previewManualSemanticStampConcept({
        landName: name,
        location,
      })
      : usage();

  const resolvedOutput = out
    ? path.resolve(out)
    : campaign
      ? path.resolve("./data/stamps/generated", `${slugify(campaign.id)}-${serial}.png`)
      : "";

  if (dryRun) {
    console.log(
      JSON.stringify(
        {
          mode: "dry-run",
          land: preview.selectedLand,
          goalSOL: preview.goalSOL,
          maxSupply: preview.maxSupply,
          prompt: preview.prompt,
          outputPath: resolvedOutput || null,
        },
        null,
        2,
      ),
    );
    return;
  }

  const result = await generateHuggingFaceStampArt({
    prompt: preview.prompt,
    negativePrompt: negative,
    model: model || undefined,
    outputPath: resolvedOutput || undefined,
    slug: `${preview.selectedLand.name}-${preview.wikiTopic.date}`,
  });

  console.log(`Generated Hugging Face stamp art for ${preview.selectedLand.name}`);
  console.log(`Model: ${result.model}`);
  console.log(`Image: ${result.outputPath}`);
  console.log(`Manifest: ${result.manifestPath}`);
  if (campaign) {
    const metadata = createCampaignStampMetadata({
      campaign,
      serial,
    });
    console.log(`Metadata: ${metadata.filePath}`);
    console.log(`Metadata URI: ${metadata.uri}`);
  }
}

main().catch((error) => {
  console.error("Failed to generate Hugging Face stamp art:", error instanceof Error ? error.message : error);
  process.exit(1);
});
