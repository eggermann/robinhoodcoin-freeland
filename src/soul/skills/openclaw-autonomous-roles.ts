import fs from "node:fs";
import path from "node:path";
import { listProposals } from "../../dao/governance.js";
import { getActiveCampaigns } from "../../nft/stamp-tiers.js";
import { AUTOCLAW, OPENCLAW } from "../../shared/config.js";
import { getActivePolls, getUpcomingEvents } from "../community.js";
import { getLandSearchManager } from "../land-search.js";
import { getMemberLedgerStats } from "../member-ledger.js";
import { listOpportunities } from "../opportunity-scout.js";
import { getTreasuryBalanceSnapshot } from "./treasury-tracker.js";

const DATA_DIR = "./data/openclaw-autonomy";
const CYCLE_LOG_FILE = path.join(DATA_DIR, "cycles.jsonl");

export type AutonomousRoleName =
  | "soul"
  | "finance"
  | "land-scout"
  | "pr"
  | "moderator"
  | "governance";

export interface OpenClawAutonomyConfig {
  roles: string[];
  maxTokens: number;
  temperature: number;
}

export interface OpenClawRoleReport {
  role: AutonomousRoleName;
  agentId: string;
  startedAt: string;
  finishedAt: string;
  summary: string;
  actions: string[];
  alerts: string[];
  raw: string;
  error?: string;
}

export interface OpenClawAutonomyCycleReport {
  startedAt: string;
  finishedAt: string;
  roles: OpenClawRoleReport[];
}

interface OpenAIMessage {
  content?: string | Array<{ type?: string; text?: string }>;
}

interface OpenAIResponse {
  choices?: Array<{
    message?: OpenAIMessage;
  }>;
}

interface ParsedRoleOutput {
  summary: string;
  actions: string[];
  alerts: string[];
}

const SUPPORTED_ROLES = new Set<AutonomousRoleName>([
  "soul",
  "finance",
  "land-scout",
  "pr",
  "moderator",
  "governance",
]);

function ensureDir(): void {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function appendJsonLine(filePath: string, payload: unknown): void {
  ensureDir();
  fs.appendFileSync(filePath, `${JSON.stringify(payload)}\n`, "utf-8");
}

function toUniqueStrings(values: unknown): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];

  for (const value of values) {
    if (typeof value !== "string") continue;
    const normalized = value.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }

  return out.slice(0, 12);
}

function normalizeRoles(input: string[]): AutonomousRoleName[] {
  const normalized: AutonomousRoleName[] = [];
  for (const role of input) {
    const lowered = role.trim().toLowerCase() as AutonomousRoleName;
    if (!SUPPORTED_ROLES.has(lowered)) continue;
    if (normalized.includes(lowered)) continue;
    normalized.push(lowered);
  }
  return normalized;
}

function roleToAgentId(role: AutonomousRoleName): string {
  switch (role) {
    case "soul":
      return OPENCLAW.agents.soul;
    case "finance":
      return OPENCLAW.agents.finance;
    case "land-scout":
      return OPENCLAW.agents.landScout;
    case "pr":
      return OPENCLAW.agents.pr;
    case "moderator":
      return OPENCLAW.agents.moderator;
    case "governance":
      return OPENCLAW.agents.governance;
    default:
      return OPENCLAW.agents.soul;
  }
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

function parseRoleOutput(raw: string): ParsedRoleOutput {
  const payload = extractJsonPayload(raw);
  try {
    const parsed = JSON.parse(payload) as Record<string, unknown>;
    const summary = typeof parsed.summary === "string"
      ? parsed.summary.trim()
      : "No summary returned.";
    return {
      summary: summary || "No summary returned.",
      actions: toUniqueStrings(parsed.actions),
      alerts: toUniqueStrings(parsed.alerts),
    };
  } catch {
    return {
      summary: raw.trim().slice(0, 700) || "No summary returned.",
      actions: [],
      alerts: [],
    };
  }
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

async function buildRuntimeSnapshot(): Promise<Record<string, unknown>> {
  const proposals = listProposals();
  const treasury = await getTreasuryBalanceSnapshot();
  const shortlist = getLandSearchManager().getShortlist();
  const opportunities = listOpportunities().slice(0, 10);
  const campaigns = getActiveCampaigns().slice(0, 10);
  const polls = getActivePolls().slice(0, 10);
  const events = getUpcomingEvents().slice(0, 10);
  const members = getMemberLedgerStats();

  const proposalStats = proposals.reduce(
    (acc, proposal) => {
      acc[proposal.status] = (acc[proposal.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    timestamp: new Date().toISOString(),
    treasury,
    proposals: {
      total: proposals.length,
      stats: proposalStats,
      latest: proposals.slice(0, 6).map((proposal) => ({
        id: proposal.id,
        title: proposal.title,
        status: proposal.status,
        type: proposal.type,
        votesFor: proposal.votesFor,
        votesAgainst: proposal.votesAgainst,
        closesAt: proposal.closesAt,
      })),
    },
    land: {
      shortlistCount: shortlist.length,
      shortlistTop: shortlist.slice(0, 6).map((listing) => ({
        id: listing.id,
        title: listing.title,
        region: listing.location.region,
        country: listing.location.country,
        sizeAcres: listing.sizeAcres,
        priceUSD: listing.priceUSD,
        score: listing.score ?? 0,
        recommendation: listing.evaluation?.recommendation ?? "unknown",
      })),
    },
    opportunities: opportunities.map((opportunity) => ({
      id: opportunity.id,
      title: opportunity.title,
      type: opportunity.type,
      score: opportunity.score,
      status: opportunity.status,
      valueSOL: opportunity.estimatedValueSOL ?? null,
      deadline: opportunity.deadline ?? null,
    })),
    campaigns: campaigns.map((campaign) => ({
      id: campaign.id,
      name: campaign.name,
      tier: campaign.tier,
      minted: campaign.minted,
      maxSupply: campaign.maxSupply,
      raisedSOL: campaign.raisedSOL,
      goalSOL: campaign.goalSOL,
      active: campaign.active,
    })),
    community: {
      members,
      polls: polls.map((poll) => ({
        id: poll.id,
        question: poll.question,
        closesAt: poll.closesAt,
        closed: poll.closed,
        voters: Object.keys(poll.votes).length,
      })),
      events: events.map((event) => ({
        id: event.id,
        title: event.title,
        date: event.date,
        location: event.location,
        rsvpCount: event.rsvps.length,
      })),
    },
  };
}

function roleSystemPrompt(role: AutonomousRoleName): string {
  return [
    `You are the ${role} role in RobinHoodCoin OpenClaw autonomous runtime.`,
    "This is an autonomous cycle, not a user chat.",
    "Return JSON only with this exact schema:",
    `{"summary":"string","actions":["string"],"alerts":["string"]}`,
    "actions must be concrete next steps for human operators or automated jobs.",
    "alerts must only include urgent or blocking items.",
    "Keep summary concise and factual.",
  ].join("\n");
}

function roleTaskPrompt(role: AutonomousRoleName, snapshot: Record<string, unknown>): string {
  return [
    `Role focus: ${role}.`,
    "Analyze the runtime snapshot and produce your role report.",
    "Prioritize mission alignment, legal/safety constraints, and operational clarity.",
    "Runtime snapshot JSON:",
    JSON.stringify(snapshot),
  ].join("\n");
}

async function runSingleRole(
  role: AutonomousRoleName,
  snapshot: Record<string, unknown>,
  config: OpenClawAutonomyConfig,
): Promise<OpenClawRoleReport> {
  const startedAt = new Date().toISOString();
  const agentId = roleToAgentId(role);
  const url = buildGatewayUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENCLAW.timeoutMs);

  const report: OpenClawRoleReport = {
    role,
    agentId,
    startedAt,
    finishedAt: startedAt,
    summary: "",
    actions: [],
    alerts: [],
    raw: "",
  };

  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "x-openclaw-agent-id": agentId,
      "x-openclaw-agent-role": role,
    };
    if (OPENCLAW.bearerToken) {
      headers.Authorization = `Bearer ${OPENCLAW.bearerToken}`;
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: OPENCLAW.model || "openclaw",
        max_tokens: Math.max(200, config.maxTokens),
        temperature: config.temperature,
        messages: [
          { role: "system", content: roleSystemPrompt(role) },
          { role: "user", content: roleTaskPrompt(role, snapshot) },
        ],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenClaw gateway error ${response.status}: ${body}`);
    }

    const parsed = (await response.json()) as OpenAIResponse;
    const rawText = extractContent(parsed.choices?.[0]?.message?.content);
    const normalized = parseRoleOutput(rawText);

    report.raw = rawText;
    report.summary = normalized.summary;
    report.actions = normalized.actions;
    report.alerts = normalized.alerts;
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
    report.summary = "Role execution failed.";
  } finally {
    clearTimeout(timeout);
    report.finishedAt = new Date().toISOString();
    appendJsonLine(path.join(DATA_DIR, `${role}.jsonl`), report);
  }

  return report;
}

export async function runOpenClawAutonomyCycle(
  config: OpenClawAutonomyConfig = {
    roles: AUTOCLAW.roles,
    maxTokens: AUTOCLAW.maxTokens,
    temperature: AUTOCLAW.temperature,
  },
): Promise<OpenClawAutonomyCycleReport> {
  const startedAt = new Date().toISOString();
  const snapshot = await buildRuntimeSnapshot();
  const roles = normalizeRoles(config.roles);

  const reports: OpenClawRoleReport[] = [];
  for (const role of roles) {
    const report = await runSingleRole(role, snapshot, config);
    reports.push(report);
  }

  const cycle: OpenClawAutonomyCycleReport = {
    startedAt,
    finishedAt: new Date().toISOString(),
    roles: reports,
  };

  appendJsonLine(CYCLE_LOG_FILE, cycle);
  return cycle;
}

export function formatOpenClawAutonomyCycle(
  cycle: OpenClawAutonomyCycleReport,
): string {
  if (cycle.roles.length === 0) {
    return "🤖 *OpenClaw Autonomy*\nNo valid roles configured for this cycle.";
  }

  const roleLines = cycle.roles.map((report) => {
    const alertCount = report.alerts.length;
    const actionCount = report.actions.length;
    const status = report.error ? "❌ error" : alertCount > 0 ? "⚠️ alerts" : "✅ ok";
    return `- *${report.role}* (${status}) | actions: ${actionCount}, alerts: ${alertCount}`;
  });

  const alerts = cycle.roles
    .flatMap((report) => report.alerts.map((alert) => `${report.role}: ${alert}`))
    .slice(0, 6);

  const alertsBlock = alerts.length > 0
    ? `\n\n⚠️ *Top alerts*\n${alerts.map((alert) => `- ${alert}`).join("\n")}`
    : "";

  return [
    "🤖 *OpenClaw Autonomy Cycle*",
    ...roleLines,
    alertsBlock,
  ].join("\n");
}
