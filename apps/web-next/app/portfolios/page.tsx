import { db } from "../../lib/db";

export const dynamic = "force-dynamic";

export default async function PortfoliosPage() {
  let parcels: Awaited<ReturnType<typeof db.parcel.findMany>> = [];

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
      <p style={{ color: "#fbbf24", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 12 }}>🏹 Portfolios</p>
      <h1 style={{ marginTop: 0 }}>Live Parcels from DB</h1>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 12 }}>
        {parcels.map((parcel) => (
          <article key={parcel.id} style={{ background: "#14211b", border: "1px solid #334155", borderRadius: 10, padding: 12 }}>
            <h3 style={{ margin: "0 0 6px" }}>{parcel.title}</h3>
            <p style={{ margin: 0 }}>{parcel.location}</p>
            <p style={{ margin: "6px 0 0" }}>
              {parcel.sizeAcres ?? "?"} acres • ${parcel.priceUsd?.toLocaleString() ?? "?"}
            </p>
            <p style={{ margin: "6px 0 0" }}>Score: {parcel.score ?? "?"}</p>
            {parcel.sourceUrl ? <a href={parcel.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "#34d399" }}>Source ↗</a> : null}
          </article>
        ))}
      </div>
      {parcels.length === 0 ? <p>No parcels yet. Seed the DB and reload.</p> : null}
    </section>
  );
}
