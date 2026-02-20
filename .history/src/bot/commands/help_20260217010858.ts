import type { Context } from "grammy";

export async function handleHelp(ctx: Context): Promise<void> {
  await ctx.reply(
    `🏹 *RobinHoodCoin Bot — Commands*

/start — Welcome message
/mission — Our vision and goals
/treasury — Treasury balance & stats
/help — This help message

💬 You can also just *ask me anything* in a DM or by mentioning @RobinHoodCoinBot in a group.

🔗 *Links*
• Website: robinhoodcoin.org
• Freeland Stamps: robinhoodcoin.org/stamps
• DAO Governance: robinhoodcoin.org/dao`,
    { parse_mode: "Markdown" },
  );
}
