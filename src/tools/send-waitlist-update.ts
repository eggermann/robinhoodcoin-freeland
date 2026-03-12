import fs from "node:fs";
import path from "node:path";
import { sendMail } from "../shared/mailer.js";

interface WaitlistEntry {
  email: string;
  name?: string;
  interest: string;
  source: string;
  createdAt: string;
}

function getArg(name: string): string {
  const index = process.argv.findIndex((arg) => arg === `--${name}`);
  if (index === -1) return "";
  return process.argv[index + 1] ?? "";
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function candidateFiles(): string[] {
  const override = process.env.ROBINHOODCOIN_WAITLIST_FILE?.trim();
  return [
    override,
    path.resolve("./data/community/waitlist.jsonl"),
    path.resolve("./apps/web-next/data/community/waitlist.jsonl"),
  ].filter(Boolean) as string[];
}

function resolveWaitlistFile(): string {
  for (const filePath of candidateFiles()) {
    if (fs.existsSync(filePath)) return filePath;
  }
  return candidateFiles()[0];
}

function loadWaitlistEntries(): WaitlistEntry[] {
  const filePath = resolveWaitlistFile();
  if (!filePath || !fs.existsSync(filePath)) return [];

  return fs.readFileSync(filePath, "utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      try {
        const parsed = JSON.parse(line) as Partial<WaitlistEntry>;
        if (!parsed.email || typeof parsed.email !== "string") return [];
        return [{
          email: parsed.email.trim().toLowerCase(),
          name: typeof parsed.name === "string" ? parsed.name.trim() : undefined,
          interest: typeof parsed.interest === "string" ? parsed.interest.trim() : "general",
          source: typeof parsed.source === "string" ? parsed.source.trim() : "unknown",
          createdAt: typeof parsed.createdAt === "string" ? parsed.createdAt : new Date().toISOString(),
        }];
      } catch {
        return [];
      }
    });
}

async function main(): Promise<void> {
  const subject = getArg("subject");
  const text = getArg("text");
  const textFile = getArg("text-file");
  const htmlFile = getArg("html-file");
  const interest = getArg("interest").trim().toLowerCase();
  const send = hasFlag("send");

  if (!subject) {
    throw new Error("Missing --subject.");
  }

  const resolvedText = text || (textFile ? fs.readFileSync(path.resolve(textFile), "utf-8") : "");
  const resolvedHtml = htmlFile ? fs.readFileSync(path.resolve(htmlFile), "utf-8") : undefined;

  if (!resolvedText && !resolvedHtml) {
    throw new Error("Provide --text, --text-file, or --html-file.");
  }

  const recipients = loadWaitlistEntries()
    .filter((entry) => !interest || entry.interest.toLowerCase() === interest)
    .filter((entry, index, all) => all.findIndex((candidate) => candidate.email === entry.email) === index);

  if (recipients.length === 0) {
    console.log("No waitlist recipients matched the current filter.");
    return;
  }

  if (!send) {
    console.log(`Dry run only. ${recipients.length} recipient(s) matched.`);
    for (const recipient of recipients.slice(0, 20)) {
      console.log(`- ${recipient.email} (${recipient.interest})`);
    }
    if (recipients.length > 20) {
      console.log(`...and ${recipients.length - 20} more`);
    }
    console.log("Re-run with --send to deliver mail.");
    return;
  }

  for (const recipient of recipients) {
    await sendMail({
      to: recipient.email,
      subject,
      text: resolvedText,
      html: resolvedHtml,
    });
  }

  console.log(`Sent waitlist update to ${recipients.length} recipient(s).`);
}

main().catch((error) => {
  console.error("Failed to send waitlist update:", error instanceof Error ? error.message : error);
  process.exit(1);
});
