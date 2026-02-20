import type { Context } from "grammy";

export async function handleMission(ctx: Context): Promise<void> {
  await ctx.reply(
    `🏹 *The RobinHoodCoin Mission*

We are a crypto-powered collective inspired by the legend of Robin Hood.

*Our two core objectives:*

1️⃣ *Acquire "Freeland"*
Purchase real land and designate it as self-governed, community-run zones — modern commons where people can live, gather, and create without the barriers of private ownership.

2️⃣ *Support Robin Hood Causes*
Allocate funds to charitable and social projects — helping the underprivileged, funding grassroots initiatives, echoing "take from the rich, give to the poor."

*How it works:*
• *RobinHoodCoin (RHC)* — Our governance token. Holders vote on land purchases, project funding, and DAO decisions.
• *Freeland Stamps* — Collectible NFTs that fund specific land acquisitions. Each stamp is a badge of contribution.
• *DAO Treasury* — All funds are held transparently on-chain. Every contribution and expenditure is trackable.

_"Wealth gathered through the coin is redistributed to worthy grassroots initiatives."_

Join the clan. Create freedom. 🌿`,
    { parse_mode: "Markdown" },
  );
}
