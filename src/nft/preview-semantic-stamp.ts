import { previewLandStampBatch, previewManualSemanticStampConcept } from "./land-stamp-factory.js";

function arg(name: string): string {
  const index = process.argv.findIndex((value) => value === `--${name}`);
  return index >= 0 ? (process.argv[index + 1] ?? "") : "";
}

async function main(): Promise<void> {
  const selectedLandId = arg("land") || arg("id");
  const landName = arg("title") || arg("name");
  if (!selectedLandId && !landName) {
    console.error(
      "Usage: npx tsx src/nft/preview-semantic-stamp.ts --land <LAND-ID> [--language en] [--maxSupply 180] [--goalSOL 162] [--valueSOL 0.9]\n   or: npx tsx src/nft/preview-semantic-stamp.ts --title \"Alentejo Commons\" --location \"Alentejo, Portugal\" --features \"olive groves, dryland farming\"",
    );
    process.exit(1);
  }

  const maxSupplyRaw = arg("maxSupply");
  const goalSOLRaw = arg("goalSOL");
  const valueSOLRaw = arg("valueSOL");

  const preview = selectedLandId
    ? await previewLandStampBatch({
      selectedLandId,
      language: arg("language") || "en",
      maxSupply: maxSupplyRaw ? Number(maxSupplyRaw) : undefined,
      goalSOL: goalSOLRaw ? Number(goalSOLRaw) : undefined,
      requestedValueSOL: valueSOLRaw ? Number(valueSOLRaw) : undefined,
    })
    : await previewManualSemanticStampConcept({
      landName,
      landId: arg("landId"),
      location: arg("location") || "Location pending",
      sizeAcres: arg("sizeAcres") ? Number(arg("sizeAcres")) : undefined,
      landPriceSOL: arg("landPriceSOL") ? Number(arg("landPriceSOL")) : undefined,
      features: arg("features")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean),
      language: arg("language") || "en",
      maxSupply: maxSupplyRaw ? Number(maxSupplyRaw) : undefined,
      goalSOL: goalSOLRaw ? Number(goalSOLRaw) : undefined,
      requestedValueSOL: valueSOLRaw ? Number(valueSOLRaw) : undefined,
    });

  console.log(JSON.stringify(preview, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
