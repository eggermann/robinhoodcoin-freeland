import type { Context } from "grammy";
import { BOT } from "../../shared/config.js";
import {
  formatOpenClawAutonomousExperience,
  runOpenClawAutonomousExperience,
} from "../../soul/skills/openclaw-autonomous-experience.js";
import { replyPlain } from "../telegram-reply.js";

function isAdminUser(ctx: Context): boolean {
  const userId = ctx.from?.id?.toString();
  if (!userId) return false;
  return BOT.adminIds.includes(userId);
}

export async function handleAutonomy(ctx: Context): Promise<void> {
  if (BOT.adminIds.length > 0 && !isAdminUser(ctx)) {
    await ctx.reply("❌ Only configured bot admins can trigger autonomous experience cycles.");
    return;
  }

  await ctx.reply("🤖 Running OpenClaw autonomous RobinHood experience cycle...");

  try {
    const report = await runOpenClawAutonomousExperience();
    await replyPlain(ctx, formatOpenClawAutonomousExperience(report));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await ctx.reply(`❌ Autonomous experience failed: ${message}`);
  }
}
