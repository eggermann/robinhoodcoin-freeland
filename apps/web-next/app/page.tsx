import Link from "next/link";
import { db } from "../lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const [totalParcels, topParcel, shortlist] = await Promise.all([
    db.parcel.count(),
    db.parcel.findFirst({
      orderBy: { score: "desc" },
      select: { priceUsd: true, score: true, title: true },
    }),
    db.parcel.findMany({
      orderBy: [{ score: "desc" }, { createdAt: "desc" }],
      take: 3,
      select: { id: true, title: true, location: true, score: true },
    }),
  ]);

  return (
    <main style={{ display: "grid", gap: 26 }}>
      <section
        style={{
          borderRadius: 16,
          border: "1px solid #2a3a2e",
          padding: 24,
          background: "radial-gradient(1000px 400px at 50% -80px, rgba(76,175,80,0.22), rgba(8,12,10,0.92))",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
            marginBottom: 24,
          }}
        >
          <strong style={{ color: "#fcd34d" }}>RobinHoodCoin</strong>
          <nav style={{ display: "flex", gap: 14, flexWrap: "wrap", fontSize: 14 }}>
            <a href="#mission" style={{ color: "#9ca3af", textDecoration: "none" }}>Mission</a>
            <a href="#how" style={{ color: "#9ca3af", textDecoration: "none" }}>How It Works</a>
            <a href="#stamps" style={{ color: "#9ca3af", textDecoration: "none" }}>Stamps</a>
            <a href="#portfolio" style={{ color: "#9ca3af", textDecoration: "none" }}>Portfolio</a>
            <a href="#roadmap" style={{ color: "#9ca3af", textDecoration: "none" }}>Roadmap</a>
          </nav>
        </div>
        <span
          style={{
            display: "inline-block",
            padding: "6px 10px",
            borderRadius: 999,
            border: "1px solid #35523f",
            background: "#17271f",
            color: "#fcd34d",
            fontSize: 12,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 14,
          }}
        >
          Freeland Initiative
        </span>
        <h1 style={{ margin: "0 0 12px", fontSize: "clamp(2rem,5vw,3.3rem)", lineHeight: 1.1 }}>
          Create Freedom.
          <br />
          One Parcel at a Time.
        </h1>
        <p style={{ margin: "0 0 8px", fontSize: 18, color: "#cbd5e1", maxWidth: 760 }}>
          A crypto-powered collective buying real land for communities. Governed by the people who fund it.
          Transparent, decentralized, and mission-locked.
        </p>
        <p style={{ margin: 0, color: "#94a3b8", maxWidth: 760 }}>
          We invite people to pool resources into shared land and shared freedom.
        </p>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 22 }}>
          <Link
            href="/portfolios"
            style={{
              background: "#4caf50",
              color: "#04120a",
              padding: "12px 22px",
              borderRadius: 10,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Explore Parcels
          </Link>
          <a
            href="https://t.me/robinhoodcoin"
            target="_blank"
            rel="noreferrer"
            style={{
              border: "1px solid #4caf50",
              color: "#4caf50",
              padding: "12px 22px",
              borderRadius: 10,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Join Telegram
          </a>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
        <StatCard label="Active Parcels" value={String(totalParcels)} color="#fcd34d" />
        <StatCard label="Top Score" value={topParcel?.score?.toString() ?? "?"} color="#4ade80" />
        <StatCard label="Best Price" value={`$${topParcel?.priceUsd?.toLocaleString() ?? "?"}`} color="#60a5fa" />
        <StatCard label="Platform" value="Live" color="#f472b6" />
      </section>

      <section
        id="mission"
        style={{
          borderRadius: 14,
          border: "1px solid #334155",
          background: "#14211b",
          padding: 22,
        }}
      >
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>Mission and Charter</h2>
        <p style={{ marginTop: 0, color: "#cbd5e1" }}>
          Inspired by Robin Hood as redistribution for the common good: buy communal land, support social causes,
          and keep every decision open to DAO governance.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 10 }}>
          <FeatureCard title="Acquire Freeland" body="Purchase real land and remove it from speculation. Treat it as common infrastructure." />
          <FeatureCard title="Support Causes" body="Reserve a mission slice for social projects and mutual-aid impact." />
          <FeatureCard title="DAO Governance" body="Token holders govern proposals and treasury movements with transparent audit trails." />
        </div>
        <ul style={{ margin: "16px 0 0", paddingLeft: 18, color: "#a7b1be" }}>
          <li>Funds are restricted to land and aligned charitable outcomes.</li>
          <li>Parcels are not flipped for private profit.</li>
          <li>Treasury operations stay public and traceable.</li>
          <li>Local parcel councils govern daily use under DAO charter guardrails.</li>
        </ul>
      </section>

      <section
        id="how"
        style={{
          borderRadius: 14,
          border: "1px solid #334155",
          background: "#0f1a15",
          padding: 22,
        }}
      >
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>How It Works</h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 10 }}>
          <StepCard n="1" title="Get a Stamp" body="Support a campaign and join the member base with verifiable on-chain participation." />
          <StepCard n="2" title="Vote Proposals" body="Use governance workflows to approve campaigns, parcels, and treasury actions." />
          <StepCard n="3" title="Acquire Land" body="Execute approved transactions through treasury controls and legal wrappers." />
          <StepCard n="4" title="Activate Commons" body="Local councils run usage while the DAO enforces charter alignment." />
        </div>
      </section>

      <section
        id="stamps"
        style={{
          borderRadius: 14,
          border: "1px solid #334155",
          background: "#14211b",
          padding: 22,
        }}
      >
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>Stamp Tiers</h2>
        <p style={{ color: "#9ca3af", marginTop: 0 }}>
          Funding tiers from the original index page are now embedded in the app view.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(210px,1fr))", gap: 10 }}>
          <TierCard name="Genesis" price="1 SOL" note="Founding tier, limited supply." />
          <TierCard name="Supporter" price="0.5 SOL" note="Open participation entry point." />
          <TierCard name="Parcel" price="2 SOL" note="Parcel-targeted funding tier." />
          <TierCard name="Patron" price="10 SOL" note="High-conviction contributor tier." />
        </div>
      </section>

      <section
        id="portfolio"
        style={{
          borderRadius: 14,
          border: "1px solid #334155",
          background: "#0f1a15",
          padding: 22,
        }}
      >
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>Portfolio Snapshot</h2>
        <p style={{ color: "#9ca3af", marginTop: 0 }}>
          Live shortlist preview pulled from Prisma. Open the full dataset for comments and source links.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px,1fr))", gap: 10 }}>
          {shortlist.map((parcel) => (
            <article key={parcel.id} style={{ border: "1px solid #334155", borderRadius: 10, padding: 12, background: "#111827" }}>
              <strong>{parcel.title}</strong>
              <p style={{ margin: "4px 0", color: "#94a3b8", fontSize: 14 }}>{parcel.location}</p>
              <p style={{ margin: "4px 0", fontSize: 14 }}>Score: {parcel.score ?? "?"}</p>
              <Link href={`/portfolios/${parcel.id}`} style={{ color: "#fbbf24", fontSize: 14 }}>
                Open details
              </Link>
            </article>
          ))}
          {shortlist.length === 0 ? (
            <p style={{ color: "#9ca3af" }}>No parcels in DB yet. Seed and refresh.</p>
          ) : null}
        </div>
        <div style={{ marginTop: 12 }}>
          <Link
            href="/portfolios"
            style={{
              display: "inline-block",
              background: "linear-gradient(90deg, #fcd34d, #f59e0b)",
              color: "#0a0f0d",
              padding: "10px 16px",
              borderRadius: 10,
              fontWeight: 700,
              textDecoration: "none",
            }}
          >
            Open Full Portfolio
          </Link>
        </div>
      </section>

      <section
        id="roadmap"
        style={{
          borderRadius: 14,
          border: "1px solid #334155",
          background: "#14211b",
          padding: 22,
        }}
      >
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>Roadmap Focus</h2>
        <ol style={{ margin: 0, paddingLeft: 18, color: "#cbd5e1" }}>
          <li>Community activation and proposal participation before close windows.</li>
          <li>Funding traction and campaign conversion.</li>
          <li>First acquisition runbook and legal wrapper hardening.</li>
          <li>Operational rollout for parcel governance and transparency reporting.</li>
        </ol>
      </section>
    </main>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div style={{ background: "#14211b", border: "1px solid #334155", borderRadius: 12, padding: 18, textAlign: "center" }}>
      <div style={{ fontSize: 30, fontWeight: 800, color }}>{value}</div>
      <div style={{ color: "#94a3b8", fontSize: 12, textTransform: "uppercase", letterSpacing: "0.07em" }}>{label}</div>
    </div>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <article style={{ border: "1px solid #334155", borderRadius: 10, padding: 12, background: "#0f172a" }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>{title}</h3>
      <p style={{ margin: 0, color: "#a7b1be", fontSize: 14 }}>{body}</p>
    </article>
  );
}

function StepCard({ n, title, body }: { n: string; title: string; body: string }) {
  return (
    <article style={{ border: "1px solid #334155", borderRadius: 10, padding: 12, background: "#111827" }}>
      <span
        style={{
          display: "inline-flex",
          width: 22,
          height: 22,
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 999,
          background: "#4caf50",
          color: "#08120b",
          fontWeight: 800,
          fontSize: 12,
          marginBottom: 6,
        }}
      >
        {n}
      </span>
      <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>{title}</h3>
      <p style={{ margin: 0, color: "#a7b1be", fontSize: 14 }}>{body}</p>
    </article>
  );
}

function TierCard({ name, price, note }: { name: string; price: string; note: string }) {
  return (
    <article style={{ border: "1px solid #334155", borderRadius: 10, padding: 12, background: "#111827" }}>
      <h3 style={{ margin: "0 0 6px", fontSize: 16 }}>{name}</h3>
      <p style={{ margin: "0 0 6px", color: "#a7b1be", fontSize: 14 }}>{note}</p>
      <strong style={{ color: "#fcd34d" }}>{price}</strong>
    </article>
  );
}
