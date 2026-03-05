import type { Context } from "grammy";
import { replyPlain } from "../telegram-reply.js";

export async function handleStart(ctx: Context): Promise<void> {
  await replyPlain(
    ctx,
    `🏹 *Welcome to the Robin Hood Clan!*

I'm the RobinHoodCoin bot — your guide to the Freeland initiative.

Our mission: pool crypto resources to buy *real land* for communities, governed by the people who fund it.

Freeland zones are *non-commercial commons*: no buying, selling, trade, shops, stores, or business transactions inside Freeland.

Here's what I can help with:
  /mission — Learn about our cause
  /treasury — Check the community treasury
  /help — See all commands

Ask me anything about RobinHoodCoin, Freeland Stamps, or the DAO!`,
  );
}
