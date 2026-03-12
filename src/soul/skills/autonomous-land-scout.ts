import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { OPENCLAW } from "../../shared/config.js";
import { getLandSearchManager, type LandListing } from "../land-search.js";

const REPORT_LOG_FILE = "./data/land-search/autonomous-scout-log.jsonl";
const BLOCKED_SOURCES_FILE = "./data/land-search/blocked-sources.json";
const BLOCKED_SOURCE_COOLDOWN_MS = Number(
  process.env.LAND_SCOUT_BLOCKED_SOURCE_COOLDOWN_MS ?? `${12 * 60 * 60 * 1000}`,
);
const DEFAULT_AVOID_SOURCE_HOSTS = (process.env.LAND_SCOUT_AVOID_SOURCE_HOSTS
  ?? "landwatch.com,land.com,landsearch.com,landandfarm.com,propiedades.com")
  .split(",")
  .map((item) => item.trim().toLowerCase())
  .filter(Boolean);

export interface AutonomousLandScoutConfig {
  maxCandidatesPerRun: number;
  shortlistMinScore: number;
  verifySourceReachability: boolean;
  sourceTimeoutMs: number;
  regionHint?: string;
}

export interface SourceVerificationResult {
  checked: boolean;
  reachable: boolean;
  statusCode?: number;
  error?: string;
  blocked?: boolean;
  host?: string;
}

export interface ScoutCandidateInput {
  title: string;
  country: string;
  region: string;
  city?: string;
  sizeAcres: number;
  priceUSD: number;
  zoning: string;
  description: string;
  features: string[];
  sourceUrl: string;
}

export interface CandidateEvaluation {
  candidate: ScoutCandidateInput;
  accepted: boolean;
  reason: string;
  verification: SourceVerificationResult;
  listingId?: string;
  score?: number;
  shortlisted?: boolean;
}

export interface AutonomousLandScoutReport {
  startedAt: string;
  finishedAt: string;
  configured: boolean;
  routedAgentId: string;
  requested: number;
  received: number;
  added: number;
  shortlisted: number;
  rejected: number;
  checks: CandidateEvaluation[];
  error?: string;
}

interface BlockedSourceRecord {
  host: string;
  sampleUrl: string;
  reason: string;
  statusCode?: number;
  blockedAt: string;
  cooldownUntil: string;
  hits: number;
}

interface OpenAIMessage {
  role: "system" | "user" | "assistant";
  content?: string | Array<{ type?: string; text?: string }>;
}

interface OpenAIResponse {
  choices?: Array<{
    message?: OpenAIMessage;
  }>;
}

function toSafeNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim().length > 0) {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 16);
}

function extractText(content: OpenAIMessage["content"]): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((part): part is { type?: string; text?: string } => typeof part === "object")
    .map((part) => part.text ?? "")
    .join("\n")
    .trim();
}

function extractJsonPayload(raw: string): string {
  const fenced = raw.match(/```json\s*([\s\S]*?)```/i)
    ?? raw.match(/```\s*([\s\S]*?)```/);
  if (fenced?.[1]) return fenced[1].trim();

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return raw.slice(start, end + 1);
  }

  return raw.trim();
}

function normalizeSourceUrl(url: string): string {
  try {
    const parsed = new URL(url);
    parsed.hash = "";
    parsed.search = "";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return url.trim().replace(/\/+$/, "");
  }
}

function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return url.trim().toLowerCase();
  }
}

function loadBlockedSourceRecords(now = new Date()): Map<string, BlockedSourceRecord> {
  try {
    if (!fs.existsSync(BLOCKED_SOURCES_FILE)) return new Map();
    const raw = JSON.parse(fs.readFileSync(BLOCKED_SOURCES_FILE, "utf-8")) as unknown;
    if (!Array.isArray(raw)) return new Map();

    const active = raw
      .filter((item): item is BlockedSourceRecord => {
        if (typeof item !== "object" || item === null) return false;
        const record = item as Partial<BlockedSourceRecord>;
        return typeof record.host === "string"
          && typeof record.cooldownUntil === "string"
          && Date.parse(record.cooldownUntil) > now.getTime();
      })
      .map((record) => [record.host, record] as const);

    return new Map(active);
  } catch {
    return new Map();
  }
}

function saveBlockedSourceRecords(records: Map<string, BlockedSourceRecord>): void {
  fs.mkdirSync(path.dirname(BLOCKED_SOURCES_FILE), { recursive: true });
  fs.writeFileSync(
    BLOCKED_SOURCES_FILE,
    JSON.stringify(
      [...records.values()].sort((a, b) => a.host.localeCompare(b.host)),
      null,
      2,
    ),
    "utf-8",
  );
}

function rememberBlockedSource(
  records: Map<string, BlockedSourceRecord>,
  url: string,
  reason: string,
  statusCode?: number,
  now = new Date(),
): void {
  const host = sourceHost(url);
  const existing = records.get(host);
  const blockedAt = now.toISOString();
  const cooldownUntil = new Date(now.getTime() + BLOCKED_SOURCE_COOLDOWN_MS).toISOString();

  records.set(host, {
    host,
    sampleUrl: url,
    reason,
    statusCode,
    blockedAt,
    cooldownUntil,
    hits: (existing?.hits ?? 0) + 1,
  });
}

function activeBlockedHosts(): string[] {
  return [...loadBlockedSourceRecords().keys()].sort();
}

function buildListingFingerprint(candidate: ScoutCandidateInput): string {
  const material = [
    candidate.title.toLowerCase(),
    candidate.country.toLowerCase(),
    candidate.region.toLowerCase(),
    String(Math.round(candidate.sizeAcres * 100) / 100),
    normalizeSourceUrl(candidate.sourceUrl).toLowerCase(),
  ].join("|");

  return createHash("sha1").update(material).digest("hex");
}

function candidateFromUnknown(raw: unknown): ScoutCandidateInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const source = raw as Record<string, unknown>;

  const title = typeof source.title === "string" ? source.title.trim() : "";
  const sizeAcres = toSafeNumber(source.sizeAcres);
  const priceUSD = toSafeNumber(source.priceUSD);
  const zoning = typeof source.zoning === "string" ? source.zoning.trim() : "";
  const description = typeof source.description === "string" ? source.description.trim() : "";
  const sourceUrl = typeof source.sourceUrl === "string" ? source.sourceUrl.trim() : "";
  const features = toStringArray(source.features);

  let country = "";
  let region = "";
  let city = "";
  if (typeof source.location === "object" && source.location !== null) {
    const location = source.location as Record<string, unknown>;
    country = typeof location.country === "string" ? location.country.trim() : "";
    region = typeof location.region === "string" ? location.region.trim() : "";
    city = typeof location.city === "string" ? location.city.trim() : "";
  } else {
    country = typeof source.country === "string" ? source.country.trim() : "";
    region = typeof source.region === "string" ? source.region.trim() : "";
    city = typeof source.city === "string" ? source.city.trim() : "";
  }

  if (!title || !zoning || !description || !sourceUrl) return null;
  if (!country || !region) return null;
  if ((sizeAcres ?? 0) <= 0 || (priceUSD ?? 0) <= 0) return null;

  try {
    const url = new URL(sourceUrl);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  } catch {
    return null;
  }

  return {
    title,
    country,
    region,
    city: city || undefined,
    sizeAcres: sizeAcres ?? 0,
    priceUSD: priceUSD ?? 0,
    zoning,
    description,
    features,
    sourceUrl,
  };
}

function parseScoutCandidates(rawModelResponse: string): ScoutCandidateInput[] {
  const payload = extractJsonPayload(rawModelResponse);
  let parsed: unknown;

  try {
    parsed = JSON.parse(payload);
  } catch {
    return [];
  }

  if (typeof parsed !== "object" || parsed === null) return [];
  const obj = parsed as Record<string, unknown>;
  const listRaw = Array.isArray(obj.candidates) ? obj.candidates : [];

  const candidates: ScoutCandidateInput[] = [];
  for (const item of listRaw) {
    const candidate = candidateFromUnknown(item);
    if (candidate) candidates.push(candidate);
  }
  return candidates;
}

async function verifySourceReachability(
  url: string,
  timeoutMs: number,
): Promise<SourceVerificationResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  const host = sourceHost(url);
  try {
    let response = await fetch(url, {
      method: "HEAD",
      redirect: "follow",
      signal: controller.signal,
    });

    if (response.status === 405 || response.status === 501) {
      response = await fetch(url, {
        method: "GET",
        redirect: "follow",
        signal: controller.signal,
      });
    }

    const blocked = response.status === 403 || response.status === 429;
    const reachable = response.status < 400 || response.status === 401;
    return {
      checked: true,
      reachable,
      blocked,
      host,
      statusCode: response.status,
      error: blocked
        ? `blocked (${response.status})`
        : reachable
          ? undefined
          : `HTTP ${response.status}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      checked: true,
      reachable: false,
      blocked: false,
      host,
      error: message,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function buildSystemPrompt(): string {
  return [
    "You are Little John, the land-scout AI for RobinHoodCoin Freeland.",
    "Return JSON only, no prose, no markdown.",
    "You must output this schema exactly:",
    `{"candidates":[{"title":"...","location":{"country":"...","region":"...","city":"..."},"sizeAcres":1.2,"priceUSD":12000,"zoning":"agricultural","description":"...","features":["road access"],"sourceUrl":"https://..."}]}`,
    "Focus on affordable properties that can become community-managed commons.",
  ].join("\n");
}

function buildScoutPrompt(config: AutonomousLandScoutConfig): string {
  const manager = getLandSearchManager();
  const criteria = manager.getCriteria();
  const budgetUsd = Math.round(criteria.maxPriceSOL * 100);
  const blockedHosts = [...new Set([...DEFAULT_AVOID_SOURCE_HOSTS, ...activeBlockedHosts()])];

  return [
    "Find real-world land listings and return candidates JSON only.",
    `Max candidates: ${config.maxCandidatesPerRun}.`,
    `Region hint: ${config.regionHint?.trim() || criteria.regions.join(", ")}.`,
    `Budget up to ${budgetUsd} USD (~${criteria.maxPriceSOL} SOL).`,
    `Size between ${criteria.minSizeAcres} and ${criteria.maxSizeAcres ?? "any"} acres.`,
    `Preferred zoning: ${criteria.zoningTypes.join(", ")}.`,
    "Only include listings with concrete source URLs.",
    "If a site shows access denied, verification required, Cloudflare, or 'just a moment', treat it as blocked and do not retry that domain in this run.",
    blockedHosts.length > 0
      ? `Avoid these temporarily blocked domains on this machine: ${blockedHosts.join(", ")}.`
      : "Prefer sources that work without browser challenge pages.",
  ].join("\n");
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

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "x-openclaw-agent-id": OPENCLAW.agents.landScout,
    "x-openclaw-agent-role": "land-scout",
  };

  if (OPENCLAW.bearerToken) {
    headers.Authorization = `Bearer ${OPENCLAW.bearerToken}`;
  }

  return headers;
}

async function callLandScoutAgent(
  config: AutonomousLandScoutConfig,
): Promise<string> {
  const url = buildGatewayUrl();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), OPENCLAW.timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: buildHeaders(),
      body: JSON.stringify({
        model: OPENCLAW.model || "openclaw",
        max_tokens: 2000,
        temperature: 0.2,
        messages: [
          { role: "system", content: buildSystemPrompt() },
          { role: "user", content: buildScoutPrompt(config) },
        ],
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`OpenClaw land-scout gateway error ${res.status}: ${body}`);
    }

    const data = (await res.json()) as OpenAIResponse;
    const content = data.choices?.[0]?.message?.content;
    const text = extractText(content);
    if (!text) {
      throw new Error("OpenClaw land-scout returned empty content.");
    }
    return text;
  } finally {
    clearTimeout(timeout);
  }
}

function appendReport(report: AutonomousLandScoutReport): void {
  fs.mkdirSync(path.dirname(REPORT_LOG_FILE), { recursive: true });
  fs.appendFileSync(REPORT_LOG_FILE, `${JSON.stringify(report)}\n`, "utf-8");
}

export async function runAutonomousLandScoutCycle(
  config: AutonomousLandScoutConfig,
): Promise<AutonomousLandScoutReport> {
  const startedAt = new Date().toISOString();
  const report: AutonomousLandScoutReport = {
    startedAt,
    finishedAt: startedAt,
    configured: Boolean(OPENCLAW.gatewayUrl),
    routedAgentId: OPENCLAW.agents.landScout,
    requested: Math.max(1, config.maxCandidatesPerRun),
    received: 0,
    added: 0,
    shortlisted: 0,
    rejected: 0,
    checks: [],
  };

  if (!OPENCLAW.gatewayUrl.trim()) {
    report.error = "OPENCLAW_GATEWAY_URL is not configured.";
    report.finishedAt = new Date().toISOString();
    appendReport(report);
    return report;
  }

  try {
    const raw = await callLandScoutAgent(config);
    const candidates = parseScoutCandidates(raw).slice(0, report.requested);
    report.received = candidates.length;

    const manager = getLandSearchManager();
    const existing = manager.getListings();
    const existingBySource = new Set(existing.map((listing) => normalizeSourceUrl(listing.sourceUrl)));
    const existingFingerprints = new Set(existing.map((listing) => listingFingerprint(listing)));
    const runFingerprints = new Set<string>();
    const blockedSources = loadBlockedSourceRecords();

    for (const candidate of candidates) {
      const candidateHost = sourceHost(candidate.sourceUrl);
      const blockedRecord = blockedSources.get(candidateHost);
      if (blockedRecord) {
        report.rejected += 1;
        report.checks.push({
          candidate,
          accepted: false,
          reason: `source blocked cooldown active until ${blockedRecord.cooldownUntil}`,
          verification: {
            checked: true,
            reachable: false,
            blocked: true,
            host: candidateHost,
            statusCode: blockedRecord.statusCode,
            error: blockedRecord.reason,
          },
        });
        continue;
      }

      const verification = config.verifySourceReachability
        ? await verifySourceReachability(candidate.sourceUrl, config.sourceTimeoutMs)
        : { checked: false, reachable: true };

      if (!verification.reachable) {
        if (verification.blocked) {
          rememberBlockedSource(
            blockedSources,
            candidate.sourceUrl,
            verification.error ?? "blocked",
            verification.statusCode,
          );
          saveBlockedSourceRecords(blockedSources);
        }
        report.rejected += 1;
        report.checks.push({
          candidate,
          accepted: false,
          reason: verification.blocked
            ? `source blocked${verification.statusCode ? ` (${verification.statusCode})` : ""}`
            : `source verification failed${verification.statusCode ? ` (${verification.statusCode})` : ""}`,
          verification,
        });
        continue;
      }

      const normalizedSource = normalizeSourceUrl(candidate.sourceUrl);
      const fingerprint = buildListingFingerprint(candidate);
      if (existingBySource.has(normalizedSource) || existingFingerprints.has(fingerprint) || runFingerprints.has(fingerprint)) {
        report.rejected += 1;
        report.checks.push({
          candidate,
          accepted: false,
          reason: "duplicate listing",
          verification,
        });
        continue;
      }

      const listing = manager.addListing({
        title: candidate.title,
        location: {
          country: candidate.country,
          region: candidate.region,
          city: candidate.city,
        },
        sizeAcres: candidate.sizeAcres,
        priceUSD: candidate.priceUSD,
        priceSol: candidate.priceUSD / 100,
        zoning: candidate.zoning,
        description: candidate.description,
        features: candidate.features,
        sourceUrl: candidate.sourceUrl,
      });

      report.added += 1;
      runFingerprints.add(fingerprint);
      existingBySource.add(normalizedSource);
      existingFingerprints.add(fingerprint);

      const score = listing.score ?? 0;
      const shouldShortlist = score >= config.shortlistMinScore;
      if (shouldShortlist) {
        manager.addToShortlist(listing.id);
        report.shortlisted += 1;
      }

      report.checks.push({
        candidate,
        accepted: true,
        reason: shouldShortlist
          ? `added and shortlisted (score ${score})`
          : `added only (score ${score})`,
        verification,
        listingId: listing.id,
        score,
        shortlisted: shouldShortlist,
      });
    }
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
  } finally {
    report.finishedAt = new Date().toISOString();
    appendReport(report);
  }

  return report;
}

function listingFingerprint(listing: LandListing): string {
  const normalized = {
    title: listing.title,
    country: listing.location.country,
    region: listing.location.region,
    sizeAcres: listing.sizeAcres,
    sourceUrl: listing.sourceUrl,
  };

  return buildListingFingerprint({
    title: normalized.title,
    country: normalized.country,
    region: normalized.region,
    sizeAcres: normalized.sizeAcres,
    priceUSD: listing.priceUSD,
    zoning: listing.zoning,
    description: listing.description,
    features: listing.features,
    sourceUrl: normalized.sourceUrl,
    city: listing.location.city,
  });
}

export function formatScoutReport(report: AutonomousLandScoutReport): string {
  const durationMs = new Date(report.finishedAt).getTime() - new Date(report.startedAt).getTime();
  const durationSec = Math.max(0, Math.round(durationMs / 1000));
  const status = report.error ? "FAILED" : "OK";

  return `🧭 *Land Scout Cycle (${status})*
Agent: \`${report.routedAgentId}\`
Requested: ${report.requested}
Received: ${report.received}
Added: ${report.added}
Shortlisted: ${report.shortlisted}
Rejected: ${report.rejected}
Duration: ${durationSec}s${
    report.error ? `\nError: ${report.error}` : ""
  }`;
}
