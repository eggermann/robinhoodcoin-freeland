import type { Context } from "grammy";

export async function handleHelp(ctx: Context): Promise<void> {
  await ctx.reply(
    `🏹 *RobinHoodCoin Soul — Commands*

*── Core ──*
/start — Welcome message
/mission — Our vision and charter
/treasury — Live treasury balance
/help — This help message

*── Governance ──*
/propose — Create a new proposal
/proposals — List all proposals
/proposal \`<ID>\` — View proposal details
/activate \`<ID>\` — Open voting
/vote \`<ID>\` \`<for|against>\` — Cast your vote
/finalize \`<ID>\` — Close voting & tally

*── Stamps & NFTs ──*
/stamps — Active stamp campaigns
/tiers — Stamp tier info & benefits

*── Community ──*
/events — Upcoming community events
/remind \`<mins>\` \`<msg>\` — Set a reminder
/report — Generate transparency report
/soul — Soul network status
/opportunities — Top grants, auctions, and sponsorship leads
/scout — Add a new grant/auction/sponsorship opportunity
/approveopp \`<OPP-ID>\` — Admin approval: convert opportunity into proposal

*── AI Q&A ──*
💬 Just *ask me anything* in a DM or mention @RobinHoodCoinBot in a group.

_I know the charter, the mission, and the precedents._
_Every conversation plants a seed. 🌿_

🔗 *Links*
• Website: robinhoodcoin.org
• Telegram: t.me/robinhoodcoin
• GitHub: github.com/robinhoodcoin`,
    { parse_mode: "Markdown" },
  );
}
