import Link from "next/link";

export const dynamic = "force-dynamic";

export default function LandPage() {
  return (
    <section style={{ display: "grid", gap: 20 }}>
      <header style={{ borderRadius: 16, border: "1px solid #2a3a2e", padding: 24, background: "#0f1a15" }}>
        <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <Link href="/" style={{ color: "#fcd34d", fontWeight: 700, textDecoration: "none" }}>🏹 RobinHoodCoin</Link>
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", fontSize: 14 }}>
            <Link href="/" style={{ color: "#9ca3af", textDecoration: "none" }}>Home</Link>
            <Link href="/portfolios" style={{ color: "#9ca3af", textDecoration: "none" }}>Portfolio</Link>
            <Link href="/voting" style={{ color: "#9ca3af", textDecoration: "none" }}>Votings</Link>
            <Link href="/movement" style={{ color: "#9ca3af", textDecoration: "none" }}>Movement</Link>
          </div>
        </nav>
        <div style={{ marginTop: 20 }}>
          <h1 style={{ margin: 0 }}>Land Objects Gallery</h1>
          <p style={{ margin: "8px 0 0", color: "#9ca3af" }}>Shortlisted parcels with image previews and DAO-fit scoring.</p>
        </div>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 16 }}>
        {LAND_CARDS.map((card) => (
          <article key={card.title} style={{ border: "1px solid #1f2937", borderRadius: 12, overflow: "hidden", background: "#0b1210" }}>
            <img src={card.image} alt={card.title} style={{ width: "100%", height: 180, objectFit: "cover" }} loading="lazy" />
            <div style={{ padding: 14 }}>
              <span
                style={{
                  display: "inline-flex",
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  background: card.badgeColor,
                  color: "#0a0f0d",
                  fontWeight: 700,
                }}
              >
                {card.badge}
              </span>
              <h3 style={{ margin: "10px 0 6px" }}>{card.title}</h3>
              <p style={{ margin: "0 0 6px", color: "#94a3b8", fontSize: 13 }}>{card.meta}</p>
              <p style={{ margin: 0, color: "#cbd5e1", fontSize: 14 }}>{card.body}</p>
            </div>
          </article>
        ))}
      </section>

      <p style={{ color: "#94a3b8", margin: 0 }}>
        Next step: connect this page to the live shortlist feed so new scout opportunities auto-appear.
      </p>
    </section>
  );
}

const LAND_CARDS = [
  {
    badge: "Strong Buy",
    badgeColor: "#fcd34d",
    title: "LAND-MM418QHX — Los Lunas, NM",
    meta: "5.00 acres · 130 SOL · agricultural",
    body: "Livestock + farming allowed. Commuter access from town makes this a practical first parcel.",
    image: "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=1200&auto=format&fit=crop",
  },
  {
    badge: "Strong Buy",
    badgeColor: "#fcd34d",
    title: "LAND-MM418QFJ — Red Hill, NM",
    meta: "5.68 acres · 119 SOL · rural",
    body: "Power nearby, road access, low entry price. Good candidate for an off-grid pilot community node.",
    image: "https://images.unsplash.com/photo-1501785888041-af3ef285b470?q=80&w=1200&auto=format&fit=crop",
  },
  {
    badge: "Consider",
    badgeColor: "#a7f3d0",
    title: "LAND-MM418QGQ — Fort Garland, CO",
    meta: "5.36 acres · 99.97 SOL · residential",
    body: "Buildable parcel with mountain views and no HOA. Needs legal check for non-commercial charter fit.",
    image: "https://images.unsplash.com/photo-1473448912268-2022ce9509d8?q=80&w=1200&auto=format&fit=crop",
  },
];
