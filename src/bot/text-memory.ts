import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type {
  AskMemoryCaptureInput,
  AskMemoryContext,
  AskMemoryRetrieveInput,
} from "./commands/ask.js";

interface MemoryEntry {
  timestamp: string;
  query: string;
  answer: string;
}

export interface TextFileMemoryConfig {
  memoryDir: string;
  maxRecallResults: number;
  recentFactsCount: number;
  maxEntriesPerScope: number;
}

const STOPWORDS = new Set<string>([
  "the", "and", "for", "with", "that", "this", "from", "have", "what", "when", "where",
  "will", "would", "could", "should", "your", "about", "into", "they", "them", "their",
  "just", "like", "how", "can", "you", "our", "are", "was", "were", "been", "has", "had",
  "not", "but", "all", "any", "use", "out", "its", "who", "why", "which", "more", "than",
]);

function normalizeSingleLine(text: string, max = 2000): string {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

function tokenize(text: string): Set<string> {
  const tokens = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));

  return new Set(tokens);
}

function overlapScore(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;

  let overlap = 0;
  for (const token of a) {
    if (b.has(token)) overlap += 1;
  }

  return overlap / a.size;
}

function truncate(text: string, limit = 220): string {
  return text.length <= limit ? text : `${text.slice(0, limit)}...`;
}

export class TextFileMemoryStore {
  private readonly memoryDir: string;
  private readonly maxRecallResults: number;
  private readonly recentFactsCount: number;
  private readonly maxEntriesPerScope: number;

  constructor(config: TextFileMemoryConfig) {
    this.memoryDir = config.memoryDir;
    this.maxRecallResults = Math.max(1, config.maxRecallResults);
    this.recentFactsCount = Math.max(1, config.recentFactsCount);
    this.maxEntriesPerScope = Math.max(20, config.maxEntriesPerScope);
    fs.mkdirSync(this.memoryDir, { recursive: true });
  }

  async retrieve(input: AskMemoryRetrieveInput): Promise<AskMemoryContext | null> {
    const { entriesPath, factsPath } = this.resolvePaths(input.scope.chatId, input.scope.userId);
    const entries = this.readEntries(entriesPath);
    const facts = this.readFacts(factsPath);

    if (entries.length === 0 && facts.length === 0) {
      return null;
    }

    const dynamicFacts = entries
      .slice(-this.recentFactsCount)
      .reverse()
      .map((entry) => {
        const date = new Date(entry.timestamp).toLocaleDateString();
        return `Recent topic (${date}): ${truncate(entry.query, 140)}`;
      });

    const queryTokens = tokenize(input.query);
    const relatedMemories = entries
      .map((entry) => {
        const entryTokens = tokenize(`${entry.query} ${entry.answer}`);
        const score = overlapScore(queryTokens, entryTokens);
        return {
          score,
          timestamp: entry.timestamp,
          text: `Q: ${entry.query} | A: ${truncate(entry.answer, 180)}`,
        };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, this.maxRecallResults)
      .map((row) => ({
        text: row.text,
        similarity: row.score,
        updatedAt: row.timestamp,
      }));

    return {
      staticFacts: facts.slice(0, this.maxRecallResults),
      dynamicFacts,
      relatedMemories,
    };
  }

  async capture(input: AskMemoryCaptureInput): Promise<void> {
    const { entriesPath, factsPath } = this.resolvePaths(input.scope.chatId, input.scope.userId);
    fs.mkdirSync(path.dirname(entriesPath), { recursive: true });

    const entry: MemoryEntry = {
      timestamp: new Date().toISOString(),
      query: normalizeSingleLine(input.query, 1000),
      answer: normalizeSingleLine(input.answer, 2000),
    };

    const block = [
      `### ${entry.timestamp}`,
      `Q: ${entry.query}`,
      `A: ${entry.answer}`,
      "",
    ].join("\n");

    fs.appendFileSync(entriesPath, block, "utf-8");
    this.trimEntries(entriesPath);

    const extracted = this.extractFacts(entry);
    if (extracted.length > 0) {
      this.appendFacts(factsPath, extracted);
    }
  }

  private resolvePaths(chatId: string, userId: string): {
    entriesPath: string;
    factsPath: string;
  } {
    const scopeHash = createHash("sha256")
      .update(`${chatId}:${userId}`)
      .digest("hex")
      .slice(0, 24);

    return {
      entriesPath: path.join(this.memoryDir, `${scopeHash}.md`),
      factsPath: path.join(this.memoryDir, `${scopeHash}.facts.txt`),
    };
  }

  private readEntries(filePath: string): MemoryEntry[] {
    if (!fs.existsSync(filePath)) return [];

    const raw = fs.readFileSync(filePath, "utf-8");
    const matches = raw.matchAll(/^###\s+(.+)\nQ:\s+(.+)\nA:\s+(.+)$/gm);
    const entries: MemoryEntry[] = [];

    for (const match of matches) {
      const [, timestamp, query, answer] = match;
      if (!timestamp || !query || !answer) continue;
      entries.push({ timestamp, query, answer });
    }

    return entries;
  }

  private trimEntries(filePath: string): void {
    const entries = this.readEntries(filePath);
    if (entries.length <= this.maxEntriesPerScope) return;

    const trimmed = entries.slice(-this.maxEntriesPerScope);
    const next = trimmed
      .map((entry) => [
        `### ${entry.timestamp}`,
        `Q: ${entry.query}`,
        `A: ${entry.answer}`,
        "",
      ].join("\n"))
      .join("\n");

    fs.writeFileSync(filePath, next, "utf-8");
  }

  private readFacts(filePath: string): string[] {
    if (!fs.existsSync(filePath)) return [];

    return fs
      .readFileSync(filePath, "utf-8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .slice(-this.maxEntriesPerScope);
  }

  private appendFacts(filePath: string, facts: string[]): void {
    const existing = new Set(this.readFacts(filePath));
    const uniqueNew = facts.filter((fact) => !existing.has(fact));
    if (uniqueNew.length === 0) return;

    const next = [...existing, ...uniqueNew].slice(-this.maxEntriesPerScope);
    fs.writeFileSync(filePath, `${next.join("\n")}\n`, "utf-8");
  }

  private extractFacts(entry: MemoryEntry): string[] {
    const facts: string[] = [];
    const q = entry.query;
    const a = entry.answer;

    const nameMatch = q.match(/\bmy name is\s+([a-zA-Z][\w\- ]{1,40})/i);
    if (nameMatch?.[1]) {
      facts.push(`User name: ${normalizeSingleLine(nameMatch[1], 48)}`);
    }

    const preferMatch = q.match(/\bi prefer\s+([^.!?]{3,80})/i);
    if (preferMatch?.[1]) {
      facts.push(`Preference: ${normalizeSingleLine(preferMatch[1], 100)}`);
    }

    const fromMatch = q.match(/\bi(?:\sam)?\sfrom\s+([^.!?]{2,60})/i);
    if (fromMatch?.[1]) {
      facts.push(`Location hint: ${normalizeSingleLine(fromMatch[1], 80)}`);
    }

    if (/proposal\s+.*approved/i.test(a)) {
      facts.push(`DAO note: latest discussion referenced an approved proposal.`);
    }

    if (/proposal\s+.*rejected/i.test(a)) {
      facts.push(`DAO note: latest discussion referenced a rejected proposal.`);
    }

    return facts;
  }
}
