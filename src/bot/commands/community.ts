import type { Context } from "grammy";
import { createReminder, getUpcomingEvents } from "../../soul/community.js";
import { formatReportTelegram, generateReport } from "../../soul/reporting.js";
import { syncWebDashboardData } from "../../soul/web-dashboard.js";

export async function handleEvents(ctx: Context): Promise<void> {
  const events = getUpcomingEvents();

  if (events.length === 0) {
    await ctx.reply("📅 No upcoming events. Suggest one to the team!");
    return;
  }

  const lines = events.map((event) =>
    `📅 *${event.title}*\n   📍 ${event.location}\n   🕐 ${new Date(event.date).toLocaleDateString()}\n   👥 ${event.rsvps.length} RSVP(s)`,
  );

  await ctx.reply(
    `📅 *Upcoming Events*\n\n${lines.join("\n\n")}`,
    { parse_mode: "Markdown" },
  );
}

export async function handleReport(ctx: Context): Promise<void> {
  await ctx.replyWithChatAction("typing");

  try {
    const treasuryAddr = process.env.TREASURY_MULTISIG_ADDRESS;
    const report = await generateReport(treasuryAddr);
    try {
      await syncWebDashboardData();
    } catch (syncErr) {
      console.error("Web dashboard sync failed after report generation:", syncErr);
    }
    const formatted = formatReportTelegram(report);
    await ctx.reply(formatted, { parse_mode: "Markdown" });
  } catch (err) {
    console.error("Report generation failed:", err);
    await ctx.reply("❌ Could not generate report. Try again later.");
  }
}

export async function handleRemind(ctx: Context): Promise<void> {
  const text = ctx.message?.text ?? "";
  const args = text.replace(/^\/remind\s*/, "").trim();

  if (!args) {
    await ctx.reply(
      "⏰ *Set a Reminder*\n\nUsage: `/remind <minutes> <message>`\n\nExample: `/remind 60 Check the treasury balance`",
      { parse_mode: "Markdown" },
    );
    return;
  }

  const match = args.match(/^(\d+)\s+(.+)$/);
  if (!match) {
    await ctx.reply("Usage: `/remind <minutes> <message>`", { parse_mode: "Markdown" });
    return;
  }

  const minutes = parseInt(match[1], 10);
  const message = match[2];
  const fireAt = new Date(Date.now() + minutes * 60_000).toISOString();
  const chatId = ctx.chat?.id?.toString() ?? "";
  const userId = ctx.from?.id?.toString() ?? "unknown";

  createReminder(message, fireAt, userId, chatId);
  await ctx.reply(`⏰ Reminder set! I'll remind you in ${minutes} minute(s): "${message}"`);
}
