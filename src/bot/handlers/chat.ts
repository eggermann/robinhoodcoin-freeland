import type { Bot } from "grammy";
import type { SoulNetwork } from "../../soul/network.js";
import { generatePersonalWelcome, matchFAQ } from "../../soul/community.js";
import { ensureMember, touchMemberActivity } from "../../soul/member-ledger.js";
import { handleAsk } from "../commands/ask.js";
import { replyPlain } from "../telegram-reply.js";
import type { BotContext } from "../types.js";

export interface ChatHandlerOptions {
  aiEnabled: boolean;
}

export function registerChatHandlers(
  bot: Bot<BotContext>,
  soulNet: SoulNetwork,
  options: ChatHandlerOptions,
): void {
  bot.on("message:new_chat_members", async (ctx) => {
    const members = ctx.message.new_chat_members;
    for (const member of members) {
      if (member.is_bot) continue;
      const name = member.first_name ?? member.username ?? "friend";
      ensureMember(member.id.toString(), {
        username: member.username ?? undefined,
        displayName: name,
      });
      const welcome = generatePersonalWelcome(name);
      await replyPlain(ctx, welcome);

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

    touchMemberActivity(String(ctx.from?.id ?? "unknown-user"), {
      username: ctx.from?.username ?? undefined,
      displayName: [ctx.from?.first_name, ctx.from?.last_name].filter(Boolean).join(" ").trim() || undefined,
    });

    const text = ctx.message.text;
    const isDM = ctx.chat.type === "private";
    const mentionsBot = text.toLowerCase().includes("@robinhoodcoinbot");

    if (!isDM && !mentionsBot) return;

    const faqAnswer = matchFAQ(text);
    if (faqAnswer) {
      await ctx.reply(faqAnswer);
      return;
    }

    if (!options.aiEnabled) {
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
