import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";
import { db } from "../../lib/db";

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
  };
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
      </section>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14 }}>
        {parcels.map((parcel) => (
          <article key={parcel.id} style={{ background: "#14211b", border: "1px solid #334155", borderRadius: 12, overflow: "hidden" }}>
            {parcel.teaserImage ? <img src={parcel.teaserImage} alt={parcel.title} style={{ width: "100%", height: 160, objectFit: "cover" }} /> : null}
            <div style={{ padding: 12 }}>
              <h3 style={{ margin: "0 0 6px" }}>{parcel.title}</h3>
              <p style={{ margin: 0 }}>{parcel.location}</p>
              <p style={{ margin: "6px 0 0" }}>
                {parcel.sizeAcres ?? "?"} acres • ${parcel.priceUsd?.toLocaleString() ?? "?"}
              </p>
              <p style={{ margin: "6px 0 10px" }}>Score: {parcel.score ?? "?"}</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link href={`/portfolios/${parcel.id}`} style={{ color: "#fbbf24" }}>Open details →</Link>
                {parcel.sourceUrl ? <a href={parcel.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "#34d399" }}>Source ↗</a> : null}
              </div>
            </div>
          </article>
        ))}
      </div>
      {parcels.length === 0 ? <p>No parcels yet. Seed the DB and reload.</p> : null}
    </section>
  );
}
