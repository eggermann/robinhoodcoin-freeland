import Link from "next/link";
import { db } from "../../lib/db";
import { formatParcelFacts, getParcelDisplayImage, isVerifiedParcel } from "../../lib/parcels";

export const dynamic = "force-dynamic";

export default async function LandPage() {
  const parcels = await db.parcel.findMany({
    orderBy: [{ score: "desc" }, { createdAt: "desc" }],
    take: 12,
  });
  const verifiedParcels = parcels.filter(isVerifiedParcel);

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
        {verifiedParcels.map((parcel) => (
          <article key={parcel.id} style={{ border: "1px solid #1f2937", borderRadius: 12, overflow: "hidden", background: "#0b1210" }}>
            <img src={getParcelDisplayImage(parcel)} alt={parcel.title} style={{ width: "100%", height: 180, objectFit: "cover" }} loading="lazy" />
            <div style={{ padding: 14 }}>
              <span
                style={{
                  display: "inline-flex",
                  padding: "4px 10px",
                  borderRadius: 999,
                  fontSize: 12,
                  background: parcel.score != null && parcel.score >= 75 ? "#fcd34d" : "#a7f3d0",
                  color: "#0a0f0d",
                  fontWeight: 700,
                }}
              >
                {parcel.score != null && parcel.score >= 75 ? "Strong Buy" : "Consider"}
              </span>
              <h3 style={{ margin: "10px 0 6px" }}>{parcel.title}</h3>
              <p style={{ margin: "0 0 6px", color: "#94a3b8", fontSize: 13 }}>{parcel.location}</p>
              <p style={{ margin: "0 0 6px", color: "#cbd5e1", fontSize: 14 }}>{formatParcelFacts(parcel)} · Score {parcel.score ?? "?"}</p>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                <Link href={`/portfolios/${parcel.id}`} style={{ color: "#fcd34d", textDecoration: "none", fontWeight: 700 }}>Open details →</Link>
                {parcel.sourceUrl ? <a href={parcel.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "#86efac" }}>Source ↗</a> : null}
              </div>
            </div>
          </article>
        ))}
      </section>

      <p style={{ color: "#94a3b8", margin: 0 }}>
        {verifiedParcels.length > 0
          ? "This gallery is now driven by live parcel-level records from Prisma."
          : "No parcel-level listings are synced yet. Run the scout pipeline or seed the DB to populate this gallery."}
      </p>
    </section>
  );
}
