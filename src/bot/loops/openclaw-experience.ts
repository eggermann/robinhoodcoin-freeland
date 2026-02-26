import type { Bot } from "grammy";
import { AUTOEXPERIENCE } from "../../shared/config.js";
import {
  formatOpenClawAutonomousExperience,
  runOpenClawAutonomousExperience,
  type OpenClawAutonomousExperienceReport,
} from "../../soul/skills/openclaw-autonomous-experience.js";
import type { BotContext } from "../types.js";

function shouldNotify(report: OpenClawAutonomousExperienceReport): boolean {
  if (AUTOEXPERIENCE.notifyOnNoAlert) return true;
  return report.totalAlerts > 0 || report.errors.length > 0;
}

export function startOpenClawExperienceLoop(
  bot: Bot<BotContext>,
): NodeJS.Timeout | null {
  if (!AUTOEXPERIENCE.enabled) {
    console.log("🤖 OpenClaw autonomous experience loop disabled (set OPENCLAW_EXPERIENCE_ENABLED=true).");
    return null;
  }

  let running = false;
  const executeCycle = async (): Promise<void> => {
    if (running) {
      console.log("🤖 Skipping autonomous experience cycle: previous run still in progress.");
      return;
    }

    running = true;
    try {
      const report = await runOpenClawAutonomousExperience();

      console.log(
        `🤖 Autonomous experience cycle complete: alerts=${report.totalAlerts}, actions=${report.totalActions}`,
      );

      if (AUTOEXPERIENCE.notifyChatId.trim().length > 0 && shouldNotify(report)) {
        try {
          await bot.api.sendMessage(
            AUTOEXPERIENCE.notifyChatId,
            formatOpenClawAutonomousExperience(report),
            { parse_mode: "Markdown" },
          );
        } catch (err) {
          console.error("OpenClaw autonomous experience notification failed:", err);
        }
      }
    } catch (err) {
      console.error("OpenClaw autonomous experience cycle crashed:", err);
    } finally {
      running = false;
    }
  };

  if (AUTOEXPERIENCE.runOnBoot) {
    void executeCycle();
  }

  console.log(
    `🤖 OpenClaw autonomous experience loop enabled (${AUTOEXPERIENCE.intervalMs}ms interval).`,
  );
  return setInterval(() => {
    void executeCycle();
  }, AUTOEXPERIENCE.intervalMs);
}
