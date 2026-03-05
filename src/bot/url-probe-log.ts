import fs from "node:fs";
import path from "node:path";
import type { AskMemoryScope } from "./commands/ask.js";

const URL_PROBE_LOG_FILE = "./data/bot/url-probes.jsonl";

export interface UrlProbeRecord {
  id: string;
  timestamp: string;
  question: string;
  url: string;
  scope: AskMemoryScope;
  result: {
    finalUrl?: string;
    status?: number;
    ok?: boolean;
    contentType?: string | null;
    title?: string | null;
    error?: string;
    timeoutMs?: number;
  };
}

export function logUrlProbe(record: Omit<UrlProbeRecord, "id" | "timestamp">): string {
  const id = `probe-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const payload: UrlProbeRecord = {
    id,
    timestamp: new Date().toISOString(),
    ...record,
  };

  fs.mkdirSync(path.dirname(URL_PROBE_LOG_FILE), { recursive: true });
  fs.appendFileSync(URL_PROBE_LOG_FILE, `${JSON.stringify(payload)}\n`, "utf-8");
  return id;
}

