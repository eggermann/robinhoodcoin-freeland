import fs from "node:fs";
import path from "node:path";
import {
  activateProposal,
  createProposal,
  getProposal,
  listProposals,
} from "../../dao/governance.js";
import { createLandStampBatch, findSelectableLand, listSelectableLands } from "../../nft/land-stamp-factory.js";
import { getCampaign, getCampaignProgress, getActiveCampaigns, getAllCampaigns } from "../../nft/stamp-tiers.js";
import { AUTOFUSION, OPENCLAW } from "../../shared/config.js";
import { getLandSearchManager } from "../land-search.js";
import { getMemberLedgerStats } from "../member-ledger.js";

const DATA_DIR = "./data/openclaw-fusion";
const CYCLE_LOG_FILE = path.join(DATA_DIR, "cycles.jsonl");

type FusionActionType = "launch_campaign" | "create_land_proposal" | "activate_proposal";

interface OpenAIMessage {
  content?: string | Array<{ type?: string; text?: string }>;
}

interface OpenAIResponse {
  choices?: Array<{
    message?: OpenAIMessage;
  }>;
}

interface FusionAction {
  type: FusionActionType;
  landId?: string;
  campaignId?: string;
  proposalId?: string;
  title?: string;
  reason?: string;
  maxSupply?: number;
  goalSOL?: number;
  valueSOL?: number;
  activate?: boolean;
  votingHours?: number;
}

interface ParsedFusionOutput {
  summary: string;
  actions: FusionAction[];
}

export interface OpenClawFusionConfig {
  enabled: boolean;
  maxActions: number;
  maxTokens: number;
  temperature: number;
}

export interface OpenClawFusionReport {
  startedAt: string;
  finishedAt: string;
  summary: string;
  actionsRequested: FusionAction[];
  executed: string[];
  skipped: string[];
  errors: string[];
  raw: string;
}

function defaultConfig(): OpenClawFusionConfig {
  return {
    enabled: AUTOFUSION.enabled,
    maxActions: AUTOFUSION.maxActions,
    maxTokens: AUTOFUSION.maxTokens,
    temperature: AUTOFUSION.temperature,
  };
}

function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function appendJsonLine(filePath: string, payload: unknown): void {
  ensureDir();
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf-8");
}

function buildGatewayUrl(): string {
  const base = OPENCLAW.gatewayUrl.endsWith("/")
    ? OPENCLAW.gatewayUrl
    : `${OPENCLAW.gatewayUrl}/`;
  const pathPart = OPENCLAW.chatCompletionsPath.startsWith("/")
    ? OPENCLAW.chatCompletionsPath.slice(1)
    : OPENCLAW.chatCompletionsPath;
  return new URL(pathPart, base).toString();
}

function extractContent(content: OpenAIMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type?: string; text?: string } => typeof part === "object")
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();
}

function extractJsonPayload(raw: string): string {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i) ?? raw.match(/```\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) return raw.slice(start, end + 1);
  return raw.trim();
}

function normalizeAction(raw: unknown): FusionAction | null {
  if (typeof raw !== "object" || raw === null) return null;
  const src = raw as Record<string, unknown>;

  const type = typeof src.type === "string" ? src.type.trim() as FusionActionType : null;
  if (!type || !["launch_campaign", "create_land_proposal", "activate_proposal"].includes(type)) {
    return null;
  }

  const toNumber = (value: unknown): number | undefined => {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string" && value.trim().length > 0) {
      const num = Number(value);
      if (Number.isFinite(num)) return num;
    }
    return undefined;
  };

  return {
    type,
    landId: typeof src.landId === "string" ? src.landId.trim() : undefined,
    campaignId: typeof src.campaignId === "string" ? src.campaignId.trim() : undefined,
    proposalId: typeof src.proposalId === "string" ? src.proposalId.trim() : undefined,
    title: typeof src.title === "string" ? src.title.trim() : undefined,
    reason: typeof src.reason === "string" ? src.reason.trim() : undefined,
    maxSupply: toNumber(src.maxSupply),
    goalSOL: toNumber(src.goalSOL),
    valueSOL: toNumber(src.valueSOL),
    activate: src.activate === true,
    votingHours: toNumber(src.votingHours),
  };
}

function parseFusionOutput(raw: string, maxActions: number): ParsedFusionOutput {
  const payload = extractJsonPayload(raw);

  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const summary = typeof parsed.summary === "string" ? parsed.summary.trim() : "No summary returned.";
    const actionList = Array.isArray(parsed.actions) ? parsed.actions : [];

    const actions: FusionAction[] = [];
    for (const candidate of actionList) {
      const normalized = normalizeAction(candidate);
      if (!normalized) continue;
      actions.push(normalized);
      if (actions.length >= Math.max(1, maxActions)) break;
    }

    return {
      summary: summary || "No summary returned.",
      actions,
    };
  } catch {
    return {
      summary: raw.trim().slice(0, 600) || "No summary returned.",
      actions: [],
    };
  }
}

function roleSystemPrompt(maxActions: number): string {
  return [
    "You are OpenClaw Fusion Driver for RobinHoodCoin Freeland.",
    "Goal: unify DAO governance, user membership signals, and Stamp campaigns.",
    "Return JSON only, no markdown, no prose outside JSON.",
    "Schema:",
    `{"summary":"string","actions":[{"type":"launch_campaign|create_land_proposal|activate_proposal","landId":"string?","campaignId":"string?","proposalId":"string?","title":"string?","reason":"string?","maxSupply":120,"goalSOL":120,"valueSOL":0.9,"activate":true,"votingHours":168}]}`,
    `At most ${Math.max(1, maxActions)} actions.`,
    "Choose safe, concrete actions that avoid duplicates.",
    "If no action is needed, return empty actions array.",
  ].join("\n");
}

function buildSnapshot(): Record<string, unknown> {
  const proposals = listProposals();
  const activeCampaigns = getActiveCampaigns();
  const allCampaigns = getAllCampaigns();
  const lands = listSelectableLands();
  const shortlist = getLandSearchManager().getShortlist();
  const members = getMemberLedgerStats();

  return {
    timestamp: new Date().toISOString(),
    members,
    dao: {
      totalProposals: proposals.length,
      active: proposals.filter((proposal) => proposal.status === "active").length,
      draft: proposals.filter((proposal) => proposal.status === "draft").length,
      approved: proposals.filter((proposal) => proposal.status === "approved").length,
      latest: proposals.slice(0, 8).map((proposal) => ({
        id: proposal.id,
        title: proposal.title,
        type: proposal.type,
        status: proposal.status,
        votesFor: proposal.votesFor,
        votesAgainst: proposal.votesAgainst,
        selectedLandId: proposal.landDetails?.selectedLandId ?? null,
        stampCampaignId: proposal.landDetails?.stampCampaignId ?? null,
      })),
    },
    stamps: {
      activeCampaigns: activeCampaigns.map((campaign) => {
        const progress = getCampaignProgress(campaign.id);
        return {
          id: campaign.id,
          name: campaign.name,
          tier: campaign.tier,
          parcelId: campaign.parcelId,
          raisedSOL: campaign.raisedSOL,
          goalSOL: campaign.goalSOL,
          minted: campaign.minted,
          maxSupply: campaign.maxSupply,
          percentFunded: progress?.percentFunded ?? 0,
        };
      }),
      recentCampaigns: allCampaigns.slice(-12).map((campaign) => ({
        id: campaign.id,
        parcelId: campaign.parcelId,
        tier: campaign.tier,
        active: campaign.active,
        raisedSOL: campaign.raisedSOL,
        goalSOL: campaign.goalSOL,
      })),
    },
    land: {
      selectable: lands.slice(0, 16).map((land) => ({
        id: land.id,
        source: land.source,
        name: land.name,
        location: land.location,
        sizeAcres: land.sizeAcres,
        landPriceSOL: land.landPriceSOL,
      })),
      shortlist: shortlist.slice(0, 12).map((listing) => ({
        id: listing.id,
        title: listing.title,
        score: listing.score ?? 0,
        recommendation: listing.evaluation?.recommendation ?? "unknown",
      })),
    },
    constraints: {
      noDuplicateCampaignPerParcel: true,
      noDuplicateProposalPerCampaign: true,
      maxActions: AUTOFUSION.maxActions,
    },
  };
}

function existingProposalForCampaign(campaignId: string): boolean {
  return listProposals().some((proposal) => proposal.landDetails?.stampCampaignId === campaignId);
}

function existingProposalForLand(landId: string): boolean {
  return listProposals().some((proposal) => proposal.landDetails?.selectedLandId === landId);
}

function activeCampaignForLand(landId: string): boolean {
  return getActiveCampaigns().some((campaign) => campaign.parcelId === landId);
}

function toClosesAt(hours?: number): string {
  const h = Math.max(1, Math.floor(hours ?? 168));
  return new Date(Date.now() + h * 3600_000).toISOString();
}

async function executeAction(action: FusionAction, report: OpenClawFusionReport): Promise<void> {
  switch (action.type) {
    case "launch_campaign": {
      const landId = action.landId?.trim();
      if (!landId) {
        report.skipped.push("launch_campaign skipped: missing landId");
        return;
      }

      const land = findSelectableLand(landId);
      if (!land) {
        report.skipped.push(`launch_campaign skipped: unknown land ${landId}`);
        return;
      }

      if (activeCampaignForLand(land.id)) {
        report.skipped.push(`launch_campaign skipped: active campaign already exists for ${land.id}`);
        return;
      }
      if (existingProposalForLand(land.id)) {
        report.skipped.push(`launch_campaign skipped: proposal already exists for ${land.id}`);
        return;
      }

      const batch = await createLandStampBatch({
        selectedLandId: land.id,
        maxSupply: action.maxSupply,
        goalSOL: action.goalSOL,
        requestedValueSOL: action.valueSOL,
        activateImmediately: true,
        language: "en",
      });

      report.executed.push(
        `launch_campaign: ${batch.campaign.id} for ${land.id} (${action.reason ?? "no reason"})`,
      );
      return;
    }

    case "create_land_proposal": {
      const campaignId = action.campaignId?.trim();
      if (!campaignId) {
        report.skipped.push("create_land_proposal skipped: missing campaignId");
        return;
      }

      const campaign = getCampaign(campaignId);
      if (!campaign) {
        report.skipped.push(`create_land_proposal skipped: unknown campaign ${campaignId}`);
        return;
      }

      if (!campaign.parcelId) {
        report.skipped.push(`create_land_proposal skipped: campaign ${campaignId} has no parcelId`);
        return;
      }

      if (existingProposalForCampaign(campaignId)) {
        report.skipped.push(`create_land_proposal skipped: proposal already exists for campaign ${campaignId}`);
        return;
      }

      const land = findSelectableLand(campaign.parcelId);
      if (!land) {
        report.skipped.push(`create_land_proposal skipped: parcel ${campaign.parcelId} not selectable`);
        return;
      }

      const proposal = createProposal({
        title: action.title?.trim() || `Acquire parcel ${land.id} via campaign ${campaign.id}`,
        description: [
          `OpenClaw fusion driver created this land proposal.`,
          `Reason: ${action.reason ?? "campaign-governance alignment"}`,
          `Campaign: ${campaign.id} (${campaign.name})`,
          `Campaign progress: ${campaign.raisedSOL}/${campaign.goalSOL} SOL`,
          `Land: ${land.id} | ${land.name} | ${land.location}`,
          `Estimated land price: ${land.landPriceSOL} SOL`,
        ].join("\n"),
        type: "land_purchase",
        proposer: "openclaw-fusion-driver",
        closesAt: toClosesAt(action.votingHours),
        landDetails: {
          selectedLandId: land.id,
          location: land.location,
          sizeAcres: land.sizeAcres,
          priceSOL: land.landPriceSOL,
          description: `Fusion-linked parcel from campaign ${campaign.id}.`,
          stampCampaignId: campaign.id,
        },
      });

      report.executed.push(
        `create_land_proposal: ${proposal.id} from campaign ${campaign.id} (${action.reason ?? "no reason"})`,
      );

      if (action.activate === true) {
        const activated = activateProposal(proposal.id, toClosesAt(action.votingHours));
        report.executed.push(`activate_proposal: ${activated.id} (auto from create_land_proposal)`);
      }
      return;
    }

    case "activate_proposal": {
      const proposalId = action.proposalId?.trim();
      if (!proposalId) {
        report.skipped.push("activate_proposal skipped: missing proposalId");
        return;
      }

      const proposal = getProposal(proposalId);
      if (!proposal) {
        report.skipped.push(`activate_proposal skipped: unknown proposal ${proposalId}`);
        return;
      }

      if (proposal.status !== "draft") {
        report.skipped.push(`activate_proposal skipped: proposal ${proposalId} status is ${proposal.status}`);
        return;
      }

      const activated = activateProposal(proposal.id, toClosesAt(action.votingHours));
      report.executed.push(`activate_proposal: ${activated.id} (${action.reason ?? "no reason"})`);
      return;
    }

    default:
      report.skipped.push(`unsupported action: ${JSON.stringify(action)}`);
  }
}

export async function runOpenClawDaoUserStampDriver(
  config: OpenClawFusionConfig = defaultConfig(),
): Promise<OpenClawFusionReport> {
  const startedAt = new Date().toISOString();
  const report: OpenClawFusionReport = {
    startedAt,
    finishedAt: startedAt,
    summary: "",
    actionsRequested: [],
    executed: [],
    skipped: [],
    errors: [],
    raw: "",
  };

  if (!config.enabled) {
    report.summary = "Fusion driver disabled by configuration.";
    report.finishedAt = new Date().toISOString();
    appendJsonLine(CYCLE_LOG_FILE, report);
    return report;
  }

  if (!OPENCLAW.gatewayUrl.trim()) {
    report.summary = "Fusion driver skipped: OPENCLAW_GATEWAY_URL is not configured.";
    report.skipped.push("missing OPENCLAW_GATEWAY_URL");
    report.finishedAt = new Date().toISOString();
    appendJsonLine(CYCLE_LOG_FILE, report);
    return report;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENCLAW.timeoutMs);

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-openclaw-agent-id": OPENCLAW.agents.governance,
      "x-openclaw-agent-role": "governance",
    };
    if (OPENCLAW.bearerToken) {
      headers.Authorization = `Bearer ${OPENCLAW.bearerToken}`;
    }

    const response = await fetch(buildGatewayUrl(), {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: OPENCLAW.model || "openclaw",
        max_tokens: Math.max(300, config.maxTokens),
        temperature: config.temperature,
        messages: [
          { role: "system", content: roleSystemPrompt(config.maxActions) },
          { role: "user", content: JSON.stringify(buildSnapshot()) },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenClaw fusion driver error ${response.status}: ${body}`);
    }

    const parsed = (await response.json()) as OpenAIResponse;
    const raw = extractContent(parsed.choices?.[0]?.message?.content);
    report.raw = raw;

    const normalized = parseFusionOutput(raw, config.maxActions);
    report.summary = normalized.summary;
    report.actionsRequested = normalized.actions;

    for (const action of normalized.actions) {
      try {
        await executeAction(action, report);
      } catch (err) {
        report.errors.push(
          `${action.type}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }
  } catch (err) {
    report.errors.push(err instanceof Error ? err.message : String(err));
    if (!report.summary) {
      report.summary = "Fusion driver execution failed.";
    }
  } finally {
    clearTimeout(timeout);
    report.finishedAt = new Date().toISOString();
    appendJsonLine(CYCLE_LOG_FILE, report);
  }

  return report;
}

export function formatOpenClawFusionReport(report: OpenClawFusionReport): string {
  const durationSec = Math.max(
    0,
    Math.round((new Date(report.finishedAt).getTime() - new Date(report.startedAt).getTime()) / 1000),
  );

  const actionLines = report.actionsRequested.length > 0
    ? report.actionsRequested.map((action) => `- ${action.type}`).join("\n")
    : "- none";

  const executedLines = report.executed.length > 0
    ? report.executed.map((item) => `- ${item}`).join("\n")
    : "- none";

  const skippedLines = report.skipped.length > 0
    ? report.skipped.map((item) => `- ${item}`).join("\n")
    : "- none";

  const errorLines = report.errors.length > 0
    ? `\n\n❌ *Errors*\n${report.errors.map((item) => `- ${item}`).join("\n")}`
    : "";

  return [
    "🧩 *OpenClaw DAO/User/Stamp Fusion*",
    `Duration: ${durationSec}s`,
    `Summary: ${report.summary || "n/a"}`,
    "\nRequested actions:",
    actionLines,
    "\nExecuted:",
    executedLines,
    "\nSkipped:",
    skippedLines,
    errorLines,
  ].join("\n");
}
