import type { Bot } from "grammy";
import { AUTOCLAW } from "../../shared/config.js";
import {
  formatOpenClawAutonomyCycle,
  runOpenClawAutonomyCycle,
} from "../../soul/skills/openclaw-autonomous-roles.js";
import type { BotContext } from "../types.js";

function shouldNotify(report: Awaited<ReturnType<typeof runOpenClawAutonomyCycle>>): boolean {
  return report.roles.some((role) => role.alerts.length > 0 || Boolean(role.error));
}

export function startOpenClawAutonomyLoop(
  bot: Bot<BotContext>,
): NodeJS.Timeout | null {
  if (!AUTOCLAW.enabled) {
    console.log("🤖 OpenClaw autonomous role loop disabled (set OPENCLAW_AUTONOMOUS_ENABLED=true).");
    return null;
  }

  let running = false;
  const executeCycle = async (): Promise<void> => {
    if (running) {
      console.log("🤖 Skipping OpenClaw autonomy cycle: previous run still in progress.");
      return;
    }

    running = true;
    try {
      const report = await runOpenClawAutonomyCycle({
        roles: AUTOCLAW.roles,
        maxTokens: AUTOCLAW.maxTokens,
        temperature: AUTOCLAW.temperature,
      });

      console.log(
        `🤖 OpenClaw autonomy cycle complete: roles=${report.roles.length}, alerts=${report.roles.reduce((n, r) => n + r.alerts.length, 0)}`,
      );

      if (AUTOCLAW.notifyChatId.trim().length > 0 && shouldNotify(report)) {
        try {
          await bot.api.sendMessage(
            AUTOCLAW.notifyChatId,
            formatOpenClawAutonomyCycle(report),
            { parse_mode: "Markdown" },
          );
        } catch (err) {
          console.error("OpenClaw autonomy notification failed:", err);
        }
      }
    } catch (err) {
      console.error("OpenClaw autonomy cycle crashed:", err);
    } finally {
      running = false;
    }
  };

  if (AUTOCLAW.runOnBoot) {
    void executeCycle();
  }

  console.log(
    `🤖 OpenClaw autonomous role loop enabled (${AUTOCLAW.intervalMs}ms interval).`,
  );
  return setInterval(() => {
    void executeCycle();
  }, AUTOCLAW.intervalMs);
}
