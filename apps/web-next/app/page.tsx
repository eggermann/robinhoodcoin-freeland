import Link from "next/link";

export default function HomePage() {
  return (
    <section>
      <p style={{ color: "#fbbf24", letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 12 }}>🏹 RobinHoodCoin v2</p>
      <h1 style={{ marginTop: 0 }}>Create freedom. One parcel at a time.</h1>
      <p>This is the new Next.js + Prisma foundation. Live data pages start now.</p>
      <Link href="/portfolios" style={{ color: "#34d399" }}>Go to Portfolios →</Link>
    </section>
  );
}
