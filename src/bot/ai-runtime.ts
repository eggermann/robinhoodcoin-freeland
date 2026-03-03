import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { AI_RUNTIME, NVIDIA, OPENCLAW } from "../shared/config.js";

export type RuntimeModelId = "openclaw" | "nvidia-kimi";
export type RuntimeSwitchTrigger = "manual" | "auto";

interface RuntimeModelDescriptor {
  id: RuntimeModelId;
  label: string;
  enabled: boolean;
  reasonDisabled?: string;
}

export interface RuntimeModelStatus {
  active: RuntimeModelId | null;
  configuredOrder: RuntimeModelId[];
  defaultModel: RuntimeModelId | null;
  autoSwitch: boolean;
  available: RuntimeModelDescriptor[];
}

export interface RuntimeModelSwitchEffects {
  persisted: boolean;
  persistPath?: string;
  persistError?: string;
  restartScheduled: boolean;
  restartReason?: string;
}

const KNOWN_MODELS: RuntimeModelId[] = ["openclaw", "nvidia-kimi"];

// OpenClaw model id (as configured on the OpenClaw host allowlist).
export const OPENCLAW_NVIDIA_KIMI_MODEL_ID = "nvidia/moonshotai/kimi-k2.5";

export function getOpenClawModelOverrideForRuntime(
  modelId: RuntimeModelId,
): string | null {
  switch (modelId) {
    case "nvidia-kimi":
      return OPENCLAW_NVIDIA_KIMI_MODEL_ID;
    case "openclaw":
    default:
      return null;
  }
}

const MODEL_ALIASES: Record<string, RuntimeModelId> = {
  openclaw: "openclaw",
  claw: "openclaw",
  gateway: "openclaw",
  nvidia: "nvidia-kimi",
  kimi: "nvidia-kimi",
  "nvidia-kimi": "nvidia-kimi",
  "kimi-k2.5": "nvidia-kimi",
  "kimi-k2": "nvidia-kimi",
};

let activeModel: RuntimeModelId | null = null;
let restartPending = false;

function escapeRegex(raw: string): string {
  return raw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function upsertEnvVariable(content: string, key: string, value: string): string {
  const lines = content.length > 0 ? content.split(/\r?\n/) : [];
  const matcher = new RegExp(`^\\s*${escapeRegex(key)}\\s*=`);
  let replaced = false;

  const nextLines = lines.map((line) => {
    if (!matcher.test(line)) return line;
    replaced = true;
    return `${key}=${value}`;
  });

  if (!replaced) {
    if (nextLines.length > 0 && nextLines[nextLines.length - 1].trim() !== "") {
      nextLines.push("");
    }
    nextLines.push(`${key}=${value}`);
  }

  let result = nextLines.join("\n");
  if (!result.endsWith("\n")) {
    result += "\n";
  }
  return result;
}

async function persistDefaultModel(modelId: RuntimeModelId): Promise<{
  ok: boolean;
  path?: string;
  error?: string;
}> {
  const persistFile = AI_RUNTIME.persistFile.trim();
  if (!persistFile) {
    return { ok: true };
  }

  const resolvedPath = path.resolve(persistFile);

  try {
    let current = "";
    try {
      current = await fs.readFile(resolvedPath, "utf-8");
    } catch (err) {
      const maybe = err as NodeJS.ErrnoException;
      if (maybe.code !== "ENOENT") {
        throw err;
      }
    }

    const next = upsertEnvVariable(current, "AI_RUNTIME_DEFAULT_MODEL", modelId);
    await fs.mkdir(path.dirname(resolvedPath), { recursive: true });
    await fs.writeFile(resolvedPath, next, "utf-8");

    return { ok: true, path: resolvedPath };
  } catch (err) {
    return {
      ok: false,
      path: resolvedPath,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

function isRestartEnabledFor(trigger: RuntimeSwitchTrigger): boolean {
  return trigger === "manual"
    ? AI_RUNTIME.restartOnManualSwitch
    : AI_RUNTIME.restartOnAutoSwitch;
}

function scheduleRestart(trigger: RuntimeSwitchTrigger): {
  scheduled: boolean;
  reason: string;
} {
  const command = AI_RUNTIME.restartCommand.trim();
  if (!command) {
    return { scheduled: false, reason: "AI_RUNTIME_RESTART_COMMAND is empty" };
  }

  if (!isRestartEnabledFor(trigger)) {
    return {
      scheduled: false,
      reason: trigger === "manual"
        ? "AI_RUNTIME_RESTART_ON_MANUAL_SWITCH=false"
        : "AI_RUNTIME_RESTART_ON_AUTO_SWITCH=false",
    };
  }

  if (restartPending) {
    return { scheduled: false, reason: "restart already pending" };
  }

  restartPending = true;
  const delayMs = Math.max(0, AI_RUNTIME.restartDelayMs);

  setTimeout(() => {
    try {
      const child = spawn("sh", ["-lc", command], {
        detached: true,
        stdio: "ignore",
      });
      child.unref();
    } catch (err) {
      console.error("Runtime restart command failed:", err);
    } finally {
      restartPending = false;
    }
  }, delayMs);

  return { scheduled: true, reason: `restart scheduled in ${delayMs}ms` };
}

function normalizeModelToken(raw: string): string {
  return raw.trim().toLowerCase().replace(/_/g, "-");
}

function toRuntimeModelId(raw: string): RuntimeModelId | null {
  const normalized = normalizeModelToken(raw);
  return MODEL_ALIASES[normalized] ?? null;
}

function unique<T>(items: T[]): T[] {
  const seen = new Set<T>();
  const ordered: T[] = [];

  for (const item of items) {
    if (seen.has(item)) continue;
    seen.add(item);
    ordered.push(item);
  }

  return ordered;
}

function configuredOrder(): RuntimeModelId[] {
  const fromEnv = unique(
    AI_RUNTIME.modelOrder
      .map((item) => toRuntimeModelId(item))
      .filter((item): item is RuntimeModelId => Boolean(item)),
  );

  if (fromEnv.length > 0) return fromEnv;
  return [...KNOWN_MODELS];
}

function defaultModel(): RuntimeModelId | null {
  return toRuntimeModelId(AI_RUNTIME.defaultModel);
}

function buildDescriptors(): RuntimeModelDescriptor[] {
  const openClawReady = OPENCLAW.gatewayUrl.trim().length > 0;
  // `nvidia-kimi` is executed via the OpenClaw gateway (host holds NVIDIA_API_KEY),
  // so the bot does not need NVIDIA_API_KEY itself.
  const nvidiaReady = openClawReady && NVIDIA.enabled;

  return [
    {
      id: "openclaw",
      label: `openclaw (${OPENCLAW.model || "openclaw"})`,
      enabled: openClawReady,
      reasonDisabled: openClawReady ? undefined : "OPENCLAW_GATEWAY_URL is empty",
    },
    {
      id: "nvidia-kimi",
      label: `nvidia-kimi (openclaw: ${OPENCLAW_NVIDIA_KIMI_MODEL_ID})`,
      enabled: nvidiaReady,
      reasonDisabled: nvidiaReady
        ? undefined
        : NVIDIA.enabled
          ? "OPENCLAW_GATEWAY_URL is empty"
          : "NVIDIA_FALLBACK_ENABLED=false",
    },
  ];
}

function enabledModelSet(descriptors: RuntimeModelDescriptor[]): Set<RuntimeModelId> {
  return new Set(
    descriptors
      .filter((descriptor) => descriptor.enabled)
      .map((descriptor) => descriptor.id),
  );
}

function resolveInitialActiveModel(): RuntimeModelId | null {
  const descriptors = buildDescriptors();
  const enabled = enabledModelSet(descriptors);
  const order = configuredOrder().filter((id) => enabled.has(id));
  const preferred = defaultModel();

  if (preferred && order.includes(preferred)) {
    return preferred;
  }

  return order[0] ?? null;
}

function ensureActiveModel(): RuntimeModelId | null {
  if (activeModel === null) {
    activeModel = resolveInitialActiveModel();
    return activeModel;
  }

  const enabled = enabledModelSet(buildDescriptors());
  if (!enabled.has(activeModel)) {
    activeModel = resolveInitialActiveModel();
  }

  return activeModel;
}

function statusSnapshot(): RuntimeModelStatus {
  const descriptors = buildDescriptors();
  return {
    active: ensureActiveModel(),
    configuredOrder: configuredOrder(),
    defaultModel: defaultModel(),
    autoSwitch: AI_RUNTIME.autoSwitch,
    available: descriptors,
  };
}

export function getRuntimeModelStatus(): RuntimeModelStatus {
  return statusSnapshot();
}

export function getRuntimeModelLabel(modelId: RuntimeModelId): string {
  const descriptor = statusSnapshot().available.find((item) => item.id === modelId);
  return descriptor?.label ?? modelId;
}

export function getRuntimeModelAttemptOrder(): RuntimeModelId[] {
  const status = statusSnapshot();
  const enabled = new Set(
    status.available
      .filter((descriptor) => descriptor.enabled)
      .map((descriptor) => descriptor.id),
  );
  const orderedEnabled = status.configuredOrder.filter((modelId) => enabled.has(modelId));

  if (orderedEnabled.length === 0) return [];
  const current = status.active;
  if (!current || !enabled.has(current)) return orderedEnabled;

  return [current, ...orderedEnabled.filter((modelId) => modelId !== current)];
}

export function setActiveRuntimeModel(rawModelId: string): {
  ok: boolean;
  active: RuntimeModelId | null;
  message: string;
} {
  const requested = toRuntimeModelId(rawModelId);
  if (!requested) {
    return {
      ok: false,
      active: ensureActiveModel(),
      message: `Unknown model "${rawModelId}". Use /model to list supported ids.`,
    };
  }

  const status = statusSnapshot();
  const descriptor = status.available.find((item) => item.id === requested);
  if (!descriptor) {
    return {
      ok: false,
      active: ensureActiveModel(),
      message: `Model "${requested}" is not registered.`,
    };
  }

  if (!descriptor.enabled) {
    return {
      ok: false,
      active: ensureActiveModel(),
      message: `Model "${requested}" is not available: ${descriptor.reasonDisabled ?? "missing configuration"}.`,
    };
  }

  activeModel = requested;
  return {
    ok: true,
    active: activeModel,
    message: `Active model set to ${descriptor.label}.`,
  };
}

export function resetActiveRuntimeModel(): RuntimeModelId | null {
  activeModel = resolveInitialActiveModel();
  return activeModel;
}

export function autoSwitchRuntimeModel(nextModel: RuntimeModelId): boolean {
  if (!AI_RUNTIME.autoSwitch) return false;

  const descriptor = statusSnapshot().available.find((item) => item.id === nextModel);
  if (!descriptor?.enabled) return false;
  if (activeModel === nextModel) return false;

  activeModel = nextModel;
  return true;
}

export async function applyRuntimeModelSwitchEffects(
  modelId: RuntimeModelId,
  trigger: RuntimeSwitchTrigger,
): Promise<RuntimeModelSwitchEffects> {
  const persist = await persistDefaultModel(modelId);
  const restart = scheduleRestart(trigger);

  return {
    persisted: persist.ok,
    persistPath: persist.path,
    persistError: persist.ok ? undefined : persist.error ?? "unknown persist error",
    restartScheduled: restart.scheduled,
    restartReason: restart.reason,
  };
}
