import Link from "next/link";
import { db } from "../lib/db";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const totalParcels = await db.parcel.count();
  const topParcel = await db.parcel.findFirst({
    orderBy: { score: "desc" },
    select: { priceUsd: true, score: true },
  });

  return (
    <main>
      {/* Hero */}
      <section style={{ textAlign: "center", padding: "60px 20px", background: "linear-gradient(135deg, #0a0f0d 0%, #14211b 100%)", borderRadius: 16, marginBottom: 32 }}>
        <div style={{ fontSize: 64, marginBottom: 16 }}>🏹</div>
        <h1 style={{ fontSize: 48, fontWeight: 800, margin: "0 0 16px", background: "linear-gradient(90deg, #fcd34d, #4ade80)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          RobinHoodCoin Freeland
        </h1>
        <p style={{ fontSize: 22, color: "#94a3b8", margin: "0 0 32px", maxWidth: 600, marginLeft: "auto", marginRight: "auto" }}>
          Create freedom. One parcel at a time. Real land for real communities.
        </p>
        <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
          <Link href="/v2/portfolios" style={{ background: "#22c55e", color: "#04120a", padding: "14px 28px", borderRadius: 10, fontWeight: 700, fontSize: 18, textDecoration: "none" }}>
            Explore Parcels →
          </Link>
          <a href="https://eggman3.uber.space/" style={{ background: "transparent", color: "#fcd34d", padding: "14px 28px", borderRadius: 10, fontWeight: 700, fontSize: 18, textDecoration: "none", border: "2px solid #fcd34d" }}>
            View v1 Site
          </a>
        </div>
      </section>

      {/* Stats */}
      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 20, marginBottom: 32 }}>
        <div style={{ background: "#14211b", border: "1px solid #334155", borderRadius: 12, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: "#fcd34d" }}>{totalParcels}</div>
          <div style={{ color: "#94a3b8", fontSize: 14, textTransform: "uppercase", letterSpacing: 1 }}>Active Parcels</div>
        </div>
        <div style={{ background: "#14211b", border: "1px solid #334155", borderRadius: 12, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: "#4ade80" }}>${topParcel?.priceUsd?.toLocaleString() ?? "?"}</div>
          <div style={{ color: "#94a3b8", fontSize: 14, textTransform: "uppercase", letterSpacing: 1 }}>Best Price</div>
        </div>
        <div style={{ background: "#14211b", border: "1px solid #334155", borderRadius: 12, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: "#60a5fa" }}>{topParcel?.score ?? "?"}</div>
          <div style={{ color: "#94a3b8", fontSize: 14, textTransform: "uppercase", letterSpacing: 1 }}>Top Score</div>
        </div>
        <div style={{ background: "#14211b", border: "1px solid #334155", borderRadius: 12, padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 36, fontWeight: 800, color: "#f472b6" }}>Live</div>
          <div style={{ color: "#94a3b8", fontSize: 14, textTransform: "uppercase", letterSpacing: 1 }}>v2 Platform</div>
        </div>
      </section>

      {/* Mission */}
      <section style={{ background: "#14211b", border: "1px solid #334155", borderRadius: 12, padding: 32, marginBottom: 32 }}>
        <h2 style={{ marginTop: 0, color: "#fcd34d" }}>The Mission</h2>
        <p style={{ fontSize: 16, lineHeight: 1.7, color: "#e2e8f0" }}>
          We pool resources to acquire communal land — <strong>freeland</strong> — permanently removed from speculative markets.
          Every parcel is governed by the DAO, transparent on-chain, and dedicated to common good: housing, farming,
          maker spaces, and refuge. This is freedom infrastructure, not speculation.
        </p>
        <div style={{ display: "flex", gap: 12, marginTop: 20, flexWrap: "wrap" }}>
          <span style={{ background: "#064e3b", color: "#4ade80", padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>✅ Non-commercial</span>
          <span style={{ background: "#064e3b", color: "#4ade80", padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>✅ DAO-governed</span>
          <span style={{ background: "#064e3b", color: "#4ade80", padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>✅ Transparent</span>
          <span style={{ background: "#064e3b", color: "#4ade80", padding: "6px 12px", borderRadius: 20, fontSize: 12, fontWeight: 600 }}>✅ Community-first</span>
        </div>
      </section>

      {/* CTA Footer */}
      <section style={{ textAlign: "center", padding: "40px 20px" }}>
        <p style={{ fontSize: 18, color: "#94a3b8", marginBottom: 20 }}>Ready to explore land opportunities?</p>
        <Link href="/v2/portfolios" style={{ display: "inline-block", background: "linear-gradient(90deg, #fcd34d, #f59e0b)", color: "#0a0f0d", padding: "16px 32px", borderRadius: 10, fontWeight: 800, fontSize: 18, textDecoration: "none" }}>
          View Full Portfolio →
        </Link>
      </section>
    </main>
  );
}