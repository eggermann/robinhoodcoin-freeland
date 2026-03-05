import Link from "next/link";

export const dynamic = "force-dynamic";

export default function VotingPage() {
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
        {PROPOSALS.map((proposal) => (
          <article key={proposal.title} style={{ border: "1px solid #1f2937", borderRadius: 12, padding: 16, background: "#0b1210" }}>
            <span
              style={{
                display: "inline-flex",
                padding: "4px 10px",
                borderRadius: 999,
                fontSize: 12,
                background: proposal.badgeColor,
                color: "#0a0f0d",
                fontWeight: 700,
              }}
            >
              {proposal.badge}
            </span>
            <h3 style={{ margin: "10px 0 6px" }}>{proposal.title}</h3>
            <p style={{ margin: "0 0 6px", color: "#cbd5e1" }}>{proposal.body}</p>
            <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>{proposal.meta}</p>
            {proposal.actions ? (
              <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
                {proposal.actions.map((action) => (
                  <button
                    key={action}
                    type="button"
                    disabled
                    style={{
                      borderRadius: 999,
                      border: "1px solid #334155",
                      background: "#111827",
                      color: "#94a3b8",
                      padding: "6px 12px",
                      fontSize: 12,
                      cursor: "not-allowed",
                    }}
                  >
                    {action}
                  </button>
                ))}
              </div>
            ) : null}
          </article>
        ))}
      </section>
    </section>
  );
}

const PROPOSALS = [
  {
    badge: "Open",
    badgeColor: "#fcd34d",
    title: "Proposal #17 — Acquire LAND-MM418QHX",
    body: "Budget: 130 SOL + legal buffer. Location: Los Lunas, New Mexico.",
    meta: "Ends in 3d 12h · Quorum target: 60%",
    actions: ["Vote YES (bot)", "Vote NO (bot)"],
  },
  {
    badge: "Draft",
    badgeColor: "#93c5fd",
    title: "Proposal #18 — Genesis Stamp Campaign v1",
    body: "Launch 1,000 Genesis stamps to co-fund the first parcel acquisition.",
    meta: "Pending legal metadata review",
  },
  {
    badge: "Passed",
    badgeColor: "#86efac",
    title: "Proposal #16 — Treasury allocation framework",
    body: "Confirmed 70/20/10 charter allocation with mandatory public reporting.",
    meta: "Passed with 78.4% YES",
  },
];
