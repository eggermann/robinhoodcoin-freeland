import type { Bot } from "grammy";
import { AUTOSCOUT } from "../../shared/config.js";
import {
  formatScoutReport,
  runAutonomousLandScoutCycle,
} from "../../soul/skills/autonomous-land-scout.js";
import { sendPlain } from "../telegram-reply.js";
import type { BotContext } from "../types.js";

export function startLandScoutLoop(
  bot: Bot<BotContext>,
): NodeJS.Timeout | null {
  if (!AUTOSCOUT.enabled) {
    console.log("🧭 Autonomous land scout disabled (set LAND_SCOUT_AUTONOMOUS_ENABLED=true to enable).");
    return null;
  }

  let running = false;
  const executeCycle = async (): Promise<void> => {
    if (running) {
      console.log("🧭 Skipping land scout cycle: previous run still in progress.");
      return;
    }

    running = true;
    try {
      const report = await runAutonomousLandScoutCycle({
        maxCandidatesPerRun: AUTOSCOUT.maxCandidatesPerRun,
        shortlistMinScore: AUTOSCOUT.shortlistMinScore,
        verifySourceReachability: AUTOSCOUT.verifySourceReachability,
        sourceTimeoutMs: AUTOSCOUT.sourceTimeoutMs,
        regionHint: AUTOSCOUT.regionHint,
      });

      console.log(
        `🧭 Land scout cycle complete: added=${report.added}, shortlisted=${report.shortlisted}, rejected=${report.rejected}`,
      );

      if (AUTOSCOUT.notifyChatId.trim().length > 0) {
        try {
          await sendPlain(bot.api, AUTOSCOUT.notifyChatId, formatScoutReport(report));
        } catch (err) {
          console.error("Land scout notification failed:", err);
        }
      }
    } catch (err) {
      console.error("Land scout cycle crashed:", err);
    } finally {
      running = false;
    }
  };

  if (AUTOSCOUT.runOnBoot) {
    void executeCycle();
  }

  console.log(`🧭 Autonomous land scout enabled (${AUTOSCOUT.intervalMs}ms interval).`);
  return setInterval(() => {
    void executeCycle();
  }, AUTOSCOUT.intervalMs);
}
