import { createCampaign, type StampCampaign } from "./stamp-tiers.js";
import { getPortfolio, type FreelandParcel } from "../soul/reporting.js";
import { getLandSearchManager, type LandListing } from "../soul/land-search.js";
import semanticStream from "semantic-stream";
import { buildSemanticStampArtworkPrompt } from "./semantic-stamp-style.js";
import { buildSemanticSeedPlan, type SemanticSeedPlan } from "./semantic-stamp-seeds.js";

type LandSource = "portfolio" | "shortlist";

export interface SelectableLand {
  id: string;
  source: LandSource;
  name: string;
  location: string;
  sizeAcres: number;
  landPriceSOL: number;
  estimatedValueSOL: number;
  features: string[];
}

export interface DailyWikiTopic {
  title: string;
  extract: string;
  canonicalUrl: string;
  date: string;
}

export interface LandStampBatchInput {
  selectedLandId: string;
  maxSupply?: number;
  goalSOL?: number;
  requestedValueSOL?: number;
  legalBufferPct?: number;
  activateImmediately?: boolean;
  language?: string;
}

export interface LandStampBatchResult {
  campaign: StampCampaign;
  selectedLand: SelectableLand;
  wikiTopic: DailyWikiTopic;
  seedPlan: SemanticSeedPlan;
  semanticPhrases: string[];
  valueSOL: number;
  prompt: string;
}

export interface LandStampPreview {
  selectedLand: SelectableLand;
  wikiTopic: DailyWikiTopic;
  seedPlan: SemanticSeedPlan;
  semanticPhrases: string[];
  valueSOL: number;
  goalSOL: number;
  maxSupply: number;
  prompt: string;
}

export interface ManualStampConceptInput {
  landName: string;
  landId?: string;
  location: string;
  sizeAcres?: number;
  landPriceSOL?: number;
  features?: string[];
  language?: string;
  maxSupply?: number;
  goalSOL?: number;
  requestedValueSOL?: number;
}

const MIN_STAMP_VALUE_SOL = 0.5;
const MAX_STAMP_VALUE_SOL = 1.5;
const DEFAULT_MAX_SUPPLY = 120;
const DEFAULT_PHRASE_COUNT = 8;
const USD_PER_SOL_ESTIMATE = 100;
const DEFAULT_LEGAL_BUFFER_PCT = 0.12;

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function roundTo(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function estimateFromPricePerAcre(priceSOL: number, acres: number): number {
  const safeAcres = Math.max(acres, 1);
  const pricePerAcre = priceSOL / safeAcres;
  const normalized = clamp((pricePerAcre - 1) / 29, 0, 1); // 1-30 SOL/acre => 0-1
  return roundTo(MIN_STAMP_VALUE_SOL + normalized, 2);
}

function mapPortfolioLand(parcel: FreelandParcel): SelectableLand {
  const estimatedValueSOL = estimateFromPricePerAcre(
    parcel.purchasePriceSOL,
    parcel.sizeAcres,
  );

  return {
    id: parcel.id,
    source: "portfolio",
    name: parcel.name,
    location: parcel.location,
    sizeAcres: parcel.sizeAcres,
    landPriceSOL: roundTo(parcel.purchasePriceSOL, 2),
    estimatedValueSOL,
    features: parcel.activities.length > 0
      ? parcel.activities
      : [parcel.description],
  };
}

function mapShortlistLand(listing: LandListing): SelectableLand {
  const listingPriceSOL = listing.priceSol ?? (listing.priceUSD / USD_PER_SOL_ESTIMATE);
  const estimatedValueSOL = estimateFromPricePerAcre(listingPriceSOL, listing.sizeAcres);

  return {
    id: listing.id,
    source: "shortlist",
    name: listing.title,
    location: [
      listing.location.city,
      listing.location.region,
      listing.location.country,
    ].filter(Boolean).join(", "),
    sizeAcres: listing.sizeAcres,
    landPriceSOL: roundTo(listingPriceSOL, 2),
    estimatedValueSOL,
    features: listing.features,
  };
}

export function listSelectableLands(): SelectableLand[] {
  const portfolio = getPortfolio().map(mapPortfolioLand);
  const shortlist = getLandSearchManager().getShortlist().map(mapShortlistLand);

  return [...portfolio, ...shortlist].sort((a, b) => a.name.localeCompare(b.name));
}

export function findSelectableLand(landIdOrName: string): SelectableLand | undefined {
  const all = listSelectableLands();

  const normalized = landIdOrName.trim().toLowerCase();
  const exactById = all.find((land) => land.id.toLowerCase() === normalized);
  if (exactById) return exactById;

  return all.find((land) => land.name.toLowerCase().includes(normalized));
}

export function findSelectableLandInText(text: string): SelectableLand | undefined {
  const haystack = text.toLowerCase();
  const lands = listSelectableLands();

  const byId = lands.find((land) => haystack.includes(land.id.toLowerCase()));
  if (byId) return byId;

  return lands.find((land) => haystack.includes(land.name.toLowerCase()));
}

function resolveSelectedLand(landIdOrName: string): SelectableLand {
  const all = listSelectableLands();
  if (all.length === 0) {
    throw new Error("No selectable lands found. Add a parcel to portfolio or shortlist first.");
  }

  const selected = findSelectableLand(landIdOrName);
  if (selected) return selected;

  throw new Error(
    `Land "${landIdOrName}" not found. Use /lands to see valid IDs.`,
  );
}

async function fetchDailyWikiTopic(language = "en"): Promise<DailyWikiTopic> {
  const date = new Date();
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  const dateIso = `${year}-${month}-${day}`;

  const featuredUrl =
    `https://api.wikimedia.org/feed/v1/wikipedia/${language}/featured/${year}/${month}/${day}`;
  const randomFallbackUrl =
    `https://${language}.wikipedia.org/api/rest_v1/page/random/summary`;

  const baseHeaders = {
    accept: "application/json",
    "user-agent": "robinhoodcoin-freeland/0.1 (land-stamp-factory)",
  };

  try {
    const featuredResp = await fetch(featuredUrl, { headers: baseHeaders });
    if (!featuredResp.ok) {
      throw new Error(`Wikipedia featured endpoint returned ${featuredResp.status}`);
    }

    const featured = await featuredResp.json() as {
      tfa?: {
        normalizedtitle?: string;
        title?: string;
        extract?: string;
        content_urls?: {
          desktop?: { page?: string };
        };
      };
    };

    if (featured.tfa?.normalizedtitle || featured.tfa?.title) {
      return {
        title: featured.tfa.normalizedtitle ?? featured.tfa.title ?? "Daily Topic",
        extract: featured.tfa.extract ?? "",
        canonicalUrl: featured.tfa.content_urls?.desktop?.page ?? "https://wikipedia.org",
        date: dateIso,
      };
    }
  } catch {
    // Fall through to random summary if daily feature is unavailable.
  }

  const randomResp = await fetch(randomFallbackUrl, { headers: baseHeaders });
  if (!randomResp.ok) {
    throw new Error(`Wikipedia random summary endpoint returned ${randomResp.status}`);
  }

  const random = await randomResp.json() as {
    title?: string;
    extract?: string;
    content_urls?: {
      desktop?: { page?: string };
    };
  };

  return {
    title: random.title ?? "Daily Topic",
    extract: random.extract ?? "",
    canonicalUrl: random.content_urls?.desktop?.page ?? "https://wikipedia.org",
    date: dateIso,
  };
}

function normalizePhrase(raw: string): string {
  return raw
    .replace(/\s+/g, " ")
    .replace(/[|{}[\]]/g, "")
    .trim()
    .slice(0, 80);
}

async function getSemanticMotifPhrases(
  seedWord: string,
  language: string,
  phraseCount = DEFAULT_PHRASE_COUNT,
): Promise<string[]> {
  const phrases: string[] = [];
  const seen = new Set<string>();
  const WordStreamCtor = semanticStream.WordStream;

  if (!WordStreamCtor) {
    return [seedWord];
  }

  try {
    const stream = new WordStreamCtor(seedWord, language);
    await stream.start();

    for (let i = 0; i < phraseCount; i++) {
      const next = await stream.getNext();
      const candidates = [
        typeof next?.title === "string" ? next.title : "",
        ...(next?.sentences?.prev ?? []),
        ...(next?.sentences?.next ?? []),
      ]
        .map(normalizePhrase)
        .filter((phrase) => phrase.length > 2);

      for (const phrase of candidates) {
        const key = phrase.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        phrases.push(phrase);
        if (phrases.length >= phraseCount) return phrases;
      }
    }
  } catch (err) {
    console.warn("semantic-stream phrase generation failed:", err);
  }

  if (phrases.length === 0) {
    return [seedWord, "commons stewardship", "freedom through land"];
  }
  return phrases;
}

export async function previewLandStampBatch(
  input: LandStampBatchInput,
): Promise<LandStampPreview> {
  const selectedLand = resolveSelectedLand(input.selectedLandId);
  const language = (input.language ?? "en").trim() || "en";
  const seedPlan = buildSemanticSeedPlan(selectedLand);

  const wikiTopic = await fetchDailyWikiTopic(language);
  const semanticPhrases = await getSemanticMotifPhrases(
    seedPlan.primarySeed,
    language,
    DEFAULT_PHRASE_COUNT,
  );

  const valueSOL = roundTo(
    clamp(
      input.requestedValueSOL ?? selectedLand.estimatedValueSOL,
      MIN_STAMP_VALUE_SOL,
      MAX_STAMP_VALUE_SOL,
    ),
    2,
  );

  const legalBufferPct = clamp(input.legalBufferPct ?? DEFAULT_LEGAL_BUFFER_PCT, 0, 1);
  const bufferedLandCost = roundTo(selectedLand.landPriceSOL * (1 + legalBufferPct), 2);

  let maxSupply = Math.max(1, Math.floor(input.maxSupply ?? DEFAULT_MAX_SUPPLY));
  if (!input.maxSupply) {
    maxSupply = Math.max(maxSupply, Math.ceil(bufferedLandCost / valueSOL));
  }

  const goalSOL = roundTo(
    input.goalSOL ?? Math.max(bufferedLandCost, maxSupply * valueSOL),
    2,
  );

  const prompt = buildSemanticStampArtworkPrompt({
    landName: selectedLand.name,
    landId: selectedLand.id,
    location: selectedLand.location,
    sizeAcres: selectedLand.sizeAcres,
    features: selectedLand.features,
    landPriceSOL: selectedLand.landPriceSOL,
    maxSupply,
    valueSOL,
    goalSOL,
    wikiTitle: wikiTopic.title,
    wikiExtract: wikiTopic.extract,
    wikiDate: wikiTopic.date,
    seedPhrases: seedPlan.seedPhrases,
    curationNotes: seedPlan.curationNotes,
    semanticPhrases,
  });

  return {
    selectedLand,
    wikiTopic,
    seedPlan,
    semanticPhrases,
    valueSOL,
    goalSOL,
    maxSupply,
    prompt,
  };
}

export async function previewManualSemanticStampConcept(
  input: ManualStampConceptInput,
): Promise<LandStampPreview> {
  const selectedLand: SelectableLand = {
    id: input.landId?.trim() || `MANUAL-${Date.now().toString(36).toUpperCase()}`,
    source: "portfolio",
    name: input.landName.trim(),
    location: input.location.trim(),
    sizeAcres: input.sizeAcres ?? 1,
    landPriceSOL: roundTo(input.landPriceSOL ?? 120, 2),
    estimatedValueSOL: roundTo(
      clamp(input.requestedValueSOL ?? 0.9, MIN_STAMP_VALUE_SOL, MAX_STAMP_VALUE_SOL),
      2,
    ),
    features: (input.features ?? []).filter((feature) => feature.trim().length > 0),
  };

  return previewLandStampBatch({
    selectedLandId: selectedLand.id,
    language: input.language,
    maxSupply: input.maxSupply,
    goalSOL: input.goalSOL,
    requestedValueSOL: input.requestedValueSOL,
    activateImmediately: false,
    legalBufferPct: DEFAULT_LEGAL_BUFFER_PCT,
  }).catch(async () => {
    const language = (input.language ?? "en").trim() || "en";
    const seedPlan = buildSemanticSeedPlan(selectedLand);
    const wikiTopic = await fetchDailyWikiTopic(language);
    const semanticPhrases = await getSemanticMotifPhrases(
      seedPlan.primarySeed,
      language,
      DEFAULT_PHRASE_COUNT,
    );
    const valueSOL = roundTo(
      clamp(
        input.requestedValueSOL ?? selectedLand.estimatedValueSOL,
        MIN_STAMP_VALUE_SOL,
        MAX_STAMP_VALUE_SOL,
      ),
      2,
    );
    const maxSupply = Math.max(1, Math.floor(input.maxSupply ?? DEFAULT_MAX_SUPPLY));
    const goalSOL = roundTo(
      input.goalSOL ?? Math.max(selectedLand.landPriceSOL * (1 + DEFAULT_LEGAL_BUFFER_PCT), maxSupply * valueSOL),
      2,
    );

    return {
      selectedLand,
      wikiTopic,
      seedPlan,
      semanticPhrases,
      valueSOL,
      goalSOL,
      maxSupply,
      prompt: buildSemanticStampArtworkPrompt({
        landName: selectedLand.name,
        landId: selectedLand.id,
        location: selectedLand.location,
        sizeAcres: selectedLand.sizeAcres,
        features: selectedLand.features,
        landPriceSOL: selectedLand.landPriceSOL,
        maxSupply,
        valueSOL,
        goalSOL,
        wikiTitle: wikiTopic.title,
        wikiExtract: wikiTopic.extract,
        wikiDate: wikiTopic.date,
        seedPhrases: seedPlan.seedPhrases,
        curationNotes: seedPlan.curationNotes,
        semanticPhrases,
      }),
    };
  });
}

export async function createLandStampBatch(
  input: LandStampBatchInput,
): Promise<LandStampBatchResult> {
  const preview = await previewLandStampBatch(input);

  const campaign = createCampaign({
    name: `${preview.selectedLand.name} Semantic Stamp Drop`,
    description:
      `Parcel stamp batch for ${preview.selectedLand.name} based on the Wikipedia daily topic ` +
      `"${preview.wikiTopic.title}" with semantic motif phrases.`,
    parcelId: preview.selectedLand.id,
    tier: "parcel",
    priceSOL: preview.valueSOL,
    maxSupply: preview.maxSupply,
    goalSOL: preview.goalSOL,
    artworkPrompt: preview.prompt,
    active: input.activateImmediately ?? true,
    closesAt: new Date(Date.now() + 21 * 24 * 3600_000).toISOString(),
  });

  return {
    campaign,
    selectedLand: preview.selectedLand,
    wikiTopic: preview.wikiTopic,
    seedPlan: preview.seedPlan,
    semanticPhrases: preview.semanticPhrases,
    valueSOL: preview.valueSOL,
    prompt: preview.prompt,
  };
}
