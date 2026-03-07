import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "../../../lib/db";
import { CommentBox } from "../CommentBox";
import { formatParcelFacts, getParcelDisplayImage, isLaneLead } from "../../../lib/parcels";

export const dynamic = "force-dynamic";

export default async function ParcelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "https://freeland.rocks";
  const parcel = await db.parcel.findUnique({
    where: { id },
    include: { comments: { orderBy: { createdAt: "desc" }, take: 50 } },
  });

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
        <p style={{ color: "#94a3b8" }}>
          This is a lane-level scout lead, not a parcel-complete record yet. Exact lot size and price need a parcel-pass extraction step before this should be treated as a real acquisition candidate.
        </p>
      ) : null}

      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", margin: "12px 0 20px" }}>
        {parcel.sourceUrl ? <a href={parcel.sourceUrl} target="_blank" rel="noreferrer" style={{ color: "#60a5fa" }}>Original listing ↗</a> : null}
        <a href={`https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}`} target="_blank" rel="noreferrer" style={{ color: "#93c5fd" }}>Share on X</a>
        <a href={`https://t.me/share/url?url=${shareUrl}&text=${shareText}`} target="_blank" rel="noreferrer" style={{ color: "#86efac" }}>Share on Telegram</a>
      </div>

      <h2>Discussion</h2>
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
