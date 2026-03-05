import type { Bot } from "grammy";
import { getDueReminders, markReminderFired } from "../../soul/community.js";
import { sendPlain } from "../telegram-reply.js";
import type { BotContext } from "../types.js";

export function startReminderLoop(
  bot: Bot<BotContext>,
  intervalMs = 30_000,
): NodeJS.Timeout {
  return setInterval(async () => {
    const dueReminders = getDueReminders();
    for (const reminder of dueReminders) {
      try {
        await sendPlain(bot.api, reminder.chatId, `⏰ *Reminder*: ${reminder.message}`);
        markReminderFired(reminder.id);
      } catch (err) {
        console.error(`Failed to send reminder ${reminder.id}:`, err);
      }
    }
  }, intervalMs);
}
