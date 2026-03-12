import fs from "node:fs/promises";
import path from "node:path";

export interface WaitlistEntry {
  email: string;
  name?: string;
  interest: string;
  source: string;
  createdAt: string;
}

export interface WaitlistAddResult {
  entry: WaitlistEntry;
  duplicate: boolean;
  total: number;
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function candidateFiles(): string[] {
  const cwd = process.cwd();
  const root = path.resolve(cwd, "..", "..");
  const override = process.env.ROBINHOODCOIN_WAITLIST_FILE?.trim();

  return [
    override,
    path.join(root, "data", "community", "waitlist.jsonl"),
    path.join(cwd, "data", "community", "waitlist.jsonl"),
  ].filter(Boolean) as string[];
}

async function resolveWaitlistFile(): Promise<string> {
  const candidates = candidateFiles();

  for (const filePath of candidates) {
    try {
      await fs.access(filePath);
      return filePath;
    } catch {
      continue;
    }
  }

  return candidates[0];
}

async function loadEntries(filePath: string): Promise<WaitlistEntry[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .flatMap((line) => {
        try {
          const parsed = JSON.parse(line) as Partial<WaitlistEntry>;
          if (!parsed.email || typeof parsed.email !== "string") return [];
          return [{
            email: normalizeEmail(parsed.email),
            name: typeof parsed.name === "string" ? parsed.name : undefined,
            interest: typeof parsed.interest === "string" ? parsed.interest : "general",
            source: typeof parsed.source === "string" ? parsed.source : "unknown",
            createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
          }];
        } catch {
          return [];
        }
      });
  } catch {
    return [];
  }
}

export async function addWaitlistEntry(input: {
  email: string;
  name?: string;
  interest?: string;
  source?: string;
}): Promise<WaitlistAddResult> {
  const email = normalizeEmail(input.email);
  if (!isValidEmail(email)) {
    throw new Error("Please enter a valid email address.");
  }

  const entry: WaitlistEntry = {
    email,
    name: input.name?.trim() || undefined,
    interest: input.interest?.trim() || "general",
    source: input.source?.trim() || "web",
    createdAt: new Date().toISOString(),
  };

  const filePath = await resolveWaitlistFile();
  const existing = await loadEntries(filePath);

  if (existing.some((item) => normalizeEmail(item.email) === email)) {
    return {
      entry,
      duplicate: true,
      total: existing.length,
    };
  }

  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.appendFile(filePath, `${JSON.stringify(entry)}\n`, "utf8");

  return {
    entry,
    duplicate: false,
    total: existing.length + 1,
  };
}
