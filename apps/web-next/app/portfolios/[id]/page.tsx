import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "../../../lib/db";
import { isDatabaseUnavailableError } from "../../../lib/db-errors";
import { CommentBox } from "../CommentBox";
import { formatParcelFacts, getParcelDisplayImage, isLaneLead } from "../../../lib/parcels";

export const dynamic = "force-dynamic";

async function loadParcel(id: string) {
  return db.parcel.findUnique({
    where: { id },
    include: { comments: { orderBy: { createdAt: "desc" }, take: 50 } },
  });
}

export default async function ParcelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://freeland.rocks";
  const discussUrl = process.env.NEXT_PUBLIC_COMMUNITY_URL ?? "https://t.me/robinhoodcoin";
  let parcel: Awaited<ReturnType<typeof loadParcel>> = null;

  try {
    parcel = await loadParcel(id);
  } catch (error) {
    if (!isDatabaseUnavailableError(error)) throw error;
    console.error(`Parcel detail unavailable for ${id}.`, error);

    return (
      <section style={{ display: "grid", gap: 16 }}>
        <Link href="/portfolios" style={{ color: "#34d399" }}>← Back to portfolio</Link>
        <div style={{ border: "1px solid #7f1d1d", borderRadius: 12, padding: 18, background: "#1f1614" }}>
          <h1 style={{ marginTop: 0, color: "#fecaca" }}>Parcel data temporarily unavailable</h1>
          <p style={{ marginBottom: 0, color: "#fca5a5" }}>
            The parcel database is offline right now, so this record cannot be loaded. Try again after the web database reconnects.
          </p>
        </div>
      </section>
    );
  }

  if (!parcel) return notFound();
  const laneLead = isLaneLead(parcel);

  const shareText = encodeURIComponent(`Check this Freeland parcel: ${parcel.title}`);
  const shareUrl = encodeURIComponent(`${siteUrl.replace(/\/$/, "")}/portfolios/${parcel.id}`);

  return (
    <section>
      <Link href="/portfolios" style={{ color: "#34d399" }}>← Back to portfolio</Link>
      <h1>{parcel.title}</h1>
      <img src={getParcelDisplayImage(parcel)} alt={parcel.title} style={{ width: "100%", maxHeight: 360, objectFit: "cover", borderRadius: 12, border: "1px solid #334155" }} />
      <p>{parcel.location}</p>
      <p>{formatParcelFacts(parcel)} • Score {parcel.score ?? "?"}</p>
      {laneLead ? (
        <section style={{ margin: "12px 0 18px", border: "1px solid #334155", borderRadius: 12, padding: 14, background: "#0f172a" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 18, color: "#fcd34d" }}>What Scout Lane Means</h2>
          <p style={{ margin: "0 0 8px", color: "#cbd5e1" }}>
            This record is a market lane, not a parcel-complete listing. It tells the community where the scout found a promising source stream,
            auction channel, or regional search path, but not yet the exact lot that should go to governance.
          </p>
          <ul style={{ margin: 0, paddingLeft: 18, color: "#94a3b8" }}>
            <li>Size and price can still be missing or approximate.</li>
            <li>A parcel-pass extraction is still needed before this becomes a serious acquisition candidate.</li>
            <li>Use the source link, comments, and Telegram discussion to help turn this lane into a verified parcel record.</li>
          </ul>
        </section>
      ) : (
        <section style={{ margin: "12px 0 18px", border: "1px solid #334155", borderRadius: 12, padding: 14, background: "#101a17" }}>
          <h2 style={{ margin: "0 0 8px", fontSize: 18, color: "#86efac" }}>Verified Parcel</h2>
          <p style={{ margin: 0, color: "#94a3b8" }}>
            This card has parcel-level size and price data and is suitable for side-by-side comparison, public discussion, and eventual DAO prioritization.
          </p>
        </section>
      )}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0 20px" }}>
        {parcel.sourceUrl ? <a href={parcel.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>Original listing ↗</a> : null}
        <a href={`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`} target="_blank" rel="noreferrer" style={{ color: "#93c5fd" }}>Share on X</a>
        <a href={`https://t.me/share/url?url=${shareUrl}&text=${shareText}`} target="_blank" rel="noreferrer" style={{ color: "#86efac" }}>Share on Telegram</a>
        <a href={discussUrl} target="_blank" rel="noreferrer" style={{ color: "#fcd34d" }}>Join parcel discussion ↗</a>
      </div>

      <h2>Discussion</h2>
      <p style={{ color: "#94a3b8" }}>
        Use this thread to post due-diligence notes, local context, zoning concerns, collector interest, or ideas for how this parcel could become a social commons.
      </p>
      <CommentBox parcelId={parcel.id} />
      <div style={{ display: "grid", gap: 10, marginTop: 16 }}>
        {parcel.comments.map((c) => (
          <article key={c.id} style={{ background: "#101a17", border: "1px solid #334155", borderRadius: 10, padding: 10 }}>
            <strong>{c.author}</strong>
            <p style={{ margin: "6px 0 0" }}>{c.body}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
