type ParcelLike = {
  title?: string | null;
  location?: string | null;
  country?: string | null;
  status?: string | null;
  sizeAcres?: number | null;
  priceUsd?: number | null;
  teaserImage?: string | null;
  score?: number | null;
};

export function isLaneLead(parcel: ParcelLike): boolean {
  return parcel.status === "lane" || parcel.sizeAcres == null || parcel.priceUsd == null;
}

export function isVerifiedParcel(parcel: ParcelLike): boolean {
  return !isLaneLead(parcel);
}

export function formatParcelFacts(parcel: ParcelLike): string {
  const size = parcel.sizeAcres != null ? `${formatNumber(parcel.sizeAcres)} acres` : "Size pending";
  const price = parcel.priceUsd != null ? `$${parcel.priceUsd.toLocaleString()}` : "Price pending";
  return `${size} • ${price}`;
}

export function getParcelDisplayImage(parcel: ParcelLike): string {
  if (parcel.teaserImage) return parcel.teaserImage;

  const title = (parcel.title ?? "Freeland Parcel").trim() || "Freeland Parcel";
  const location = (parcel.location ?? parcel.country ?? "Location pending").trim() || "Location pending";
  const theme = pickTheme(`${title} ${location}`);
  const scoreLabel = parcel.score != null ? `Score ${Math.round(parcel.score)}` : "Scout listing";

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 720" role="img" aria-label="${escapeXml(title)}">
      <defs>
        <linearGradient id="sky" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${theme.skyTop}" />
          <stop offset="100%" stop-color="${theme.skyBottom}" />
        </linearGradient>
        <linearGradient id="ground" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stop-color="${theme.groundLeft}" />
          <stop offset="100%" stop-color="${theme.groundRight}" />
        </linearGradient>
      </defs>
      <rect width="1200" height="720" fill="url(#sky)" />
      <circle cx="940" cy="120" r="72" fill="${theme.sun}" opacity="0.88" />
      <path d="M0 430 C120 360 220 330 340 360 C470 392 560 404 700 362 C860 314 1020 328 1200 396 L1200 720 L0 720 Z" fill="${theme.mid}" opacity="0.92" />
      <path d="M0 500 C150 430 280 414 400 448 C510 480 640 500 780 460 C930 416 1050 430 1200 494 L1200 720 L0 720 Z" fill="${theme.fore}" />
      <rect x="54" y="52" width="252" height="46" rx="23" fill="${theme.badge}" opacity="0.92" />
      <text x="84" y="82" font-family="Verdana, sans-serif" font-size="26" font-weight="700" fill="#f8fafc">RobinHoodCoin</text>
      <text x="74" y="548" font-family="Verdana, sans-serif" font-size="58" font-weight="700" fill="#f8fafc">${escapeXml(trimForSvg(title, 30))}</text>
      <text x="74" y="600" font-family="Verdana, sans-serif" font-size="30" fill="#dbeafe">${escapeXml(trimForSvg(location, 42))}</text>
      <rect x="74" y="626" width="190" height="38" rx="19" fill="#08110d" opacity="0.7" />
      <text x="102" y="652" font-family="Verdana, sans-serif" font-size="24" fill="#bbf7d0">${escapeXml(scoreLabel)}</text>
    </svg>
  `.trim();

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

type ParcelTheme = {
  skyTop: string;
  skyBottom: string;
  sun: string;
  mid: string;
  fore: string;
  groundLeft: string;
  groundRight: string;
  badge: string;
};

const THEMES: Array<{ keywords: string[]; theme: ParcelTheme }> = [
  {
    keywords: ["arizona", "new mexico", "desert", "nevada", "colorado", "utah"],
    theme: {
      skyTop: "#2d1b0f",
      skyBottom: "#d97745",
      sun: "#fde68a",
      mid: "#8b5a2b",
      fore: "#4d2e14",
      groundLeft: "#6f3b1b",
      groundRight: "#1f130d",
      badge: "#7c2d12",
    },
  },
  {
    keywords: ["oregon", "tennessee", "forest", "wood", "mountain", "lake", "canada", "switzerland"],
    theme: {
      skyTop: "#0f2d34",
      skyBottom: "#3c7c72",
      sun: "#fef08a",
      mid: "#285943",
      fore: "#153124",
      groundLeft: "#1f4d3a",
      groundRight: "#08110d",
      badge: "#14532d",
    },
  },
  {
    keywords: ["portugal", "spain", "alentejo", "extremadura", "mediterranean", "italy", "greece"],
    theme: {
      skyTop: "#16345f",
      skyBottom: "#efb366",
      sun: "#fef3c7",
      mid: "#6d8f52",
      fore: "#2f4a23",
      groundLeft: "#58713d",
      groundRight: "#102014",
      badge: "#92400e",
    },
  },
];

const DEFAULT_THEME: ParcelTheme = {
  skyTop: "#14263a",
  skyBottom: "#4a7f62",
  sun: "#fde68a",
  mid: "#47654f",
  fore: "#1b3024",
  groundLeft: "#294936",
  groundRight: "#08110d",
  badge: "#365314",
};

function pickTheme(text: string): ParcelTheme {
  const normalized = text.toLowerCase();
  return THEMES.find((entry) => entry.keywords.some((keyword) => normalized.includes(keyword)))?.theme ?? DEFAULT_THEME;
}

function trimForSvg(value: string, maxChars: number): string {
  return value.length > maxChars ? `${value.slice(0, maxChars - 1)}...` : value;
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
