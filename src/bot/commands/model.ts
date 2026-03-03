import type { Context } from "grammy";
import { AI, BOT } from "../../shared/config.js";
import {
  applyRuntimeModelSwitchEffects,
  getRuntimeModelStatus,
  resetActiveRuntimeModel,
  setActiveRuntimeModel,
  type RuntimeModelSwitchEffects,
} from "../ai-runtime.js";

function isAdminUser(ctx: Context): boolean {
  const userId = ctx.from?.id?.toString();
  if (!userId) return false;
  return BOT.adminIds.includes(userId);
}

function parseModelArg(text: string): string {
  return text.replace(/^\/model(@\w+)?\s*/i, "").trim();
}

function formatModelStatus(): string {
  const status = getRuntimeModelStatus();
  const lines = status.available.map((model) => {
    const marker = model.id === status.active ? "✅" : model.enabled ? "▫️" : "⛔";
    const detail = model.enabled
      ? model.label
      : `${model.label} — ${model.reasonDisabled ?? "disabled"}`;
    return `${marker} \`${model.id}\` -> ${detail}`;
  });

  const active = status.active ?? "none";
  const fallback = status.autoSwitch ? "enabled" : "disabled";
  const order = status.configuredOrder.length > 0
    ? status.configuredOrder.join(", ")
    : "none";

  return [
    "🤖 *AI Runtime Models*",
    `Active: \`${active}\``,
    `Auto-switch: *${fallback}*`,
    `Order: \`${order}\``,
    "",
    ...lines,
    "",
    "Usage: `/model` or `/model <openclaw|nvidia-kimi>`",
    "Reset to default: `/model auto`",
  ].join("\n");
}

function formatSwitchEffects(effects: RuntimeModelSwitchEffects): string {
  const notes: string[] = [];

  if (effects.persisted) {
    if (effects.persistPath) {
      notes.push(`💾 Persisted default model in \`${effects.persistPath}\`.`);
    }
  } else {
    notes.push(`⚠️ Persist failed: ${effects.persistError ?? "unknown error"}`);
  }

  if (effects.restartReason) {
    const prefix = effects.restartScheduled ? "♻️" : "ℹ️";
    notes.push(`${prefix} Restart: ${effects.restartReason}.`);
  }

  return notes.join("\n");
}

export async function handleModel(ctx: Context): Promise<void> {
  if (AI.provider !== "openclaw") {
    await ctx.reply(
      "ℹ️ Runtime model switching is available when AI_PROVIDER=openclaw.",
    );
    return;
  }

  if (BOT.adminIds.length > 0 && !isAdminUser(ctx)) {
    await ctx.reply("❌ Only configured bot admins can switch runtime models.");
    return;
  }

  const arg = parseModelArg(ctx.message?.text ?? "");
  if (!arg) {
    await ctx.reply(formatModelStatus(), { parse_mode: "Markdown" });
    return;
  }

  if (arg.toLowerCase() === "auto" || arg.toLowerCase() === "reset") {
    const next = resetActiveRuntimeModel();
    if (!next) {
      await ctx.reply(
        "⚠️ No default runtime model is currently available. Check /model and .env.",
        { parse_mode: "Markdown" },
      );
      return;
    }

    const effects = await applyRuntimeModelSwitchEffects(next, "manual");
    await ctx.reply(
      [
        `✅ Runtime model reset to default: \`${next}\`.`,
        formatSwitchEffects(effects),
      ].filter(Boolean).join("\n"),
      { parse_mode: "Markdown" },
    );
    return;
  }

  const result = setActiveRuntimeModel(arg);
  const effects = result.ok && result.active
    ? await applyRuntimeModelSwitchEffects(result.active, "manual")
    : null;
  await ctx.reply(
    result.ok
      ? [
        `✅ ${result.message}`,
        effects ? formatSwitchEffects(effects) : "",
      ].filter(Boolean).join("\n")
      : `❌ ${result.message}`,
    { parse_mode: "Markdown" },
  );
}
