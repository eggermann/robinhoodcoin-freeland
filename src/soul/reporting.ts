/**
 * reporting.ts — Transparency Reporting Module
 *
 * From the plan: "publish a transparency report of funds... the AI bot can
 * compile and format these updates, maybe even automatically generate
 * monthly 'state of the project' newsletters"
 *
 * Generates reports on:
 *   - Treasury balance and transaction history
 *   - Fund allocation vs charter targets
 *   - Proposals and governance activity
 *   - Land portfolio status
 *   - Community growth metrics
 */

import fs from "node:fs";
import path from "node:path";
import { connection, PAYPAL } from "../shared/config.js";
import { CHARTER } from "../shared/charter.js";
import { listProposals } from "../dao/governance.js";
import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { getMemberLedgerStats, listMemberProfiles } from "./member-ledger.js";

// ── Types ────────────────────────────────────────────────

export interface TreasurySnapshot {
  balanceSOL: number;
  balanceLamports: number;
  timestamp: string;
  address: string;
}

export interface FreelandParcel {
  id: string;
  name: string;
  location: string;
  sizeAcres: number;
  purchasePriceSOL: number;
  purchaseDate: string;
  status: "acquired" | "developing" | "active" | "proposed";
  description: string;
  activities: string[];
  stampSeriesIds?: string[];
  imageUrl?: string;
}

export interface CommunityMetrics {
  totalMembers: number;
  rhcHolders: number;
  stampHolders: number;
  activeVoters: number;
  telegramMembers: number;
  discordMembers: number;
}

export interface TransparencyReport {
  title: string;
  period: string;
  generatedAt: string;
  treasury: {
    currentBalance: TreasurySnapshot;
    allocation: {
      landAcquisition: { target: number; actual: number };
      charitableCauses: { target: number; actual: number };
      operations: { target: number; actual: number };
      operationsBreakdown?: {
        paypalMaintenance: { shareOfOperations: number };
        remainder: { shareOfOperations: number };
        paypalShareOfTotal: number;
      };
    };
    totalRaised: number;
    totalSpent: number;
  };
  governance: {
    totalProposals: number;
    approved: number;
    rejected: number;
    active: number;
    pending: number;
  };
  portfolio: FreelandParcel[];
  community: CommunityMetrics;
  highlights: string[];
  nextSteps: string[];
}

// ── Data Directories ─────────────────────────────────────

const DATA_DIR = "./data/reports";
const PORTFOLIO_FILE = "./data/portfolio.json";

function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function roundTo(value: number, places = 4): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function ratio(part: number, whole: number): number {
  if (!Number.isFinite(part) || !Number.isFinite(whole) || whole <= 0) return 0;
  return part / whole;
}

// ── Portfolio Management ─────────────────────────────────

export function getPortfolio(): FreelandParcel[] {
  if (!fs.existsSync(PORTFOLIO_FILE)) return [];
  return JSON.parse(fs.readFileSync(PORTFOLIO_FILE, "utf-8")) as FreelandParcel[];
}

export function addParcel(parcel: FreelandParcel): void {
  const portfolio = getPortfolio();
  portfolio.push(parcel);
  fs.mkdirSync(path.dirname(PORTFOLIO_FILE), { recursive: true });
  fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(portfolio, null, 2));
  console.log(`🏡 Parcel added to portfolio: "${parcel.name}" — ${parcel.location}`);
}

export function updateParcel(id: string, updates: Partial<FreelandParcel>): void {
  const portfolio = getPortfolio();
  const idx = portfolio.findIndex((p) => p.id === id);
  if (idx === -1) throw new Error(`Parcel ${id} not found`);
  portfolio[idx] = { ...portfolio[idx], ...updates };
  fs.writeFileSync(PORTFOLIO_FILE, JSON.stringify(portfolio, null, 2));
}

// ── Report Generation ────────────────────────────────────

export async function generateReport(
  treasuryAddress?: string,
  communityMetrics?: CommunityMetrics,
): Promise<TransparencyReport> {
  ensureDir();
  const paypalShare = Math.max(0, Math.min(1, PAYPAL.operationsShare));

  // Treasury snapshot
  let treasurySnapshot: TreasurySnapshot = {
    balanceSOL: 0,
    balanceLamports: 0,
    timestamp: new Date().toISOString(),
    address: treasuryAddress ?? "not-configured",
  };

  if (treasuryAddress) {
    try {
      const pubkey = new PublicKey(treasuryAddress);
      const balance = await connection.getBalance(pubkey);
      treasurySnapshot = {
        balanceSOL: balance / LAMPORTS_PER_SOL,
        balanceLamports: balance,
        timestamp: new Date().toISOString(),
        address: treasuryAddress,
      };
    } catch (err) {
      console.error("Could not fetch treasury balance:", err);
    }
  }

  // Governance stats
  const allProposals = listProposals();
  const approved = allProposals.filter((p) => p.status === "approved").length;
  const rejected = allProposals.filter((p) => p.status === "rejected").length;
  const active = allProposals.filter((p) => p.status === "active").length;
  const pending = allProposals.filter((p) => p.status === "draft").length;

  // Portfolio
  const portfolio = getPortfolio();
  const memberStats = getMemberLedgerStats();
  const memberProfiles = listMemberProfiles();
  const knownLandSpent = roundTo(
    portfolio
      .filter((parcel) => parcel.status !== "proposed")
      .reduce((sum, parcel) => sum + Math.max(0, parcel.purchasePriceSOL), 0),
  );
  const trackedRaised = roundTo(memberStats.totalContributedSOL);
  const treasuryBackedRaised = roundTo(treasurySnapshot.balanceSOL + knownLandSpent);
  const inferredTotalRaised = roundTo(Math.max(trackedRaised, treasuryBackedRaised));
  const inferredTotalSpent = roundTo(Math.max(0, inferredTotalRaised - treasurySnapshot.balanceSOL));
  const charitableSpent = 0;
  const operationsSpent = roundTo(Math.max(0, inferredTotalSpent - knownLandSpent - charitableSpent));
  const stampHolders = memberProfiles.filter((profile) => profile.totalStampMints > 0).length;
  const activeVoters = memberProfiles.filter((profile) => profile.votesCast > 0).length;

  // Build report
  const report: TransparencyReport = {
    title: "RobinHoodCoin — State of the Freeland",
    period: new Date().toISOString().slice(0, 7), // YYYY-MM
    generatedAt: new Date().toISOString(),
    treasury: {
      currentBalance: treasurySnapshot,
      allocation: {
        landAcquisition: {
          target: CHARTER.treasury.landAcquisition,
          actual: ratio(knownLandSpent, inferredTotalSpent),
        },
        charitableCauses: {
          target: CHARTER.treasury.charitableCauses,
          actual: ratio(charitableSpent, inferredTotalSpent),
        },
        operations: {
          target: CHARTER.treasury.operations,
          actual: ratio(operationsSpent, inferredTotalSpent),
        },
        operationsBreakdown: {
          paypalMaintenance: {
            shareOfOperations: paypalShare,
          },
          remainder: {
            shareOfOperations: 1 - paypalShare,
          },
          paypalShareOfTotal: CHARTER.treasury.operations * paypalShare,
        },
      },
      totalRaised: inferredTotalRaised,
      totalSpent: inferredTotalSpent,
    },
    governance: {
      totalProposals: allProposals.length,
      approved,
      rejected,
      active,
      pending,
    },
    portfolio,
    community: communityMetrics ?? {
      totalMembers: memberStats.totalMembers,
      rhcHolders: 0,
      stampHolders,
      activeVoters,
      telegramMembers: memberStats.totalMembers,
      discordMembers: 0,
    },
    highlights: generateHighlights(
      portfolio,
      allProposals.length,
      treasurySnapshot,
      inferredTotalRaised,
      memberStats.totalMembers,
    ),
    nextSteps: generateNextSteps(portfolio),
  };

  // Save report
  const filename = `report-${report.period}.json`;
  const reportPath = path.join(DATA_DIR, filename);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(`📊 Report generated: ${reportPath}`);

  return report;
}

// ── Human-Readable Report ────────────────────────────────

export function formatReportMarkdown(report: TransparencyReport): string {
  const t = report.treasury;
  const g = report.governance;

  let md = `# 🏹 ${report.title}
## Report Period: ${report.period}
Generated: ${new Date(report.generatedAt).toLocaleDateString()}

---

## 💰 Treasury

| Metric | Value |
|--------|-------|
| Balance | **${t.currentBalance.balanceSOL.toFixed(4)} SOL** |
| Total Raised | ${t.totalRaised.toFixed(2)} SOL |
| Total Spent | ${t.totalSpent.toFixed(2)} SOL |
| Address | \`${t.currentBalance.address}\` |

### Fund Allocation

| Category | Target | Actual |
|----------|--------|--------|
| 🌿 Land Acquisition | ${(t.allocation.landAcquisition.target * 100).toFixed(0)}% | ${(t.allocation.landAcquisition.actual * 100).toFixed(0)}% |
| 🤝 Charitable Causes | ${(t.allocation.charitableCauses.target * 100).toFixed(0)}% | ${(t.allocation.charitableCauses.actual * 100).toFixed(0)}% |
| ⚙️ Operations | ${(t.allocation.operations.target * 100).toFixed(0)}% | ${(t.allocation.operations.actual * 100).toFixed(0)}% |

### Operations Split (Maintenance Rule)

| Item | Share of Operations | Share of Total | Destination |
|------|--------------------:|---------------:|------------|
| 🧾 PayPal Maintenance | ${(((t.allocation.operationsBreakdown?.paypalMaintenance.shareOfOperations ?? 0.4) * 100)).toFixed(0)}% | ${(((t.allocation.operationsBreakdown?.paypalShareOfTotal ?? 0.04) * 100)).toFixed(0)}% | *(hidden; env-configured)* |
| ⚙️ Remaining Ops | ${(((t.allocation.operationsBreakdown?.remainder.shareOfOperations ?? 0.6) * 100)).toFixed(0)}% | ${((t.allocation.operations.target * (t.allocation.operationsBreakdown?.remainder.shareOfOperations ?? 0.6) * 100)).toFixed(0)}% | hosting/legal/dev/etc. |

---

## 🗳️ Governance

| Metric | Count |
|--------|-------|
| Total Proposals | ${g.totalProposals} |
| ✅ Approved | ${g.approved} |
| ❌ Rejected | ${g.rejected} |
| 🔄 Active | ${g.active} |
| 📝 Pending | ${g.pending} |

---

## 🏡 Freeland Portfolio

`;

  if (report.portfolio.length === 0) {
    md += "_No parcels acquired yet. The journey begins!_\n\n";
  } else {
    for (const parcel of report.portfolio) {
      md += `### ${parcel.name}
- **Location**: ${parcel.location}
- **Size**: ${parcel.sizeAcres} acres
- **Purchased**: ${parcel.purchaseDate} for ${parcel.purchasePriceSOL} SOL
- **Status**: ${parcel.status}
- **Activities**: ${parcel.activities.join(", ") || "Planning phase"}

`;
    }
  }

  md += `---

## 👥 Community

| Metric | Count |
|--------|-------|
| Total Members | ${report.community.totalMembers} |
| RHC Holders | ${report.community.rhcHolders} |
| Stamp Holders | ${report.community.stampHolders} |
| Active Voters | ${report.community.activeVoters} |

---

## ✨ Highlights

${report.highlights.map((h) => `- ${h}`).join("\n")}

## 🔮 Next Steps

${report.nextSteps.map((s) => `- ${s}`).join("\n")}

---

_This report is auto-generated from tracked treasury balances and local project ledgers. Verify critical figures before publication._
_"${CHARTER.spirit.ethos}"_ 🏹🌿
`;

  return md;
}

// ── Telegram-Formatted Report ────────────────────────────

export function formatReportTelegram(report: TransparencyReport): string {
  const t = report.treasury;
  return `🏹 *State of the Freeland — ${report.period}*

💰 *Treasury*: ${t.currentBalance.balanceSOL.toFixed(4)} SOL
🏡 *Parcels*: ${report.portfolio.length} acquired
🗳️ *Proposals*: ${report.governance.totalProposals} (${report.governance.approved} approved)
👥 *Members*: ${report.community.totalMembers}

${report.highlights.length > 0 ? `✨ *Highlights*:\n${report.highlights.map((h) => `  • ${h}`).join("\n")}` : ""}

_Full report is available on the synced web dashboard._`;
}

// ── Helper Functions ─────────────────────────────────────

function generateHighlights(
  portfolio: FreelandParcel[],
  proposalCount: number,
  treasury: TreasurySnapshot,
  totalRaised: number,
  totalMembers: number,
): string[] {
  const highlights: string[] = [];

  if (portfolio.length > 0) {
    highlights.push(
      `${portfolio.length} freeland parcel(s) in the portfolio`,
    );
    const active = portfolio.filter((p) => p.status === "active");
    if (active.length > 0) {
      highlights.push(
        `${active.length} active community space(s) in operation`,
      );
    }
  }

  if (proposalCount > 0) {
    highlights.push(`${proposalCount} governance proposal(s) processed`);
  }

  if (treasury.balanceSOL > 0) {
    highlights.push(
      `Treasury holds ${treasury.balanceSOL.toFixed(2)} SOL`,
    );
  }

  if (totalRaised > 0) {
    highlights.push(`Tracked community support totals ${totalRaised.toFixed(2)} SOL`);
  }

  if (totalMembers > 0) {
    highlights.push(`${totalMembers} member profile(s) tracked in the community ledger`);
  }

  if (highlights.length === 0) {
    highlights.push("Project foundation established — ready for launch!");
  }

  return highlights;
}

function generateNextSteps(portfolio: FreelandParcel[]): string[] {
  if (portfolio.length === 0) {
    return [
      "Launch Freeland Stamp NFT sale to seed the treasury",
      "Begin land search in target regions",
      "Grow community membership through outreach",
      "Submit first land acquisition proposal for DAO vote",
    ];
  }

  return [
    "Continue fundraising for next parcel acquisition",
    "Develop existing parcels with community input",
    "Partner with aligned DAOs and community land trusts",
    "Expand Soul network to new platforms",
  ];
}
