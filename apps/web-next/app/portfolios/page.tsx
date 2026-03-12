import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { db } from "../../lib/db";
import { countryLabel, formatParcelFacts, getParcelDisplayImage, isEuropeanCountry, isLaneLead } from "../../lib/parcels";

export const dynamic = "force-dynamic";

interface RuntimeSnapshot {
  timeoutMs: number;
  maxConcurrent: number;
  subagentMaxConcurrent: number;
  gatewayTimeouts: number;
  laneWaitWarnings: number;
  wafOrFetchBlocks: number;
  browserDnsErrors: number;
  urlProbeEvents24h: number;
  askFailureEvents24h: number;
  logFiles: string[];
  landScoutLastStatus: "ok" | "failed" | "never";
  landScoutLastFinishedAt: string | null;
  landScoutLastReceived: number;
  landScoutLastAdded: number;
  landScoutLastShortlisted: number;
  landScoutFailures24h: number;
  landScoutAdded24h: number;
  trackedListings: number;
  trackedShortlist: number;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function compactFileLabel(filePath: string): string {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length < 2) return filePath;
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

async function readTailLines(filePath: string, maxBytes = 120_000, maxLines = 2500): Promise<string[]> {
  try {
    const handle = await fs.open(filePath, "r");
    try {
      const stat = await handle.stat();
      const start = Math.max(0, stat.size - maxBytes);
      const length = stat.size - start;
      if (length <= 0) return [];
      const buffer = Buffer.alloc(length);
      await handle.read(buffer, 0, length, start);
      return buffer
        .toString("utf8")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(-maxLines);
    } finally {
      await handle.close();
    }
  } catch {
    return [];
  }
}

async function countJsonlEvents24h(pathsToTry: string[]): Promise<number> {
  const sinceMs = Date.now() - 24 * 60 * 60 * 1000;
  let total = 0;

  for (const filePath of pathsToTry) {
    const lines = await readTailLines(filePath, 100_000, 1200);
    if (lines.length === 0) continue;

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line) as { timestamp?: string };
        if (!parsed.timestamp) continue;
        const ts = Date.parse(parsed.timestamp);
        if (Number.isFinite(ts) && ts >= sinceMs) total += 1;
      } catch {
        continue;
      }
    }
  }

  return total;
}

async function loadRuntimeSnapshot(): Promise<RuntimeSnapshot> {
  const timeoutMs = parsePositiveInt(process.env.OPENCLAW_TIMEOUT_MS, 240_000);
  const maxConcurrent = parsePositiveInt(process.env.OPENCLAW_MAX_CONCURRENT, 1);
  const subagentMaxConcurrent = parsePositiveInt(process.env.OPENCLAW_SUBAGENTS_MAX_CONCURRENT, 1);

  const home = process.env.HOME ?? "";
  const cwd = process.cwd();
  const rootGuess = path.resolve(cwd, "..", "..");

  const logCandidates = [
    process.env.OPENCLAW_GATEWAY_LOG,
    process.env.ROBINHOODCOIN_BOT_ERR_LOG,
    home ? path.join(home, "logs", "openclaw-gateway.err.log") : "",
    home ? path.join(home, "logs", "robinhoodcoin", "bot.err.log") : "",
    "/home/pi/logs/openclaw-gateway.err.log",
  ].filter(Boolean) as string[];

  const logFiles: string[] = [];
  const mergedTailLines: string[] = [];
  for (const filePath of new Set(logCandidates)) {
    const lines = await readTailLines(filePath, 140_000, 2000);
    if (lines.length === 0) continue;
    logFiles.push(compactFileLabel(filePath));
    mergedTailLines.push(...lines);
  }

  const joinedLog = mergedTailLines.join("\n");
  const gatewayTimeouts =
    (joinedLog.match(/Request timed out before a response was generated|Gateway timeout while processing/gi) ?? []).length;
  const laneWaitWarnings = (joinedLog.match(/lane wait exceeded/gi) ?? []).length;
  const wafOrFetchBlocks =
    (joinedLog.match(/Access Denied|web_fetch failed|Cloudflare|Just a moment|browser failed/gi) ?? []).length;
  const browserDnsErrors = (joinedLog.match(/EAI_AGAIN|getaddrinfo/gi) ?? []).length;

  const urlProbeCandidates = [
    process.env.URL_PROBE_LOG_FILE,
    path.join(cwd, "data", "bot", "url-probes.jsonl"),
    path.join(rootGuess, "data", "bot", "url-probes.jsonl"),
    home ? path.join(home, "robinhoodcoin-freeland", "data", "bot", "url-probes.jsonl") : "",
  ].filter(Boolean) as string[];

  const askFailureCandidates = [
    process.env.ASK_FAILURE_LOG_FILE,
    path.join(cwd, "data", "bot", "ask-failures.jsonl"),
    path.join(rootGuess, "data", "bot", "ask-failures.jsonl"),
    home ? path.join(home, "robinhoodcoin-freeland", "data", "bot", "ask-failures.jsonl") : "",
  ].filter(Boolean) as string[];

  const [urlProbeEvents24h, askFailureEvents24h] = await Promise.all([
    countJsonlEvents24h(urlProbeCandidates),
    countJsonlEvents24h(askFailureCandidates),
  ]);

  const scoutLogCandidates = [
    path.join(cwd, "data", "land-search", "autonomous-scout-log.jsonl"),
    path.join(rootGuess, "data", "land-search", "autonomous-scout-log.jsonl"),
    home ? path.join(home, "robinhoodcoin-freeland", "data", "land-search", "autonomous-scout-log.jsonl") : "",
  ].filter(Boolean) as string[];

  const listingCandidates = [
    path.join(cwd, "data", "land-search", "listings.json"),
    path.join(rootGuess, "data", "land-search", "listings.json"),
    home ? path.join(home, "robinhoodcoin-freeland", "data", "land-search", "listings.json") : "",
  ].filter(Boolean) as string[];

  const shortlistCandidates = [
    path.join(cwd, "data", "land-search", "shortlist.json"),
    path.join(rootGuess, "data", "land-search", "shortlist.json"),
    home ? path.join(home, "robinhoodcoin-freeland", "data", "land-search", "shortlist.json") : "",
  ].filter(Boolean) as string[];

  const scoutLines = await readFirstExistingLines(scoutLogCandidates);
  const scoutSinceMs = Date.now() - 24 * 60 * 60 * 1000;
  let landScoutLastStatus: RuntimeSnapshot["landScoutLastStatus"] = "never";
  let landScoutLastFinishedAt: string | null = null;
  let landScoutLastReceived = 0;
  let landScoutLastAdded = 0;
  let landScoutLastShortlisted = 0;
  let landScoutFailures24h = 0;
  let landScoutAdded24h = 0;

  for (const line of scoutLines) {
    try {
      const parsed = JSON.parse(line) as {
        finishedAt?: string;
        added?: number;
        shortlisted?: number;
        received?: number;
        error?: string;
      };
      const finishedAtMs = parsed.finishedAt ? Date.parse(parsed.finishedAt) : NaN;
      if (Number.isFinite(finishedAtMs) && finishedAtMs >= scoutSinceMs) {
        landScoutAdded24h += parsed.added ?? 0;
        if (parsed.error) landScoutFailures24h += 1;
      }
    } catch {
      continue;
    }
  }

  for (let i = scoutLines.length - 1; i >= 0; i -= 1) {
    try {
      const parsed = JSON.parse(scoutLines[i]) as {
        finishedAt?: string;
        received?: number;
        added?: number;
        shortlisted?: number;
        error?: string;
      };
      landScoutLastStatus = parsed.error ? "failed" : "ok";
      landScoutLastFinishedAt = parsed.finishedAt ?? null;
      landScoutLastReceived = parsed.received ?? 0;
      landScoutLastAdded = parsed.added ?? 0;
      landScoutLastShortlisted = parsed.shortlisted ?? 0;
      break;
    } catch {
      continue;
    }
  }

  const trackedListings = await readFirstExistingJsonCount(listingCandidates);
  const trackedShortlist = await readFirstExistingJsonCount(shortlistCandidates);

  return {
    timeoutMs,
    maxConcurrent,
    subagentMaxConcurrent,
    gatewayTimeouts,
    laneWaitWarnings,
    wafOrFetchBlocks,
    browserDnsErrors,
    urlProbeEvents24h,
    askFailureEvents24h,
    logFiles,
    landScoutLastStatus,
    landScoutLastFinishedAt,
    landScoutLastReceived,
    landScoutLastAdded,
    landScoutLastShortlisted,
    landScoutFailures24h,
    landScoutAdded24h,
    trackedListings,
    trackedShortlist,
  };
}

async function readFirstExistingLines(pathsToTry: string[]): Promise<string[]> {
  for (const filePath of pathsToTry) {
    const lines = await readTailLines(filePath, 120_000, 800);
    if (lines.length > 0) return lines;
  }
  return [];
}

async function readFirstExistingJsonCount(pathsToTry: string[]): Promise<number> {
  for (const filePath of pathsToTry) {
    try {
      const raw = JSON.parse(await fs.readFile(filePath, "utf8")) as unknown;
      if (Array.isArray(raw)) return raw.length;
    } catch {
      continue;
    }
  }
  return 0;
}

export default async function PortfoliosPage() {
  let parcels: Awaited<ReturnType<typeof db.parcel.findMany>> = [];
  const runtime = await loadRuntimeSnapshot();

  try {
    parcels = await db.parcel.findMany({
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: 50,
    });
  } catch {
    parcels = [];
  }

  const verifiedParcels = parcels.filter((parcel) => !isLaneLead(parcel));
  const scoutLanes = parcels.filter(isLaneLead);
  const germanParcels = parcels.filter((parcel) => (parcel.country ?? "").toUpperCase() === "DE");
  const europeanParcels = parcels.filter((parcel) => isEuropeanCountry(parcel.country));
  const outsideEuropeParcels = parcels.filter((parcel) => !isEuropeanCountry(parcel.country));

  return (
    <section>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
        <p style={{ color: "#fbbf24", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 12 }}>🏹 Portfolios</p>
        <nav style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 14 }}>
          <Link href="/" style={{ color: "#9ca3af", textDecoration: "none" }}>Home</Link>
          <Link href="/movement" style={{ color: "#9ca3af", textDecoration: "none" }}>Movement</Link>
          <Link href="/land" style={{ color: "#9ca3af", textDecoration: "none" }}>Land Objects</Link>
          <Link href="/voting" style={{ color: "#9ca3af", textDecoration: "none" }}>Votings</Link>
          <Link href="/soul" style={{ color: "#9ca3af", textDecoration: "none" }}>Soul Console</Link>
        </nav>
      </div>
      <h1 style={{ marginTop: 0 }}>Live Parcels from DB</h1>
      <section
        style={{
          margin: "0 0 16px",
          padding: 14,
          borderRadius: 12,
          border: "1px solid #334155",
          background: "linear-gradient(180deg, #0f172a, #111827)",
        }}
      >
        <p style={{ margin: "0 0 8px", color: "#fbbf24", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 11 }}>
          Runtime Mirror
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
          <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Land scout last run</div>
            <strong>
              {runtime.landScoutLastStatus === "never"
                ? "No runs recorded"
                : runtime.landScoutLastStatus === "ok"
                  ? "OK"
                  : "Failed"}
            </strong>
          </div>
          <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Land scout additions (24h)</div>
            <strong>{runtime.landScoutAdded24h}</strong>
          </div>
          <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Land scout failures (24h)</div>
            <strong>{runtime.landScoutFailures24h}</strong>
          </div>
          <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Tracked shortlist / listings</div>
            <strong>{runtime.trackedShortlist} / {runtime.trackedListings}</strong>
          </div>
          <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Ask timeout</div>
            <strong>{Math.round(runtime.timeoutMs / 1000)}s</strong>
          </div>
          <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Concurrency</div>
            <strong>{runtime.maxConcurrent} main / {runtime.subagentMaxConcurrent} sub</strong>
          </div>
          <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Gateway timeouts (tail)</div>
            <strong>{runtime.gatewayTimeouts}</strong>
          </div>
          <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Lane wait warnings (tail)</div>
            <strong>{runtime.laneWaitWarnings}</strong>
          </div>
          <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>WAF / fetch blocks (tail)</div>
            <strong>{runtime.wafOrFetchBlocks}</strong>
          </div>
          <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Browser DNS errors (tail)</div>
            <strong>{runtime.browserDnsErrors}</strong>
          </div>
          <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>URL probes (24h)</div>
            <strong>{runtime.urlProbeEvents24h}</strong>
          </div>
          <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Ask failures (24h)</div>
            <strong>{runtime.askFailureEvents24h}</strong>
          </div>
        </div>
        <p style={{ margin: "10px 0 0", color: "#94a3b8", fontSize: 12 }}>
          Sources: {runtime.logFiles.length > 0 ? runtime.logFiles.join(", ") : "no readable log files on this host"}
        </p>
        <p style={{ margin: "6px 0 0", color: "#94a3b8", fontSize: 12 }}>
          Land scout last finish: {runtime.landScoutLastFinishedAt ?? "never"} • received {runtime.landScoutLastReceived} • added {runtime.landScoutLastAdded} • shortlisted {runtime.landScoutLastShortlisted}
        </p>
      </section>
      <section
        style={{
          margin: "0 0 20px",
          padding: 14,
          borderRadius: 12,
          border: "1px solid #334155",
          background: "linear-gradient(180deg, #101725, #0b1220)",
        }}
      >
        <p style={{ margin: "0 0 8px", color: "#34d399", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 11 }}>
          Regional Boards
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10, marginBottom: 14 }}>
          <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Germany</div>
            <strong>{germanParcels.length}</strong>
          </div>
          <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Europe</div>
            <strong>{europeanParcels.length}</strong>
          </div>
          <div style={{ background: "#0b1220", border: "1px solid #1f2937", borderRadius: 10, padding: 10 }}>
            <div style={{ color: "#94a3b8", fontSize: 12 }}>Outside Europe</div>
            <strong>{outsideEuropeParcels.length}</strong>
          </div>
        </div>
        <div style={{ display: "grid", gap: 18 }}>
          <RegionSection
            title="Germany"
            body="Dedicated German parcel and lane watch. Use this board when you want Germany visible as its own stream."
            parcels={germanParcels}
          />
          <RegionSection
            title="Europe"
            body="European parcel and lane stream, including Germany, Portugal, Spain, Switzerland, and future EU-adjacent additions."
            parcels={europeanParcels}
          />
        </div>
      </section>
      <h2 style={{ margin: "0 0 10px" }}>Verified Parcels</h2>
      <p style={{ margin: "0 0 12px", color: "#94a3b8" }}>
        Parcel-level listings with confirmed size and price. These are the cards suitable for side-by-side comparison.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {verifiedParcels.map((parcel) => (
          <article key={parcel.id} style={{ background: "#14211b", border: "1px solid #334155", borderRadius: 12, overflow: "hidden" }}>
            <img src={getParcelDisplayImage(parcel)} alt={parcel.title} style={{ width: "100%", height: 160, objectFit: "cover" }} loading="lazy" />
            <div style={{ padding: 12 }}>
              <h3 style={{ margin: "0 0 6px" }}>{parcel.title}</h3>
              <p style={{ margin: 0 }}>{parcel.location}</p>
              <p style={{ margin: "6px 0 0" }}>{formatParcelFacts(parcel)}</p>
              <p style={{ margin: "6px 0 10px" }}>Score: {parcel.score ?? "?"}</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link href={`/portfolios/${parcel.id}`} style={{ color: "#fbbf24" }}>Open details →</Link>
                {parcel.sourceUrl ? <a href={parcel.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "#34d399" }}>Source ↗</a> : null}
              </div>
            </div>
          </article>
        ))}
      </div>
      {verifiedParcels.length === 0 ? <p>No verified parcel rows are available in Prisma right now.</p> : null}

      <h2 style={{ margin: "22px 0 10px" }}>Scout Lanes</h2>
      <p style={{ margin: "0 0 12px", color: "#94a3b8" }}>
        Lane-level market intelligence from the EU scout. These are source channels, not parcel-complete records, so exact size and price stay pending until a parcel pass is done.
      </p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 14 }}>
        {scoutLanes.map((parcel) => (
          <article key={parcel.id} style={{ background: "#111827", border: "1px solid #334155", borderRadius: 12, padding: 12 }}>
            <div style={{ display: "inline-flex", marginBottom: 8, padding: "4px 8px", borderRadius: 999, background: "#173425", color: "#86efac", fontSize: 12, fontWeight: 700 }}>
              Lane lead
            </div>
            <h3 style={{ margin: "0 0 6px" }}>{parcel.title}</h3>
            <p style={{ margin: 0 }}>{parcel.location}</p>
            <p style={{ margin: "6px 0 0", color: "#94a3b8" }}>Exact parcel metrics pending manual/browser extraction.</p>
            <p style={{ margin: "6px 0 10px" }}>Score: {parcel.score ?? "?"}</p>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Link href={`/portfolios/${parcel.id}`} style={{ color: "#fbbf24" }}>Open details →</Link>
              {parcel.sourceUrl ? <a href={parcel.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "#34d399" }}>Source ↗</a> : null}
            </div>
          </article>
        ))}
      </div>
      {scoutLanes.length === 0 ? <p style={{ color: "#94a3b8" }}>No lane-level leads in Prisma right now.</p> : null}
    </section>
  );
}

function RegionSection({
  title,
  body,
  parcels,
}: {
  title: string;
  body: string;
  parcels: Array<{
    id: string;
    title: string;
    location: string;
    country: string | null;
    sourceUrl: string | null;
    sizeAcres: number | null;
    priceUsd: number | null;
    score: number | null;
    teaserImage: string | null;
    status: string;
  }>;
}) {
  return (
    <section>
      <h2 style={{ margin: "0 0 6px" }}>{title}</h2>
      <p style={{ margin: "0 0 12px", color: "#94a3b8" }}>{body}</p>
      {parcels.length === 0 ? (
        <p style={{ margin: 0, color: "#94a3b8" }}>No current parcel or lane records match this board.</p>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          {parcels.map((parcel) => {
            const laneLead = isLaneLead(parcel);
            return (
              <article key={parcel.id} style={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 12, overflow: "hidden" }}>
                <img src={getParcelDisplayImage(parcel)} alt={parcel.title} style={{ width: "100%", height: 140, objectFit: "cover" }} loading="lazy" />
                <div style={{ padding: 12 }}>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                    <span style={{ display: "inline-flex", padding: "4px 8px", borderRadius: 999, background: laneLead ? "#173425" : "#1f2937", color: laneLead ? "#86efac" : "#fcd34d", fontSize: 12, fontWeight: 700 }}>
                      {laneLead ? "Lane" : "Verified"}
                    </span>
                    <span style={{ display: "inline-flex", padding: "4px 8px", borderRadius: 999, background: "#172033", color: "#93c5fd", fontSize: 12, fontWeight: 700 }}>
                      {countryLabel(parcel.country)}
                    </span>
                  </div>
                  <h3 style={{ margin: "0 0 6px" }}>{parcel.title}</h3>
                  <p style={{ margin: 0 }}>{parcel.location}</p>
                  <p style={{ margin: "6px 0 10px", color: "#94a3b8" }}>{formatParcelFacts(parcel)} • Score {parcel.score ?? "?"}</p>
                  <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                    <Link href={`/portfolios/${parcel.id}`} style={{ color: "#fbbf24" }}>Open details →</Link>
                    {parcel.sourceUrl ? <a href={parcel.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "#34d399" }}>Source ↗</a> : null}
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
