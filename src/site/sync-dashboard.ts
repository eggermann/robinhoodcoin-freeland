import { syncWebDashboardData } from "../soul/web-dashboard.js";

async function main(): Promise<void> {
  const outputPath = process.argv[2];
  const dashboard = await syncWebDashboardData(outputPath);

  console.log("🌐 Web dashboard data synced");
  console.log(`   Generated at: ${dashboard.generatedAt}`);
  console.log(`   Output stats: ${dashboard.stats.parcelsAcquired} parcels, ${dashboard.stats.stampsMinted} stamps, ${dashboard.stats.clanMembers} members`);
}

main().catch((err) => {
  console.error("❌ Failed to sync web dashboard data:", err);
  process.exit(1);
});
