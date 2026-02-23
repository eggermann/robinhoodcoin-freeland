import type { Bot } from "grammy";
import { getDueReminders, markReminderFired } from "../../soul/community.js";
import type { BotContext } from "../types.js";

export function startReminderLoop(
  bot: Bot<BotContext>,
  intervalMs = 30_000,
): NodeJS.Timeout {
  return setInterval(async () => {
    const dueReminders = getDueReminders();
    for (const reminder of dueReminders) {
      try {
        await bot.api.sendMessage(reminder.chatId, `⏰ *Reminder*: ${reminder.message}`, {
          parse_mode: "Markdown",
        });
        markReminderFired(reminder.id);
      } catch (err) {
        console.error(`Failed to send reminder ${reminder.id}:`, err);
      }
    }
  }, intervalMs);
}
