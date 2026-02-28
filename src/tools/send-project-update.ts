import fs from "node:fs";
import path from "node:path";
import { syncWebDashboardData } from "../soul/web-dashboard.js";
import { sendMail } from "../shared/mailer.js";

interface Candidate {
  id: string;
  title: string;
  location: string;
  sizeAcres: number;
  priceUSD: number;
  score: number;
  sourceUrl?: string;
}

function loadCandidates(): Candidate[] {
  const file = path.resolve("site/data/candidates.json");
  if (!fs.existsSync(file)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(file, "utf-8"));
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
}

function parseArgs(name: string): string {
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index === -1) return "";
  return process.argv[index + 1] ?? "";
}

async function main(): Promise<void> {
  const to = parseArgs("to") || process.env.SMTP_NOTIFY_TO || "";
  if (!to) {
    throw new Error("Missing recipient. Use --to you@example.com or set SMTP_NOTIFY_TO in .env");
  }

  const dashboard = await syncWebDashboardData();
  const candidates = loadCandidates()
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  const treasuryLine = dashboard.treasury.configured
    ? `${dashboard.treasury.balanceSOL.toFixed(4)} SOL (${dashboard.treasury.cluster})`
    : `not configured (${dashboard.treasury.error ?? "unknown error"})`;

  const topCandidatesText = candidates.length
    ? candidates
      .map((c, i) => `${i + 1}. ${c.title} — ${c.location} — $${c.priceUSD.toLocaleString()} — score ${c.score}`)
      .join("\n")
    : "No candidate entries available yet.";

  const subject = `RobinHoodCoin Update • ${new Date().toISOString().slice(0, 10)}`;

  const text = [
    "RobinHoodCoin Project Update",
    "",
    `Generated: ${dashboard.generatedAt}`,
    `Treasury: ${treasuryLine}`,
    `Shortlist count: ${dashboard.research.shortlistCount}`,
    `Active campaigns: ${dashboard.stats.activeCampaigns}`,
    `Parcels acquired: ${dashboard.stats.parcelsAcquired}`,
    "",
    "Top Candidate Leads:",
    topCandidatesText,
    "",
    "— Soul • RobinHoodCoin",
  ].join("\n");

  const htmlCandidates = candidates.length
    ? `<ol>${candidates.map((c) => `<li><strong>${c.title}</strong> — ${c.location} — $${c.priceUSD.toLocaleString()} — score ${c.score}${c.sourceUrl ? ` — <a href=\"${c.sourceUrl}\">listing</a>` : ""}</li>`).join("")}</ol>`
    : "<p>No candidate entries available yet.</p>";

  const html = `
    <h2>RobinHoodCoin Project Update</h2>
    <p><strong>Generated:</strong> ${dashboard.generatedAt}</p>
    <p><strong>Treasury:</strong> ${treasuryLine}</p>
    <p><strong>Shortlist count:</strong> ${dashboard.research.shortlistCount}</p>
    <p><strong>Active campaigns:</strong> ${dashboard.stats.activeCampaigns}</p>
    <p><strong>Parcels acquired:</strong> ${dashboard.stats.parcelsAcquired}</p>
    <h3>Top Candidate Leads</h3>
    ${htmlCandidates}
    <p>— Soul • RobinHoodCoin</p>
  `;

  await sendMail({ to, subject, text, html });
  console.log(`Project update sent to ${to}`);
}

main().catch((err) => {
  console.error("Failed to send project update:", err instanceof Error ? err.message : err);
  process.exit(1);
});
