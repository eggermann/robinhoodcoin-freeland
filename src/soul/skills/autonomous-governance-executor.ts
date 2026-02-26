import fs from "node:fs";
import path from "node:path";
import {
  activateProposal,
  createProposal,
  listProposals,
  type Proposal,
} from "../../dao/governance.js";
import { AUTOEXEC } from "../../shared/config.js";
import { getLandSearchManager, type LandListing } from "../land-search.js";
import {
  createProposalFromOpportunity,
  listOpportunities,
  setOpportunityStatus,
  type Opportunity,
} from "../opportunity-scout.js";
import { generateReport } from "../reporting.js";

const STATE_FILE = "./data/autonomy/executor-state.json";

export interface AutonomousExecutorConfig {
  enabled: boolean;
  autoActivateProposals: boolean;
  votingWindowHours: number;
  opportunityMinScore: number;
  opportunityMaxPerCycle: number;
  landMinScore: number;
  landMaxPerCycle: number;
  generateMonthlyReport: boolean;
  maxStateEntries: number;
}

export interface AutonomousExecutorReport {
  startedAt: string;
  finishedAt: string;
  createdProposalIds: string[];
  activatedProposalIds: string[];
  updatedOpportunityIds: string[];
  generatedReportPeriods: string[];
  skipped: string[];
  errors: string[];
}

interface ExecutorState {
  processedOpportunityIds: string[];
  processedLandIds: string[];
  generatedReportPeriods: string[];
  updatedAt: string;
}

function defaultConfig(): AutonomousExecutorConfig {
  return {
    enabled: AUTOEXEC.enabled,
    autoActivateProposals: AUTOEXEC.autoActivateProposals,
    votingWindowHours: AUTOEXEC.votingWindowHours,
    opportunityMinScore: AUTOEXEC.opportunityMinScore,
    opportunityMaxPerCycle: AUTOEXEC.opportunityMaxPerCycle,
    landMinScore: AUTOEXEC.landMinScore,
    landMaxPerCycle: AUTOEXEC.landMaxPerCycle,
    generateMonthlyReport: AUTOEXEC.generateMonthlyReport,
    maxStateEntries: AUTOEXEC.maxStateEntries,
  };
}

function ensureStateDir(): void {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
}

function emptyState(): ExecutorState {
  return {
    processedOpportunityIds: [],
    processedLandIds: [],
    generatedReportPeriods: [],
    updatedAt: new Date().toISOString(),
  };
}

function loadState(): ExecutorState {
  try {
    if (!fs.existsSync(STATE_FILE)) return emptyState();
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as Partial<ExecutorState>;
    return {
      processedOpportunityIds: Array.isArray(parsed.processedOpportunityIds)
        ? parsed.processedOpportunityIds.filter((id): id is string => typeof id === "string")
        : [],
      processedLandIds: Array.isArray(parsed.processedLandIds)
        ? parsed.processedLandIds.filter((id): id is string => typeof id === "string")
        : [],
      generatedReportPeriods: Array.isArray(parsed.generatedReportPeriods)
        ? parsed.generatedReportPeriods.filter((p): p is string => typeof p === "string")
        : [],
      updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : new Date().toISOString(),
    };
  } catch {
    return emptyState();
  }
}

function keepNewest(items: string[], maxEntries: number): string[] {
  const normalizedMax = Math.max(10, maxEntries);
  if (items.length <= normalizedMax) return items;
  return items.slice(items.length - normalizedMax);
}

function saveState(state: ExecutorState, maxEntries: number): void {
  ensureStateDir();
  const next: ExecutorState = {
    processedOpportunityIds: keepNewest(state.processedOpportunityIds, maxEntries),
    processedLandIds: keepNewest(state.processedLandIds, maxEntries),
    generatedReportPeriods: keepNewest(state.generatedReportPeriods, 240),
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(STATE_FILE, JSON.stringify(next, null, 2), "utf-8");
}

function toLandLocation(listing: LandListing): string {
  return [listing.location.city, listing.location.region, listing.location.country]
    .filter(Boolean)
    .join(", ");
}

function expectedOpportunityProposalTitle(opp: Opportunity): string {
  if (opp.type === "grant") return `Apply for grant: ${opp.title}`;
  if (opp.type === "auction") return `Evaluate acquisition: ${opp.title}`;
  return `Sponsorship opportunity: ${opp.title}`;
}

function closesAt(hours: number): string {
  const normalizedHours = Math.max(1, hours);
  return new Date(Date.now() + normalizedHours * 3600_000).toISOString();
}

function proposalAlreadyExists(proposals: Proposal[], title: string): boolean {
  return proposals.some((proposal) => proposal.title.trim() === title.trim());
}

function isActionableOpportunity(opp: Opportunity): boolean {
  return opp.status === "new" || opp.status === "reviewing" || opp.status === "shortlisted";
}

export async function runAutonomousGovernanceExecutor(
  config: AutonomousExecutorConfig = defaultConfig(),
): Promise<AutonomousExecutorReport> {
  const startedAt = new Date().toISOString();
  const report: AutonomousExecutorReport = {
    startedAt,
    finishedAt: startedAt,
    createdProposalIds: [],
    activatedProposalIds: [],
    updatedOpportunityIds: [],
    generatedReportPeriods: [],
    skipped: [],
    errors: [],
  };

  if (!config.enabled) {
    report.skipped.push("executor disabled");
    report.finishedAt = new Date().toISOString();
    return report;
  }

  const state = loadState();
  const proposals = listProposals();

  try {
    const opportunities = listOpportunities()
      .filter((opp) => isActionableOpportunity(opp))
      .filter((opp) => opp.score >= config.opportunityMinScore)
      .filter((opp) => !state.processedOpportunityIds.includes(opp.id))
      .filter((opp) => !proposalAlreadyExists(proposals, expectedOpportunityProposalTitle(opp)))
      .slice(0, Math.max(0, config.opportunityMaxPerCycle));

    for (const opp of opportunities) {
      try {
        const proposal = createProposalFromOpportunity(opp.id, "soul-prime-autonomy");
        report.createdProposalIds.push(proposal.id);

        if (config.autoActivateProposals) {
          const activated = activateProposal(proposal.id, closesAt(config.votingWindowHours));
          report.activatedProposalIds.push(activated.id);
        }

        setOpportunityStatus(opp.id, "pursuing");
        report.updatedOpportunityIds.push(opp.id);
        state.processedOpportunityIds.push(opp.id);
      } catch (err) {
        report.errors.push(
          `opportunity ${opp.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    const shortlist = getLandSearchManager()
      .getShortlist()
      .filter((listing) => (listing.score ?? 0) >= config.landMinScore)
      .filter((listing) => (listing.evaluation?.recommendation ?? "unknown") !== "pass")
      .filter((listing) => !state.processedLandIds.includes(listing.id))
      .slice(0, Math.max(0, config.landMaxPerCycle));

    for (const listing of shortlist) {
      try {
        const title = `Acquire shortlisted parcel ${listing.id}: ${listing.title}`;
        if (proposalAlreadyExists(proposals, title)) {
          report.skipped.push(`land ${listing.id}: proposal already exists`);
          state.processedLandIds.push(listing.id);
          continue;
        }

        const proposal = createProposal({
          title,
          description: [
            `Autonomous shortlist candidate generated by Little John.`,
            `Listing ID: ${listing.id}`,
            `Location: ${toLandLocation(listing)}`,
            `Size: ${listing.sizeAcres} acres`,
            `Price: ${listing.priceSol ?? (listing.priceUSD / 100)} SOL (approx)`,
            `Score: ${listing.score ?? 0}`,
            `Recommendation: ${listing.evaluation?.recommendation ?? "unknown"}`,
            `Source: ${listing.sourceUrl}`,
            `Notes: ${(listing.evaluation?.notes ?? []).join("; ") || "n/a"}`,
          ].join("\n"),
          type: "land_purchase",
          proposer: "soul-prime-autonomy",
          closesAt: closesAt(config.votingWindowHours),
          landDetails: {
            selectedLandId: listing.id,
            location: toLandLocation(listing),
            sizeAcres: listing.sizeAcres,
            priceSOL: listing.priceSol ?? (listing.priceUSD / 100),
            description: listing.description,
          },
        });

        report.createdProposalIds.push(proposal.id);

        if (config.autoActivateProposals) {
          const activated = activateProposal(proposal.id, closesAt(config.votingWindowHours));
          report.activatedProposalIds.push(activated.id);
        }

        state.processedLandIds.push(listing.id);
      } catch (err) {
        report.errors.push(
          `land ${listing.id}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    if (config.generateMonthlyReport) {
      const period = new Date().toISOString().slice(0, 7);
      if (!state.generatedReportPeriods.includes(period)) {
        try {
          const treasuryAddress = process.env.TREASURY_MULTISIG_ADDRESS?.trim();
          const generated = await generateReport(
            treasuryAddress && treasuryAddress.length > 0 ? treasuryAddress : undefined,
          );
          state.generatedReportPeriods.push(generated.period);
          report.generatedReportPeriods.push(generated.period);
        } catch (err) {
          report.errors.push(
            `monthly report: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }
    }
  } finally {
    saveState(state, config.maxStateEntries);
    report.finishedAt = new Date().toISOString();
  }

  return report;
}

export function formatAutonomousGovernanceExecutorReport(
  report: AutonomousExecutorReport,
): string {
  const durationSec = Math.max(
    0,
    Math.round((new Date(report.finishedAt).getTime() - new Date(report.startedAt).getTime()) / 1000),
  );

  const lines = [
    "⚙️ Autonomous Governance Executor",
    `Duration: ${durationSec}s`,
    `Created proposals: ${report.createdProposalIds.length}`,
    `Activated proposals: ${report.activatedProposalIds.length}`,
    `Updated opportunities: ${report.updatedOpportunityIds.length}`,
    `Reports generated: ${report.generatedReportPeriods.join(", ") || "none"}`,
  ];

  if (report.skipped.length > 0) {
    lines.push(`Skipped: ${report.skipped.slice(0, 4).join(" | ")}`);
  }
  if (report.errors.length > 0) {
    lines.push(`Errors: ${report.errors.slice(0, 4).join(" | ")}`);
  }

  return lines.join("\n");
}
