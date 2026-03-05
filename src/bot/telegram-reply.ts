import type { Api, Context } from "grammy";
import { splitTelegramText, toPlainTelegramText } from "./telegram-text.js";

export async function replyPlain(ctx: Context, text: string): Promise<void> {
  const safeText = toPlainTelegramText(text);
  const parts = splitTelegramText(safeText);
  for (const part of parts) {
    await ctx.reply(part);
  }
}

export async function sendPlain(
  api: Api,
  chatId: string | number,
  text: string,
): Promise<void> {
  const safeText = toPlainTelegramText(text);
  const parts = splitTelegramText(safeText);
  for (const part of parts) {
    await api.sendMessage(chatId, part);
  }
}
