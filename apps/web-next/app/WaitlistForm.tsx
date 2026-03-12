"use client";

import { useState } from "react";

type WaitlistFormProps = {
  source: string;
};

export default function WaitlistForm({ source }: WaitlistFormProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [interest, setInterest] = useState("campaign");
  const [status, setStatus] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setStatus("");

    try {
      const response = await fetch("/api/waitlist", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name,
          email,
          interest,
          source,
        }),
      });

      const payload = await response.json() as { ok?: boolean; error?: string; message?: string };
      if (!response.ok || !payload.ok) {
        throw new Error(payload.error ?? "Waitlist signup failed.");
      }

      setStatus(payload.message ?? "You are on the waitlist.");
      setEmail("");
      setName("");
      setInterest("campaign");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Waitlist signup failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} style={{ display: "grid", gap: 10 }}>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10 }}>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name (optional)"
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #334155",
            background: "#0b1210",
            color: "#e5e7eb",
          }}
        />
        <input
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #334155",
            background: "#0b1210",
            color: "#e5e7eb",
          }}
        />
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(220px, 280px) auto", gap: 10, alignItems: "center" }}>
        <select
          value={interest}
          onChange={(event) => setInterest(event.target.value)}
          style={{
            padding: "12px 14px",
            borderRadius: 10,
            border: "1px solid #334155",
            background: "#0b1210",
            color: "#e5e7eb",
          }}
        >
          <option value="campaign">First parcel campaign</option>
          <option value="collector">Stamp drops</option>
          <option value="donor">Patron / donor updates</option>
          <option value="builder">Volunteer / builder work</option>
        </select>
        <button
          type="submit"
          disabled={submitting}
          style={{
            padding: "12px 16px",
            borderRadius: 10,
            border: "none",
            background: submitting ? "#35523f" : "#4caf50",
            color: "#04120a",
            fontWeight: 800,
            cursor: submitting ? "wait" : "pointer",
          }}
        >
          {submitting ? "Saving…" : "Join Waitlist"}
        </button>
      </div>
      <p style={{ margin: 0, color: "#94a3b8", fontSize: 13 }}>
        Opt-in only. This list is for RobinHoodCoin parcel, stamp, and movement updates.
      </p>
      {status ? (
        <p style={{ margin: 0, color: status.toLowerCase().includes("failed") || status.toLowerCase().includes("valid") ? "#fca5a5" : "#86efac" }}>
          {status}
        </p>
      ) : null}
    </form>
  );
}
