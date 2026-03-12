import fs from "node:fs/promises";
import path from "node:path";
import Link from "next/link";

export const dynamic = "force-dynamic";

type ProposalStatus = "draft" | "active" | "approved" | "rejected" | "executed" | "cancelled";

type ProposalRecord = {
  id: string;
  title: string;
  description: string;
  type: string;
  status: ProposalStatus;
  createdAt: string;
  closesAt: string;
  votesFor: number;
  votesAgainst: number;
};

function proposalDirCandidates(): string[] {
  const cwd = process.cwd();
  const root = path.resolve(cwd, "..", "..");
  return [
    path.join(root, "data", "proposals"),
    path.join(cwd, "data", "proposals"),
  ];
}

async function loadProposals(): Promise<ProposalRecord[]> {
  for (const dir of proposalDirCandidates()) {
    try {
      const files = (await fs.readdir(dir))
        .filter((file) => file.endsWith(".json"))
        .sort()
        .reverse();

      const proposals = await Promise.all(
        files.map(async (file) => {
          const raw = await fs.readFile(path.join(dir, file), "utf8");
          return JSON.parse(raw) as ProposalRecord;
        }),
      );

      return proposals.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
    } catch {
      continue;
    }
  }

  return [];
}

function statusAccent(status: ProposalStatus): { badge: string; color: string } {
  switch (status) {
    case "active":
      return { badge: "Open", color: "#fcd34d" };
    case "approved":
    case "executed":
      return { badge: status === "executed" ? "Executed" : "Approved", color: "#86efac" };
    case "rejected":
    case "cancelled":
      return { badge: status === "cancelled" ? "Cancelled" : "Rejected", color: "#fca5a5" };
    default:
      return { badge: "Draft", color: "#93c5fd" };
  }
}

function formatClosesAt(value: string): string {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "Closing date pending";
  return `Closes ${new Date(timestamp).toLocaleString()}`;
}

export default async function VotingPage() {
  const proposals = await loadProposals();
  const botUrl = process.env.NEXT_PUBLIC_BOT_URL ?? "https://t.me/RobinHoodCoinBot";

  return (
    <section style={{ display: "grid", gap: 20 }}>
      <header style={{ borderRadius: 16, border: "1px solid #2a3a2e", padding: 24, background: "#0f1a15" }}>
        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <Link href="/" style={{ color: "#fcd34d", fontWeight: 700, textDecoration: "none" }}>🏹 RobinHoodCoin</Link>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 14 }}>
            <Link href="/" style={{ color: "#9ca3af", textDecoration: "none" }}>Home</Link>
            <Link href="/land" style={{ color: "#9ca3af", textDecoration: "none" }}>Land Objects</Link>
            <Link href="/movement" style={{ color: "#9ca3af", textDecoration: "none" }}>Movement</Link>
            <Link href="/portfolios" style={{ color: "#9ca3af", textDecoration: "none" }}>Portfolio</Link>
          </div>
        </nav>
        <div style={{ marginTop: 20 }}>
          <h1 style={{ margin: 0 }}>DAO Votings</h1>
          <p style={{ margin: "8px 0 0", color: "#9ca3af" }}>Transparent proposal flow before multisig execution.</p>
        </div>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {proposals.length === 0 ? (
          <article style={{ border: "1px solid #1f2937", borderRadius: 12, padding: 16, background: "#0b1210" }}>
            <h3 style={{ margin: "0 0 8px" }}>No proposal files are published yet</h3>
            <p style={{ margin: "0 0 10px", color: "#94a3b8" }}>
              This page now reflects tracked proposal data instead of mock cards. When the bot or operators create proposal files, they will appear here automatically.
            </p>
            <a href={botUrl} target="_blank" rel="noreferrer" style={{ color: "#fcd34d", fontWeight: 700, textDecoration: "none" }}>
              Open the governance bot →
            </a>
          </article>
        ) : proposals.map((proposal) => {
          const accent = statusAccent(proposal.status);
          return (
            <article key={proposal.id} style={{ border: "1px solid #1f2937", borderRadius: 12, padding: 16, background: "#0b1210" }}>
              <span
                style={{
                  display: "inline-flex",
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  background: accent.color,
                  color: "#0a0f0d",
                  fontWeight: 700,
                }}
              >
                {accent.badge}
              </span>
              <h3 style={{ margin: "10px 0 6px" }}>{proposal.title}</h3>
              <p style={{ margin: "0 0 8px", color: "#cbd5e1" }}>{proposal.description}</p>
              <p style={{ margin: "0 0 6px", color: "#94a3b8", fontSize: 13 }}>
                Type: {proposal.type} • Votes: {proposal.votesFor} for / {proposal.votesAgainst} against
              </p>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>
                {formatClosesAt(proposal.closesAt)}
              </p>
              {proposal.status === "active" ? (
                <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                  <a
                    href={botUrl}
                    target="_blank"
                    rel="noreferrer"
                    style={{
                      borderRadius: 999,
                      border: "1px solid #334155",
                      background: "#111827",
                      color: "#fcd34d",
                      padding: "6px 12px",
                      fontSize: 12,
                      textDecoration: "none",
                    }}
                  >
                    Vote via bot
                  </a>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </section>
  );
}
