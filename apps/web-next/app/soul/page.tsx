import Link from "next/link";

export const dynamic = "force-dynamic";

export default function SoulPage() {
  return (
    <section style={{ display: "grid", gap: 20 }}>
      <header style={{ borderRadius: 16, border: "1px solid #2a3a2e", padding: 24, background: "#0f1a15" }}>
        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <Link href="/" style={{ color: "#fcd34d", fontWeight: 700, textDecoration: "none" }}>🏹 RobinHoodCoin</Link>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 14 }}>
            <Link href="/" style={{ color: "#9ca3af", textDecoration: "none" }}>Home</Link>
            <Link href="/land" style={{ color: "#9ca3af", textDecoration: "none" }}>Land Objects</Link>
            <Link href="/voting" style={{ color: "#9ca3af", textDecoration: "none" }}>Votings</Link>
            <Link href="/movement" style={{ color: "#9ca3af", textDecoration: "none" }}>Movement</Link>
          </div>
        </nav>
        <div style={{ marginTop: 20 }}>
          <span style={{ display: "inline-flex", padding: "6px 12px", borderRadius: 999, border: "1px solid #35523f", color: "#fcd34d" }}>
            🧠 Soul Console
          </span>
          <h1 style={{ margin: "12px 0 0" }}>Sherwood</h1>
          <p style={{ margin: "8px 0 0", color: "#9ca3af" }}>Direct, practical AI support for RobinHoodCoin operations.</p>
          <div style={{ display: "flex", gap: 12, marginTop: 16, flexWrap: "wrap" }}>
            <Link
              href="/"
              style={{
                background: "#4caf50",
                color: "#04120a",
                padding: "10px 18px",
                borderRadius: 10,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Back to Main Site
            </Link>
            <a
              href="https://t.me/RobinHoodCoinBot"
              target="_blank"
              rel="noreferrer"
              style={{
                border: "1px solid #4caf50",
                color: "#4caf50",
                padding: "10px 18px",
                borderRadius: 10,
                fontWeight: 700,
                textDecoration: "none",
              }}
            >
              Open Telegram Bot
            </a>
          </div>
        </div>
      </header>

      <section style={{ border: "1px solid #1f2937", borderRadius: 14, padding: 18, background: "#0b1210" }}>
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>Operating Rules</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
          <RuleCard title="1) Fix first, narrate second" body="Prefer concrete checks, scripts, and commits over long explanations." />
          <RuleCard title="2) Preserve access" body="Any gateway/SSH/firewall change must keep remote access safe and reversible." />
          <RuleCard title="3) Keep it local-first" body="Default to loopback + token auth for gateway usage unless explicitly hardened for remote use." />
        </div>
      </section>

      <section style={{ border: "1px solid #1f2937", borderRadius: 14, padding: 18, background: "#0f172a" }}>
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>Runbook Commands</h2>
        <CommandCard command="npm run check:openclaw" description="Runs OpenClaw status + doctor with stable Node 22 path and local-safe env handling." />
        <CommandCard command="npm run build:web" description="Builds campaign pages and publishes fresh static output under site/dist." />
        <CommandCard command="git status -sb" description="Quick sanity check before commits and deploys." />
      </section>
    </section>
  );
}

function RuleCard({ title, body }: { title: string; body: string }) {
  return (
    <article style={{ border: "1px solid #1f2937", borderRadius: 12, padding: 14, background: "#111827" }}>
      <h3 style={{ margin: "0 0 6px" }}>{title}</h3>
      <p style={{ margin: 0, color: "#94a3b8" }}>{body}</p>
    </article>
  );
}

function CommandCard({ command, description }: { command: string; description: string }) {
  return (
    <div style={{ border: "1px solid #1f2937", borderRadius: 12, padding: 14, background: "#0b1210", marginBottom: 12 }}>
      <p style={{ margin: "0 0 6px", fontFamily: "ui-monospace, SFMono-Regular, SFMono-Regular, Menlo, monospace", color: "#fcd34d" }}>
        {command}
      </p>
      <p style={{ margin: 0, color: "#94a3b8" }}>{description}</p>
    </div>
  );
}
