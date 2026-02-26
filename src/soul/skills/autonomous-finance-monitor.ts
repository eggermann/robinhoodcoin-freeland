import fs from "node:fs";
import path from "node:path";
import { getTreasuryBalanceSnapshot, type TreasuryTrackerSnapshot } from "./treasury-tracker.js";

const STATE_FILE = "./data/finance-monitor/state.json";
const REPORT_LOG_FILE = "./data/finance-monitor/report-log.jsonl";

export interface AutonomousFinanceConfig {
  minBalanceSolAlert: number;
  largeOutflowSolAlert: number;
  largeInflowSolAlert: number;
}

export type FinanceAlertType =
  | "treasury_unconfigured"
  | "low_balance"
  | "large_outflow"
  | "large_inflow";

export interface FinanceAlert {
  type: FinanceAlertType;
  message: string;
  severity: "info" | "warning" | "critical";
}

export interface FinanceMonitorState {
  lastBalanceSOL: number;
  lastFetchedAt: string;
}

export interface AutonomousFinanceReport {
  startedAt: string;
  finishedAt: string;
  snapshot: TreasuryTrackerSnapshot;
  previousBalanceSOL: number | null;
  deltaSOL: number | null;
  alerts: FinanceAlert[];
  error?: string;
}

function ensureDataDir(): void {
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
}

function readState(): FinanceMonitorState | null {
  try {
    if (!fs.existsSync(STATE_FILE)) return null;
    const parsed = JSON.parse(fs.readFileSync(STATE_FILE, "utf-8")) as Partial<FinanceMonitorState>;
    if (typeof parsed.lastBalanceSOL !== "number") return null;
    if (typeof parsed.lastFetchedAt !== "string") return null;
    return {
      lastBalanceSOL: parsed.lastBalanceSOL,
      lastFetchedAt: parsed.lastFetchedAt,
    };
  } catch {
    return null;
  }
}

function writeState(state: FinanceMonitorState): void {
  ensureDataDir();
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), "utf-8");
}

function appendReport(report: AutonomousFinanceReport): void {
  ensureDataDir();
  fs.appendFileSync(REPORT_LOG_FILE, `${JSON.stringify(report)}\n`, "utf-8");
}

function round4(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}

function evaluateAlerts(
  snapshot: TreasuryTrackerSnapshot,
  previousBalanceSOL: number | null,
  config: AutonomousFinanceConfig,
): FinanceAlert[] {
  const alerts: FinanceAlert[] = [];

  if (!snapshot.configured) {
    alerts.push({
      type: "treasury_unconfigured",
      severity: "critical",
      message: snapshot.error ?? "Treasury address is not configured.",
    });
    return alerts;
  }

  if (snapshot.balanceSOL < config.minBalanceSolAlert) {
    alerts.push({
      type: "low_balance",
      severity: "warning",
      message: `Treasury balance is low: ${snapshot.balanceSOL.toFixed(4)} SOL (< ${config.minBalanceSolAlert} SOL threshold).`,
    });
  }

  if (previousBalanceSOL !== null) {
    const delta = snapshot.balanceSOL - previousBalanceSOL;
    if (delta <= -Math.abs(config.largeOutflowSolAlert)) {
      alerts.push({
        type: "large_outflow",
        severity: "critical",
        message: `Large outflow detected: ${Math.abs(delta).toFixed(4)} SOL since last check.`,
      });
    } else if (delta >= Math.abs(config.largeInflowSolAlert)) {
      alerts.push({
        type: "large_inflow",
        severity: "info",
        message: `Large inflow detected: +${delta.toFixed(4)} SOL since last check.`,
      });
    }
  }

  return alerts;
}

export async function runAutonomousFinanceCycle(
  config: AutonomousFinanceConfig,
): Promise<AutonomousFinanceReport> {
  const startedAt = new Date().toISOString();
  const previous = readState();
  const previousBalanceSOL = previous?.lastBalanceSOL ?? null;

  let snapshot: TreasuryTrackerSnapshot = {
    configured: false,
    address: null,
    balanceLamports: 0,
    balanceSOL: 0,
    cluster: "custom",
    rpcEndpoint: "",
    explorerUrl: null,
    fetchedAt: startedAt,
  };

  const report: AutonomousFinanceReport = {
    startedAt,
    finishedAt: startedAt,
    snapshot,
    previousBalanceSOL,
    deltaSOL: null,
    alerts: [],
  };

  try {
    snapshot = await getTreasuryBalanceSnapshot();
    const deltaSOL = previousBalanceSOL === null
      ? null
      : round4(snapshot.balanceSOL - previousBalanceSOL);
    const alerts = evaluateAlerts(snapshot, previousBalanceSOL, config);

    report.snapshot = snapshot;
    report.deltaSOL = deltaSOL;
    report.alerts = alerts;

    writeState({
      lastBalanceSOL: snapshot.balanceSOL,
      lastFetchedAt: snapshot.fetchedAt,
    });
  } catch (err) {
    report.error = err instanceof Error ? err.message : String(err);
  } finally {
    report.finishedAt = new Date().toISOString();
    appendReport(report);
  }

  return report;
}

export function formatFinanceReport(report: AutonomousFinanceReport): string {
  const header = `💼 *Finance Monitor*`;
  const balanceLine = `Treasury: ${report.snapshot.balanceSOL.toFixed(4)} SOL`;
  const deltaLine = `Delta: ${report.deltaSOL === null ? "n/a (first run)" : `${report.deltaSOL >= 0 ? "+" : ""}${report.deltaSOL.toFixed(4)} SOL`}`;

  if (report.error) {
    return `${header}\n${balanceLine}\n${deltaLine}\n\n❌ Error: ${report.error}`;
  }

  if (report.alerts.length === 0) {
    return `${header}\n${balanceLine}\n${deltaLine}\n\n✅ No alert conditions triggered.`;
  }

  const alertLines = report.alerts
    .map((alert, idx) => `${idx + 1}. [${alert.severity}] ${alert.message}`)
    .join("\n");

  return `${header}\n${balanceLine}\n${deltaLine}\n\n⚠️ Alerts:\n${alertLines}`;
}
