import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";

export const dynamic = "force-dynamic";

type MovementEntry = {
  timestamp?: string;
  source: string;
  summary: string;
};

async function readJson(filePath: string): Promise<any | null> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readTailLines(filePath: string, maxBytes = 120_000, maxLines = 200): Promise<string[]> {
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

function summarizeEntry(entry: any): string {
  if (!entry || typeof entry !== "object") return "Unknown event";
  if (typeof entry.summary === "string") return entry.summary;
  if (typeof entry.message === "string") return entry.message;
  if (typeof entry.error === "string") return `error: ${entry.error}`;
  if (typeof entry.ref === "string") return `ask failure ${entry.ref}`;
  if (typeof entry.url === "string") {
    const status = entry.status ? ` (${entry.status})` : "";
    return `url probe${status}: ${entry.url}`;
  }
  if (typeof entry.action === "string") return entry.action;
  if (typeof entry.type === "string") return entry.type;
  return JSON.stringify(entry).slice(0, 140);
}

function compactFileLabel(filePath: string): string {
  const parts = filePath.split("/").filter(Boolean);
  if (parts.length < 2) return filePath;
  return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

async function loadMovementEntries(): Promise<MovementEntry[]> {
  const cwd = process.cwd();
  const root = path.resolve(cwd, "..", "..");
  const dataRoot = path.join(root, "data");

  const jsonlCandidates = [
    path.join(dataRoot, "openclaw-autonomy", "cycles.jsonl"),
    path.join(dataRoot, "openclaw-autonomy", "governance.jsonl"),
    path.join(dataRoot, "openclaw-autonomy", "moderator.jsonl"),
    path.join(dataRoot, "openclaw-autonomy", "pr.jsonl"),
    path.join(dataRoot, "openclaw-fusion", "cycles.jsonl"),
    path.join(dataRoot, "land-search", "autonomous-scout-log.jsonl"),
    path.join(dataRoot, "bot", "ask-failures.jsonl"),
    path.join(dataRoot, "bot", "url-probes.jsonl"),
    path.join(dataRoot, "finance-monitor", "report-log.jsonl"),
  ];

  const entries: MovementEntry[] = [];

  for (const filePath of jsonlCandidates) {
    const lines = await readTailLines(filePath, 120_000, 200);
    if (lines.length === 0) continue;

    for (const line of lines) {
      try {
        const parsed = JSON.parse(line);
        entries.push({
          timestamp: parsed.timestamp ?? parsed.time ?? parsed.ts,
          source: compactFileLabel(filePath),
          summary: summarizeEntry(parsed),
        });
      } catch {
        entries.push({
          timestamp: undefined,
          source: compactFileLabel(filePath),
          summary: line.slice(0, 140),
        });
      }
    }
  }

  return entries
    .sort((a, b) => {
      const ta = a.timestamp ? Date.parse(a.timestamp) : 0;
      const tb = b.timestamp ? Date.parse(b.timestamp) : 0;
      return tb - ta;
    })
    .slice(0, 40);
}

async function loadLogTail(): Promise<{ source: string; line: string }[]> {
  const home = process.env.HOME ?? "";
  const candidates = [
    process.env.OPENCLAW_GATEWAY_LOG,
    process.env.ROBINHOODCOIN_BOT_ERR_LOG,
    home ? path.join(home, "logs", "openclaw-gateway.err.log") : "",
    home ? path.join(home, "logs", "robinhoodcoin", "bot.err.log") : "",
    "/home/pi/logs/openclaw-gateway.err.log",
  ].filter(Boolean) as string[];

  const rows: { source: string; line: string }[] = [];

  for (const filePath of new Set(candidates)) {
    const lines = await readTailLines(filePath, 140_000, 120);
    if (lines.length === 0) continue;
    for (const line of lines.slice(-20)) {
      rows.push({ source: compactFileLabel(filePath), line });
    }
  }

  return rows.slice(-30);
}

export default async function MovementPage() {
  const cwd = process.cwd();
  const root = path.resolve(cwd, "..", "..");
  const dashboard = await readJson(path.join(root, "site", "public", "data", "dashboard.json"));
  const movementEntries = await loadMovementEntries();
  const logTail = await loadLogTail();

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
        <div>
          <p style={{ color: "#fbbf24", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 12, margin: 0 }}>
            Movement Console
          </p>
          <h1 style={{ margin: "6px 0 0" }}>Live Movement & Logs</h1>
        </div>
        <nav style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 14 }}>
          <Link href="/" style={{ color: "#9ca3af", textDecoration: "none" }}>Home</Link>
          <Link href="/portfolios" style={{ color: "#9ca3af", textDecoration: "none" }}>Portfolio</Link>
          <Link href="/land" style={{ color: "#9ca3af", textDecoration: "none" }}>Land Objects</Link>
          <Link href="/voting" style={{ color: "#9ca3af", textDecoration: "none" }}>Votings</Link>
          <Link href="/soul" style={{ color: "#9ca3af", textDecoration: "none" }}>Soul Console</Link>
        </nav>
      </header>

      <section style={{ border: "1px solid #1f2937", borderRadius: 14, padding: 18, background: "#0f172a" }}>
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>Current Pulse</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
          <PulseStat label="Treasury SOL" value={dashboard?.treasury?.balanceSOL ?? "?"} accent="#fcd34d" />
          <PulseStat label="Active Campaigns" value={dashboard?.stats?.activeCampaigns ?? "?"} accent="#4ade80" />
          <PulseStat label="Stamps Minted" value={dashboard?.stats?.stampsMinted ?? "?"} accent="#60a5fa" />
          <PulseStat label="Parcels Acquired" value={dashboard?.stats?.parcelsAcquired ?? "?"} accent="#f472b6" />
        </div>
        <p style={{ margin: "12px 0 0", color: "#94a3b8", fontSize: 13 }}>
          Last dashboard update: {dashboard?.generatedAt ?? "unknown"}
        </p>
      </section>

      <section style={{ border: "1px solid #1f2937", borderRadius: 14, padding: 18, background: "#0b1210" }}>
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>Movement Feed</h2>
        {movementEntries.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>No JSONL movement entries yet. Waiting for automation or bot logs.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {movementEntries.map((entry, index) => (
              <article key={`${entry.source}-${index}`} style={{ border: "1px solid #1f2937", borderRadius: 10, padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <span style={{ color: "#fbbf24", fontSize: 12 }}>{entry.source}</span>
                  <span style={{ color: "#94a3b8", fontSize: 12 }}>{entry.timestamp ?? "no timestamp"}</span>
                </div>
                <p style={{ margin: "6px 0 0", color: "#e5e7eb" }}>{entry.summary}</p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section style={{ border: "1px solid #1f2937", borderRadius: 14, padding: 18, background: "#0f172a" }}>
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>Recent Log Tail</h2>
        {logTail.length === 0 ? (
          <p style={{ color: "#94a3b8" }}>No gateway/bot log lines reachable from this host.</p>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {logTail.map((row, index) => (
              <div key={`${row.source}-${index}`} style={{ fontSize: 12, color: "#d1d5db" }}>
                <span style={{ color: "#fbbf24" }}>[{row.source}]</span> {row.line}
              </div>
            ))}
          </div>
        )}
      </section>
    </section>
  );
}

function PulseStat({ label, value, accent }: { label: string; value: string | number; accent: string }) {
  return (
    <div style={{ border: "1px solid #1f2937", borderRadius: 10, padding: 12, background: "#0b1220" }}>
      <div style={{ fontSize: 12, color: "#94a3b8" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 700, color: accent }}>{value}</div>
    </div>
  );
}
