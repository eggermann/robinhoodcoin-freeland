"use client";

import { useState } from "react";

export function CommentBox({ parcelId }: { parcelId: string }) {
  const [author, setAuthor] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [ok, setOk] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!body.trim()) return;
    setSending(true);
    setOk(false);
    try {
      const res = await fetch(`/v2/api/parcels/${parcelId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ author: author || "Anonymous", body }),
      });
      if (!res.ok) throw new Error("Failed");
      setBody("");
      setOk(true);
      window.location.reload();
    } catch {
      setOk(false);
    } finally {
      setSending(false);
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "grid", gap: 8, marginTop: 12 }}>
      <input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Your name" style={{ padding: 8, borderRadius: 8, border: "1px solid #334155", background: "#0b1412", color: "#e5e7eb" }} />
      <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Add your comment / discussion point" rows={4} style={{ padding: 8, borderRadius: 8, border: "1px solid #334155", background: "#0b1412", color: "#e5e7eb" }} />
      <button disabled={sending} type="submit" style={{ padding: "8px 12px", borderRadius: 8, border: "1px solid #22c55e", background: "#22c55e", color: "#04120a", fontWeight: 700 }}>
        {sending ? "Posting..." : "Post comment"}
      </button>
      {ok ? <small style={{ color: "#86efac" }}>Comment posted.</small> : null}
    </form>
  );
}
