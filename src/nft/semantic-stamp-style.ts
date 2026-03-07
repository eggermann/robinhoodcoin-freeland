export interface SemanticStampPromptInput {
  landName: string;
  landId: string;
  location: string;
  sizeAcres: number;
  features: string[];
  landPriceSOL: number;
  maxSupply: number;
  valueSOL: number;
  goalSOL: number;
  wikiTitle: string;
  wikiExtract: string;
  wikiDate: string;
  semanticPhrases: string[];
}

export function buildSemanticStampArtworkPrompt(input: SemanticStampPromptInput): string {
  const motifs = input.semanticPhrases.slice(0, 8).join(", ");
  const features = input.features.slice(0, 8).join(", ") || "community use";

  return [
    `Create a high-quality used postage stamp artwork for the Freeland campaign "${input.landName}".`,
    `Format: vintage engraved philatelic stamp, centered composition, decorative border, denomination numerals, cancellation marks, subtle paper wear, collector-grade scan.`,
    `Subject anchor: ${input.landName} (${input.landId}) in ${input.location}.`,
    `Land facts: ${input.sizeAcres} acres, target land price ${input.landPriceSOL} SOL, campaign goal ${input.goalSOL} SOL, stamp value ${input.valueSOL} SOL, max supply ${input.maxSupply}.`,
    `Parcel features: ${features}.`,
    `Semantic stream source: Wikipedia topic "${input.wikiTitle}" (${input.wikiDate}).`,
    `Topic summary: ${input.wikiExtract || "n/a"}.`,
    `Semantic motifs to fuse visually or symbolically: ${motifs}.`,
    "Visual grammar from semantic-stream stamp experiments: monochrome or duotone engraving, bold border text, emblematic central figure or symbolic object, surreal but coherent motif fusion.",
    "Freeland constraints: commons stewardship, land justice, non-speculative ownership, Robin Hood folklore, seed-and-arrow symbolism, land contour motifs, community future.",
    "Avoid generic fantasy poster layouts. This must read as a believable vintage stamp artifact first, and a semantic artwork second.",
    "Text guidance: include FREELAND and a stylized parcel or campaign identifier; any other lettering can be pseudo-philatelic and ornamental.",
    "Output style: highly detailed stamp scan, sharp line work, subtle print texture, black background isolation or clean crop suitable for collector gallery display.",
  ].join("\n");
}
