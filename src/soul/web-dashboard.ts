import fs from "node:fs";
import path from "node:path";
import { listProposals } from "../dao/governance.js";
import { getActiveCampaigns, getAllCampaigns, getCampaignProgress } from "../nft/stamp-tiers.js";
import { getLandSearchManager } from "./land-search.js";
import { getMemberLedgerStats } from "./member-ledger.js";
import { getPortfolio } from "./reporting.js";
import { getTreasuryBalanceSnapshot } from "./skills/treasury-tracker.js";

export interface WebDashboardData {
  generatedAt: string;
  stats: {
    treasuryBalanceSOL: number;
    solRaised: number;
    clanMembers: number;
    parcelsAcquired: number;
    stampsMinted: number;
    activeCampaigns: number;
  };
  treasury: {
    configured: boolean;
    address: string | null;
    balanceSOL: number;
    balanceLamports: number;
    rpcEndpoint: string;
    cluster: string;
    explorerUrl: string | null;
    error?: string;
  };
  campaigns: Array<{
    id: string;
    name: string;
    tier: string;
    minted: number;
    maxSupply: number;
    raisedSOL: number;
    goalSOL: number;
    percentFunded: number;
    percentMinted: number;
    active: boolean;
  }>;
  portfolio: {
    total: number;
    parcels: Array<{
      id: string;
      name: string;
      location: string;
      sizeAcres: number;
      purchasePriceSOL: number;
      status: string;
      description: string;
      activities: string[];
    }>;
  };
  governance: {
    totalProposals: number;
    draft: number;
    active: number;
    approved: number;
    rejected: number;
    executed: number;
    cancelled: number;
  };
  research: {
    shortlistCount: number;
    shortlistTop: Array<{
      id: string;
      title: string;
      region: string;
      country: string;
      score: number;
      recommendation: string;
      sourceUrl: string;
    }>;
  };
  transparency: {
    rhcMintAddress: string | null;
    treasuryMultisigAddress: string | null;
    nftCollectionAddress: string | null;
  };
  reports: {
    latestPeriod: string | null;
    latestGeneratedAt: string | null;
    latestReportUrl: string | null;
  };
  security: {
    multisigConfigured: boolean;
    mintAuthorityStatus: "multisig" | "external" | "unknown";
    mintAuthority: string | null;
    daemonEnabled: boolean;
    gitignoreProtectsEnv: boolean;
    gitignoreProtectsKeys: boolean;
  };
}

interface LatestReportMeta {
  period: string;
  generatedAt: string;
  sourcePath: string;
  fileName: string;
}

const REPORTS_DIR = "./data/reports";
const WEB_DATA_DIR = "./site/public/data";
const WEB_REPORTS_DIR = path.join(WEB_DATA_DIR, "reports");
const WEB_DASHBOARD_FILE = path.join(WEB_DATA_DIR, "dashboard.json");

function ensureDir(dirPath: string): void {
  fs.mkdirSync(dirPath, { recursive: true });
}

function safeReadJson<T>(filePath: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
  } catch {
    return null;
  }
}

function readLatestReportMeta(): LatestReportMeta | null {
  if (!fs.existsSync(REPORTS_DIR)) return null;

  const candidates = fs.readdirSync(REPORTS_DIR)
    .filter((file) => /^report-\d{4}-\d{2}\.json$/i.test(file))
    .sort((a, b) => b.localeCompare(a));

  const latestFile = candidates[0];
  if (!latestFile) return null;

  const sourcePath = path.join(REPORTS_DIR, latestFile);
  const parsed = safeReadJson<{ period?: string; generatedAt?: string }>(sourcePath);

  return {
    period: parsed?.period ?? latestFile.replace(/^report-/, "").replace(/\.json$/i, ""),
    generatedAt: parsed?.generatedAt ?? new Date(fs.statSync(sourcePath).mtime).toISOString(),
    sourcePath,
    fileName: latestFile,
  };
}

function copyLatestReportToWeb(latest: LatestReportMeta | null): string | null {
  if (!latest) return null;

  ensureDir(WEB_REPORTS_DIR);

  const periodicTarget = path.join(WEB_REPORTS_DIR, latest.fileName);
  const latestTarget = path.join(WEB_REPORTS_DIR, "latest.json");

  fs.copyFileSync(latest.sourcePath, periodicTarget);
  fs.copyFileSync(latest.sourcePath, latestTarget);

  return "/data/reports/latest.json";
}

function readGitignoreFlags(): { gitignoreProtectsEnv: boolean; gitignoreProtectsKeys: boolean } {
  const gitignorePath = "./.gitignore";
  if (!fs.existsSync(gitignorePath)) {
    return {
      gitignoreProtectsEnv: false,
      gitignoreProtectsKeys: false,
    };
  }

  const lines = fs.readFileSync(gitignorePath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim());

  const lineSet = new Set(lines);

  return {
    gitignoreProtectsEnv: lineSet.has(".env") || lineSet.has("*.env"),
    gitignoreProtectsKeys: lineSet.has("keys/") || lineSet.has("keys"),
  };
}

function resolveMintAuthorityStatus(
  mintAuthority: string | null,
  treasuryMultisigAddress: string | null,
): "multisig" | "external" | "unknown" {
  if (!mintAuthority) return "unknown";
  if (treasuryMultisigAddress && mintAuthority === treasuryMultisigAddress) return "multisig";
  return "external";
}

export async function buildWebDashboardData(): Promise<WebDashboardData> {
  const treasury = await getTreasuryBalanceSnapshot();
  const members = getMemberLedgerStats();
  const campaigns = getAllCampaigns();
  const activeCampaigns = getActiveCampaigns();
  const portfolio = getPortfolio();
  const proposals = listProposals();
  const proposalStats = proposals.reduce((acc, proposal) => {
    acc[proposal.status] = (acc[proposal.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const shortlist = getLandSearchManager().getShortlist();

  const latestReport = readLatestReportMeta();
  const latestReportUrl = copyLatestReportToWeb(latestReport);

  const campaignsWithProgress = campaigns.map((campaign) => {
    const progress = getCampaignProgress(campaign.id);
    return {
      id: campaign.id,
      name: campaign.name,
      tier: campaign.tier,
      minted: campaign.minted,
      maxSupply: campaign.maxSupply,
      raisedSOL: campaign.raisedSOL,
      goalSOL: campaign.goalSOL,
      percentFunded: progress?.percentFunded ?? 0,
      percentMinted: progress?.percentMinted ?? 0,
      active: campaign.active,
    };
  });

  const totalStampMints = campaigns.reduce((sum, campaign) => sum + campaign.minted, 0);
  const totalRaisedByCampaigns = campaigns.reduce((sum, campaign) => sum + campaign.raisedSOL, 0);

  const treasuryMultisigAddress = process.env.TREASURY_MULTISIG_ADDRESS?.trim() || null;
  const mintAuthority = process.env.RHC_MINT_AUTHORITY?.trim() || null;
  const gitignoreFlags = readGitignoreFlags();

  return {
    generatedAt: new Date().toISOString(),
    stats: {
      treasuryBalanceSOL: treasury.balanceSOL,
      solRaised: totalRaisedByCampaigns,
      clanMembers: members.totalMembers,
      parcelsAcquired: portfolio.length,
      stampsMinted: totalStampMints,
      activeCampaigns: activeCampaigns.length,
    },
    treasury: {
      configured: treasury.configured,
      address: treasury.address,
      balanceSOL: treasury.balanceSOL,
      balanceLamports: treasury.balanceLamports,
      rpcEndpoint: treasury.rpcEndpoint,
      cluster: treasury.cluster,
      explorerUrl: treasury.explorerUrl,
      error: treasury.error,
    },
    campaigns: campaignsWithProgress.sort((a, b) => Number(b.active) - Number(a.active)),
    portfolio: {
      total: portfolio.length,
      parcels: portfolio.map((parcel) => ({
        id: parcel.id,
        name: parcel.name,
        location: parcel.location,
        sizeAcres: parcel.sizeAcres,
        purchasePriceSOL: parcel.purchasePriceSOL,
        status: parcel.status,
        description: parcel.description,
        activities: parcel.activities,
      })),
    },
    governance: {
      totalProposals: proposals.length,
      draft: proposalStats.draft ?? 0,
      active: proposalStats.active ?? 0,
      approved: proposalStats.approved ?? 0,
      rejected: proposalStats.rejected ?? 0,
      executed: proposalStats.executed ?? 0,
      cancelled: proposalStats.cancelled ?? 0,
    },
    research: {
      shortlistCount: shortlist.length,
      shortlistTop: shortlist.slice(0, 6).map((listing) => ({
        id: listing.id,
        title: listing.title,
        region: listing.location.region,
        country: listing.location.country,
        score: listing.score ?? 0,
        recommendation: listing.evaluation?.recommendation ?? "unknown",
        sourceUrl: listing.sourceUrl,
      })),
    },
    transparency: {
      rhcMintAddress: process.env.RHC_MINT_ADDRESS?.trim() || null,
      treasuryMultisigAddress,
      nftCollectionAddress: process.env.NFT_COLLECTION_ADDRESS?.trim() || null,
    },
    reports: {
      latestPeriod: latestReport?.period ?? null,
      latestGeneratedAt: latestReport?.generatedAt ?? null,
      latestReportUrl,
    },
    security: {
      multisigConfigured: Boolean(treasuryMultisigAddress),
      mintAuthorityStatus: resolveMintAuthorityStatus(mintAuthority, treasuryMultisigAddress),
      mintAuthority,
      daemonEnabled: (process.env.OPENCLAW_DAEMON_ENABLED ?? "false").toLowerCase() === "true",
      gitignoreProtectsEnv: gitignoreFlags.gitignoreProtectsEnv,
      gitignoreProtectsKeys: gitignoreFlags.gitignoreProtectsKeys,
    },
  };
}

export async function syncWebDashboardData(
  outputPath: string = WEB_DASHBOARD_FILE,
): Promise<WebDashboardData> {
  const dashboard = await buildWebDashboardData();
  ensureDir(path.dirname(outputPath));
  fs.writeFileSync(outputPath, JSON.stringify(dashboard, null, 2), "utf-8");
  return dashboard;
}
