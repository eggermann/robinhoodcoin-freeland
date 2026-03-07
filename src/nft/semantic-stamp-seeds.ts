import type { SelectableLand } from "./land-stamp-factory.js";

export interface SemanticSeedPlan {
  primarySeed: string;
  seedPhrases: string[];
  curationNotes: string[];
}

const BASE_FREELAND_SEEDS = [
  "freeland commons",
  "commons charter",
  "mutual aid",
  "land stewardship",
  "land reform",
  "community garden",
  "Robin Hood folklore",
  "seed and arrow emblem",
  "village market",
  "watershed restoration",
  "orchard commons",
  "collective workshop",
];

const FEATURE_KEYWORDS: Array<{
  match: RegExp;
  seeds: string[];
}> = [
  {
    match: /\b(olive|vineyard|orchard|farm|farming|agricultural?|grove)\b/i,
    seeds: ["orchard commons", "dryland farming", "harvest cooperative"],
  },
  {
    match: /\b(forest|wood|timber|pine|oak|trail)\b/i,
    seeds: ["forest stewardship", "woodland commons", "Sherwood canopy"],
  },
  {
    match: /\b(lake|river|stream|water|spring|wetland|watershed)\b/i,
    seeds: ["watershed restoration", "river commons", "spring-fed settlement"],
  },
  {
    match: /\b(desert|mesa|plain|high desert|off-grid|solar)\b/i,
    seeds: ["desert homestead", "sun commons", "off-grid workshop"],
  },
  {
    match: /\b(market|town|village|mixed-use|main street)\b/i,
    seeds: ["village market", "civic square", "commons exchange"],
  },
  {
    match: /\b(mountain|hill|ridge|valley)\b/i,
    seeds: ["ridge commons", "valley settlement", "upland pathways"],
  },
];

function unique(items: string[]): string[] {
  const seen = new Set<string>();
  const ordered: string[] = [];

  for (const item of items) {
    const normalized = item.trim().toLowerCase();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    ordered.push(item.trim());
  }

  return ordered;
}

export function buildSemanticSeedPlan(land: SelectableLand): SemanticSeedPlan {
  const featureText = [land.name, land.location, ...land.features].join(" ");
  const matchedSeeds = FEATURE_KEYWORDS.flatMap((entry) =>
    entry.match.test(featureText) ? entry.seeds : [],
  );

  const directFeatureSeeds = land.features
    .flatMap((feature) => feature.split(/[,/]/))
    .map((feature) => feature.trim())
    .filter((feature) => feature.length >= 4)
    .slice(0, 6);

  const seedPhrases = unique([
    ...matchedSeeds,
    ...directFeatureSeeds,
    ...BASE_FREELAND_SEEDS,
  ]).slice(0, 12);

  const primarySeed = seedPhrases[0] ?? "freeland commons";
  const curationNotes = [
    `Primary seed anchored to parcel context: ${primarySeed}.`,
    "Curated Freeland library is preferred over random topical seeds.",
    "Land features are injected directly so prompts stay parcel-specific.",
  ];

  return {
    primarySeed,
    seedPhrases,
    curationNotes,
  };
}
