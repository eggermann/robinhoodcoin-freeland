import { spawn } from "node:child_process";
import path from "node:path";

export interface PrismaLandSyncReport {
  ok: boolean;
  synced: number;
  shortlisted: number;
  stdout: string;
  stderr: string;
  error?: string;
}

export async function syncLandSearchIntoPrisma(): Promise<PrismaLandSyncReport> {
  const cwd = path.resolve(process.cwd(), "apps", "web-next");

  return new Promise((resolve) => {
    const child = spawn("npm", ["run", "prisma:sync:land-search"], {
      cwd,
      env: {
        ...process.env,
        DATABASE_URL: process.env.WEB_NEXT_DATABASE_URL ?? process.env.DATABASE_URL ?? "file:./prisma/dev.db",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });

    child.on("error", (err) => {
      resolve({
        ok: false,
        synced: 0,
        shortlisted: 0,
        stdout,
        stderr,
        error: err.message,
      });
    });

    child.on("close", (code) => {
      const combined = `${stdout}\n${stderr}`;
      const match = combined.match(/Synced\s+(\d+)\s+land-search listings into Prisma\s+\((\d+)\s+shortlisted\)\./i);

      resolve({
        ok: code === 0,
        synced: match ? Number(match[1]) : 0,
        shortlisted: match ? Number(match[2]) : 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        error: code === 0 ? undefined : `sync process exited with code ${code ?? -1}`,
      });
    });
  });
}
