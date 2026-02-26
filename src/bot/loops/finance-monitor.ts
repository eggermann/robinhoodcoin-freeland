import type { Bot } from "grammy";
import { AUTOFINANCE } from "../../shared/config.js";
import {
  formatFinanceReport,
  runAutonomousFinanceCycle,
} from "../../soul/skills/autonomous-finance-monitor.js";
import type { BotContext } from "../types.js";

export function startFinanceMonitorLoop(
  bot: Bot<BotContext>,
): NodeJS.Timeout | null {
  if (!AUTOFINANCE.enabled) {
    console.log("💼 Autonomous finance monitor disabled (set FINANCE_MONITOR_ENABLED=true to enable).");
    return null;
  }

  let running = false;
  const executeCycle = async (): Promise<void> => {
    if (running) {
      console.log("💼 Skipping finance cycle: previous run still in progress.");
      return;
    }

    running = true;
    try {
      const report = await runAutonomousFinanceCycle({
        minBalanceSolAlert: AUTOFINANCE.minBalanceSolAlert,
        largeOutflowSolAlert: AUTOFINANCE.largeOutflowSolAlert,
        largeInflowSolAlert: AUTOFINANCE.largeInflowSolAlert,
      });

      console.log(
        `💼 Finance cycle complete: balance=${report.snapshot.balanceSOL.toFixed(4)} SOL, alerts=${report.alerts.length}`,
      );

      const shouldNotify = report.alerts.length > 0 || AUTOFINANCE.notifyOnNoAlert;
      if (shouldNotify && AUTOFINANCE.notifyChatId.trim().length > 0) {
        try {
          await bot.api.sendMessage(
            AUTOFINANCE.notifyChatId,
            formatFinanceReport(report),
            { parse_mode: "Markdown" },
          );
        } catch (err) {
          console.error("Finance monitor notification failed:", err);
        }
      }
    } catch (err) {
      console.error("Finance monitor cycle crashed:", err);
    } finally {
      running = false;
    }
  };

  if (AUTOFINANCE.runOnBoot) {
    void executeCycle();
  }

  console.log(`💼 Autonomous finance monitor enabled (${AUTOFINANCE.intervalMs}ms interval).`);
  return setInterval(() => {
    void executeCycle();
  }, AUTOFINANCE.intervalMs);
}
