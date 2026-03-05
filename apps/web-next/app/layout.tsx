import type { ReactNode } from "react";

export const metadata = {
  title: "RobinHoodCoin Freeland",
  description: "Create freedom, one parcel at a time.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body style={{ margin: 0, fontFamily: "Inter, system-ui, sans-serif", background: "#0b1210", color: "#e5e7eb" }}>
        <main style={{ maxWidth: 1100, margin: "0 auto", padding: 24 }}>{children}</main>
      </body>
    </html>
  );
}
