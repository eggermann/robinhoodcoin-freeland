import type { Bot } from "grammy";
import type { SoulNetwork } from "../../soul/network.js";
import { generatePersonalWelcome, matchFAQ } from "../../soul/community.js";
import { handleAsk } from "../commands/ask.js";
import type { BotContext } from "../types.js";

export function registerChatHandlers(
  bot: Bot<BotContext>,
  soulNet: SoulNetwork,
): void {
  bot.on("message:new_chat_members", async (ctx) => {
    const members = ctx.message.new_chat_members;
    for (const member of members) {
      if (member.is_bot) continue;
      const name = member.first_name ?? member.username ?? "friend";
      const welcome = generatePersonalWelcome(name);
      await ctx.reply(welcome, { parse_mode: "Markdown" });

      soulNet.recordInfluence({
        platform: "telegram",
        community: ctx.chat.title ?? "DM",
        action: `Welcomed new member: ${name}`,
        outcome: "Welcome message sent",
        timestamp: new Date().toISOString(),
      });
    }
  });

  bot.on("message:text", async (ctx) => {
    ctx.session.messageCount++;
    ctx.session.lastActive = new Date().toISOString();

    const text = ctx.message.text;
    const isDM = ctx.chat.type === "private";
    const mentionsBot = text.toLowerCase().includes("@robinhoodcoinbot");

    if (!isDM && !mentionsBot) return;

    const faqAnswer = matchFAQ(text);
    if (faqAnswer) {
      await ctx.reply(faqAnswer);
      return;
    }

    await handleAsk(ctx, text);

    if (!isDM) {
      soulNet.recordInfluence({
        platform: "telegram",
        community: ctx.chat.title ?? "unknown",
        action: `Answered question: "${text.slice(0, 50)}…"`,
        outcome: "AI response provided",
        timestamp: new Date().toISOString(),
      });
    }
  });
}
