import type { Context } from "grammy";

export async function handleHelp(ctx: Context): Promise<void> {
  await ctx.reply(
    `🏹 *RobinHoodCoin Soul — Commands*

*── Core ──*
/start — Welcome message
/mission — Our vision and charter
/treasury — Live treasury balance
/id — Show your Telegram user ID (useful for admin setup)
/help — This help message

*── Governance ──*
/propose — Create a new proposal
/propose land_purchase must include a land from /lands
/proposals — List all proposals
/proposal \`<ID>\` — View proposal details
/activate \`<ID>\` — Open voting
/vote \`<ID>\` \`<for|against>\` — Cast your vote
/finalize \`<ID>\` — Close voting & tally

*── Stamps & NFTs ──*
/stamps — Active stamp campaigns
/tiers — Stamp tier info & benefits
/lands — List selectable lands (portfolio + shortlist)
/landstamp — Create a stamp batch from selected land (Wikipedia + semantic motifs)
/stampmint \`<CAMP-ID> <qty?>\` — Record stamp mint/support and update member weight
/member — Show your unified DAO + Stamp member profile

*── Community ──*
/events — Upcoming community events
/remind \`<mins>\` \`<msg>\` — Set a reminder
/report — Generate transparency report
/soul — Soul network status
/opportunities — Top grants, auctions, and sponsorship leads
/scout — Add a new grant/auction/sponsorship opportunity
/approveopp \`<OPP-ID>\` — Admin approval: convert opportunity into proposal
/autonomy — Run one full OpenClaw autonomous experience cycle now

*── AI Q&A ──*
💬 Just *ask me anything* in a DM or mention @RobinHoodCoinBot in a group.
/model \`<name?>\` — Show or switch runtime model (admins; OpenClaw mode)

_I know the charter, the mission, and the precedents._
_Every conversation plants a seed. 🌿_

🔗 *Links*
• Website: robinhoodcoin.org
• Telegram: t.me/robinhoodcoin
• GitHub: github.com/robinhoodcoin`,
    { parse_mode: "Markdown" },
  );
}
