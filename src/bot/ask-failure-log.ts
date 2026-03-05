import fs from "node:fs";
import path from "node:path";
import type { AskMemoryScope } from "./commands/ask.js";

const ASK_FAILURE_LOG_FILE = "./data/bot/ask-failures.jsonl";

interface LogAskFailureInput {
  question: string;
  scope: AskMemoryScope;
  provider: string;
  timeoutMs?: number;
  runtimeStatus?: unknown;
  error: unknown;
}

interface AskFailureRecord {
  id: string;
  timestamp: string;
  provider: string;
  timeoutMs?: number;
  question: string;
  scope: AskMemoryScope;
  runtimeStatus?: unknown;
  error: {
    message: string;
    stack?: string;
    rawType: string;
  };
}

function normalizeError(err: unknown): AskFailureRecord["error"] {
  if (err instanceof Error) {
    return {
      message: err.message,
      stack: err.stack,
      rawType: err.name,
    };
  }

  return {
    message: String(err),
    rawType: typeof err,
  };
}

export function logAskFailure(input: LogAskFailureInput): string {
  const id = `ask-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const record: AskFailureRecord = {
    id,
    timestamp: new Date().toISOString(),
    provider: input.provider,
    timeoutMs: input.timeoutMs,
    question: input.question.slice(0, 1000),
    scope: input.scope,
    runtimeStatus: input.runtimeStatus,
    error: normalizeError(input.error),
  };

  fs.mkdirSync(path.dirname(ASK_FAILURE_LOG_FILE), { recursive: true });
  fs.appendFileSync(ASK_FAILURE_LOG_FILE, `${JSON.stringify(record)}\n`, "utf-8");
  return id;
}

