import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "../../../lib/db";
import { CommentBox } from "../CommentBox";

export const dynamic = "force-dynamic";

export default async function ParcelDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parcel = await db.parcel.findUnique({
    where: { id },
    include: { comments: { orderBy: { createdAt: "desc" }, take: 50 } },
  });

  if (!parcel) return notFound();

  const shareText = encodeURIComponent(`Check this Freeland parcel: ${parcel.title}`);
  const shareUrl = encodeURIComponent(`https://eggman3.uber.space/v2/portfolios/${parcel.id}`);

  return (
    <section>
      <Link href="/portfolios" style={{ color: "#34d399" }}>← Back to portfolio</Link>
      <h1>{parcel.title}</h1>
      {parcel.teaserImage ? <img src={parcel.teaserImage} alt={parcel.title} style={{ width: "100%", maxHeight: 360, objectFit: "cover", borderRadius: 12, border: "1px solid #334155" }} /> : null}
      <p>{parcel.location}</p>
      <p>{parcel.sizeAcres ?? "?"} acres • ${parcel.priceUsd?.toLocaleString() ?? "?"} • Score {parcel.score ?? "?"}</p>

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
