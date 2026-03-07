import { CHARTER } from "../../shared/charter.js";
import {
  AUTOCLAW,
  AUTOFINANCE,
  AUTOSCOUT,
} from "../../shared/config.js";
import {
  runAutonomousFinanceCycle,
  type AutonomousFinanceConfig,
  type AutonomousFinanceReport,
} from "./autonomous-finance-monitor.js";
import {
  runAutonomousLandScoutCycle,
  type AutonomousLandScoutConfig,
  type AutonomousLandScoutReport,
} from "./autonomous-land-scout.js";
import {
  runOpenClawAutonomyCycle,
  type OpenClawAutonomyConfig,
  type OpenClawAutonomyCycleReport,
} from "./openclaw-autonomous-roles.js";
import {
  runOpenClawDaoUserStampDriver,
  type OpenClawFusionReport,
} from "./openclaw-dao-user-stamp-driver.js";
import {
  syncLandSearchIntoPrisma,
  type PrismaLandSyncReport,
} from "../../tools/sync-land-search-to-prisma.js";

export interface OpenClawAutonomousExperienceConfig {
  roleCycle: OpenClawAutonomyConfig;
  landScout: AutonomousLandScoutConfig;
  financeMonitor: AutonomousFinanceConfig;
}

export interface OpenClawAutonomousExperienceReport {
  startedAt: string;
  finishedAt: string;
  landScout: AutonomousLandScoutReport;
  prismaSync: PrismaLandSyncReport | null;
  financeMonitor: AutonomousFinanceReport;
  roleCycle: OpenClawAutonomyCycleReport;
  fusion: OpenClawFusionReport;
  totalActions: number;
  totalAlerts: number;
  topActions: string[];
  topAlerts: string[];
  errors: string[];
}

function defaultExperienceConfig(): OpenClawAutonomousExperienceConfig {
  return {
    roleCycle: {
      roles: AUTOCLAW.roles,
      maxTokens: AUTOCLAW.maxTokens,
      temperature: AUTOCLAW.temperature,
    },
    landScout: {
      maxCandidatesPerRun: AUTOSCOUT.maxCandidatesPerRun,
      shortlistMinScore: AUTOSCOUT.shortlistMinScore,
      verifySourceReachability: AUTOSCOUT.verifySourceReachability,
      sourceTimeoutMs: AUTOSCOUT.sourceTimeoutMs,
      regionHint: AUTOSCOUT.regionHint,
    },
    financeMonitor: {
      minBalanceSolAlert: AUTOFINANCE.minBalanceSolAlert,
      largeOutflowSolAlert: AUTOFINANCE.largeOutflowSolAlert,
      largeInflowSolAlert: AUTOFINANCE.largeInflowSolAlert,
    },
  };
}

function fallbackLandScoutReport(error: string): AutonomousLandScoutReport {
  const now = new Date().toISOString();
  return {
    startedAt: now,
    finishedAt: now,
    configured: false,
    routedAgentId: "land-scout",
    requested: 0,
    received: 0,
    added: 0,
    shortlisted: 0,
    rejected: 0,
    checks: [],
    error,
  };
}

function fallbackFinanceReport(error: string): AutonomousFinanceReport {
  const now = new Date().toISOString();
  return {
    startedAt: now,
    finishedAt: now,
    snapshot: {
      configured: false,
      address: null,
      balanceLamports: 0,
      balanceSOL: 0,
      cluster: "custom",
      rpcEndpoint: "",
      explorerUrl: null,
      fetchedAt: now,
      error,
    },
    previousBalanceSOL: null,
    deltaSOL: null,
    alerts: [],
    error,
  };
}

function fallbackRoleCycle(error: string): OpenClawAutonomyCycleReport {
  const now = new Date().toISOString();
  return {
    startedAt: now,
    finishedAt: now,
    roles: [
      {
        role: "soul",
        agentId: "soul",
        startedAt: now,
        finishedAt: now,
        summary: "Role execution failed.",
        actions: [],
        alerts: [error],
        raw: "",
        error,
      },
    ],
  };
}

function fallbackFusionReport(error: string): OpenClawFusionReport {
  const now = new Date().toISOString();
  return {
    startedAt: now,
    finishedAt: now,
    summary: "Fusion driver failed.",
    actionsRequested: [],
    executed: [],
    skipped: [],
    errors: [error],
    raw: "",
  };
}

function sumRoleAlerts(cycle: OpenClawAutonomyCycleReport): number {
  return cycle.roles.reduce((sum, role) => sum + role.alerts.length + (role.error ? 1 : 0), 0);
}

function signed(value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "n/a";
  return `${value >= 0 ? "+" : ""}${value.toFixed(4)} SOL`;
}

function roleActions(cycle: OpenClawAutonomyCycleReport): string[] {
  return cycle.roles
    .flatMap((role) => role.actions.map((action) => `${role.role}: ${action}`));
}

function fusionActions(report: OpenClawFusionReport): string[] {
  return report.executed.map((action) => `fusion: ${action}`);
}

function roleAlerts(cycle: OpenClawAutonomyCycleReport): string[] {
  return cycle.roles.flatMap((role) => {
    const fromAlerts = role.alerts.map((alert) => `${role.role}: ${alert}`);
    const fromError = role.error ? [`${role.role}: ${role.error}`] : [];
    return [...fromAlerts, ...fromError];
  });
}

function financeAlerts(report: AutonomousFinanceReport): string[] {
  const alerts = report.alerts.map((alert) => `finance (${alert.severity}): ${alert.message}`);
  if (report.error) alerts.unshift(`finance: ${report.error}`);
  return alerts;
}

function landScoutAlerts(report: AutonomousLandScoutReport): string[] {
  if (!report.error) return [];
  return [`land-scout: ${report.error}`];
}

function fusionAlerts(report: OpenClawFusionReport): string[] {
  return report.errors.map((error) => `fusion: ${error}`);
}

export async function runOpenClawAutonomousExperience(
  config: OpenClawAutonomousExperienceConfig = defaultExperienceConfig(),
): Promise<OpenClawAutonomousExperienceReport> {
  const startedAt = new Date().toISOString();
  const errors: string[] = [];

  const landScout = await runAutonomousLandScoutCycle(config.landScout)
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`land-scout: ${message}`);
      return fallbackLandScoutReport(message);
    });

  const prismaSync = await syncLandSearchIntoPrisma()
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`prisma-sync: ${message}`);
      return {
        ok: false,
        synced: 0,
        shortlisted: 0,
        stdout: "",
        stderr: "",
        error: message,
      };
    });

  if (!prismaSync.ok) {
    errors.push(`prisma-sync: ${(prismaSync.error ?? prismaSync.stderr) || "unknown sync failure"}`);
  }

  const financeMonitor = await runAutonomousFinanceCycle(config.financeMonitor)
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`finance: ${message}`);
      return fallbackFinanceReport(message);
    });

  const roleCycle = await runOpenClawAutonomyCycle(config.roleCycle)
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`roles: ${message}`);
      return fallbackRoleCycle(message);
    });

  const fusion = await runOpenClawDaoUserStampDriver()
    .catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`fusion: ${message}`);
      return fallbackFusionReport(message);
    });

  const actionList = [...roleActions(roleCycle), ...fusionActions(fusion)];
  const topActions = actionList.slice(0, 8);
  const topAlerts = [
    ...landScoutAlerts(landScout),
    ...(prismaSync.ok ? [] : [`prisma-sync: ${(prismaSync.error ?? prismaSync.stderr) || "failed"}`]),
    ...financeAlerts(financeMonitor),
    ...roleAlerts(roleCycle),
    ...fusionAlerts(fusion),
  ].slice(0, 10);

  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    landScout,
    prismaSync,
    financeMonitor,
    roleCycle,
    fusion,
    totalActions: actionList.length,
    totalAlerts:
      landScoutAlerts(landScout).length
      + financeAlerts(financeMonitor).length
      + sumRoleAlerts(roleCycle)
      + fusionAlerts(fusion).length,
    topActions,
    topAlerts,
    errors,
  };
}

export function formatOpenClawAutonomousExperience(
  report: OpenClawAutonomousExperienceReport,
): string {
  const durationSec = Math.max(
    0,
    Math.round((new Date(report.finishedAt).getTime() - new Date(report.startedAt).getTime()) / 1000),
  );

  const treasuryPolicy = [
    `${(CHARTER.treasury.landAcquisition * 100).toFixed(0)}% land`,
    `${(CHARTER.treasury.charitableCauses * 100).toFixed(0)}% causes`,
    `${(CHARTER.treasury.operations * 100).toFixed(0)}% ops`,
  ].join(" | ");

  const landLine = report.landScout.error
    ? `❌ land-scout failed: ${report.landScout.error}`
    : `✅ land-scout: added ${report.landScout.added}, shortlisted ${report.landScout.shortlisted}, rejected ${report.landScout.rejected}`;
  const syncLine = report.prismaSync && report.prismaSync.ok
    ? `🗃️ prisma sync: ${report.prismaSync.synced} listings mirrored (${report.prismaSync.shortlisted} shortlisted)`
    : `❌ prisma sync failed: ${report.prismaSync?.error ?? report.prismaSync?.stderr ?? "not run"}`;

  const financeLine = report.financeMonitor.error
    ? `❌ finance failed: ${report.financeMonitor.error}`
    : `${report.financeMonitor.alerts.length > 0 ? "⚠️" : "✅"} finance: ${report.financeMonitor.snapshot.balanceSOL.toFixed(4)} SOL (delta ${signed(report.financeMonitor.deltaSOL)})`;

  const roleLine = `🤖 role council: ${report.roleCycle.roles.length} roles, ${report.totalActions} actions, ${sumRoleAlerts(report.roleCycle)} alerts`;
  const fusionLine = report.fusion.errors.length > 0
    ? `🧩 fusion driver: ${report.fusion.executed.length} executed, ${report.fusion.errors.length} errors`
    : `🧩 fusion driver: ${report.fusion.executed.length} executed, ${report.fusion.skipped.length} skipped`;

  const actionsBlock = report.topActions.length > 0
    ? `\n\n🎯 *Top actions*\n${report.topActions.map((action) => `- ${action}`).join("\n")}`
    : "";

  const alertsBlock = report.topAlerts.length > 0
    ? `\n\n⚠️ *Top alerts*\n${report.topAlerts.map((alert) => `- ${alert}`).join("\n")}`
    : "\n\n✅ No alerts in this cycle.";

  const errorsBlock = report.errors.length > 0
    ? `\n\n❌ *Runtime errors*\n${report.errors.map((error) => `- ${error}`).join("\n")}`
    : "";

  return [
    "🤖 *OpenClaw Autonomous RobinHood Experience*",
    `Duration: ${durationSec}s`,
    `Policy: ${treasuryPolicy}`,
    landLine,
    syncLine,
    financeLine,
    roleLine,
    fusionLine,
    actionsBlock,
    alertsBlock,
    errorsBlock,
    "\n_The forest grows one tree at a time._",
  ].join("\n");
}
