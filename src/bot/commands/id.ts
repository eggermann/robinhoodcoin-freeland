import type { Context } from "grammy";
import { replyPlain } from "../telegram-reply.js";

export async function handleId(ctx: Context): Promise<void> {
  const userId = ctx.from?.id ? String(ctx.from.id) : "unknown";
  const chatId = ctx.chat?.id ? String(ctx.chat.id) : "unknown";
  const chatType = ctx.chat?.type ?? "unknown";

  const lines = [
    "🧾 *Telegram IDs*",
    `User ID: \`${userId}\``,
    `Chat ID: \`${chatId}\``,
    `Chat type: \`${chatType}\``,
    "",
    "To enable `/model` switching:",
    `Set \`BOT_ADMIN_IDS=${userId}\` in your \`.env\`, then restart the bot.`,
  ];

  await replyPlain(ctx, lines.join("\n"));
}
