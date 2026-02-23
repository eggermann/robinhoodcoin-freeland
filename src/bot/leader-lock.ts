import fs from "node:fs";
import path from "node:path";

interface LockPayload {
  ownerId: string;
  acquiredAt: string;
  updatedAt: string;
  expiresAt: string;
}

export interface FileLeaderLockConfig {
  lockFile: string;
  ownerId: string;
  ttlMs: number;
  heartbeatMs: number;
  retryWaitMs: number;
}

export interface LeaderLockHandle {
  ownerId: string;
  release: () => void;
}

function nowIso(): string {
  return new Date().toISOString();
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class FileLeaderLock {
  private readonly config: FileLeaderLockConfig;
  private heartbeat: NodeJS.Timeout | null = null;

  constructor(config: FileLeaderLockConfig) {
    this.config = config;
  }

  async waitForLeadership(onLockLost: (error: Error) => void): Promise<LeaderLockHandle> {
    while (true) {
      const acquired = this.acquireOnce();
      if (acquired) {
        this.startHeartbeat(onLockLost);
        return {
          ownerId: this.config.ownerId,
          release: () => this.release(),
        };
      }

      await sleep(this.config.retryWaitMs);
    }
  }

  private acquireOnce(): boolean {
    this.ensureParentDir();

    const payload = this.newPayload();
    try {
      const fd = fs.openSync(this.config.lockFile, "wx");
      fs.writeFileSync(fd, JSON.stringify(payload, null, 2));
      fs.closeSync(fd);
      return true;
    } catch (err) {
      const nodeErr = err as NodeJS.ErrnoException;
      if (nodeErr.code !== "EEXIST") {
        throw err;
      }
    }

    const existing = this.readPayloadSafe();
    if (!existing) {
      return false;
    }

    if (new Date(existing.expiresAt).getTime() > Date.now()) {
      return false;
    }

    try {
      fs.unlinkSync(this.config.lockFile);
    } catch {
      // Another instance may have taken over in parallel.
    }
    return false;
  }

  private startHeartbeat(onLockLost: (error: Error) => void): void {
    this.heartbeat = setInterval(() => {
      try {
        this.renew();
      } catch (err) {
        onLockLost(
          err instanceof Error ? err : new Error("Leader lock lost"),
        );
      }
    }, this.config.heartbeatMs);
  }

  private renew(): void {
    const existing = this.readPayloadSafe();
    if (!existing) {
      throw new Error("Leader lock file missing");
    }

    if (existing.ownerId !== this.config.ownerId) {
      throw new Error("Leader lock ownership changed");
    }

    const refreshed = this.newPayload();
    fs.writeFileSync(this.config.lockFile, JSON.stringify(refreshed, null, 2));
  }

  private release(): void {
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }

    const existing = this.readPayloadSafe();
    if (!existing || existing.ownerId !== this.config.ownerId) {
      return;
    }

    try {
      fs.unlinkSync(this.config.lockFile);
    } catch {
      // Ignore best-effort cleanup failures.
    }
  }

  private ensureParentDir(): void {
    fs.mkdirSync(path.dirname(this.config.lockFile), { recursive: true });
  }

  private newPayload(): LockPayload {
    const now = Date.now();
    return {
      ownerId: this.config.ownerId,
      acquiredAt: nowIso(),
      updatedAt: nowIso(),
      expiresAt: new Date(now + this.config.ttlMs).toISOString(),
    };
  }

  private readPayloadSafe(): LockPayload | null {
    try {
      const raw = fs.readFileSync(this.config.lockFile, "utf-8");
      const parsed = JSON.parse(raw) as Partial<LockPayload>;
      if (!parsed.ownerId || !parsed.expiresAt) return null;
      return {
        ownerId: parsed.ownerId,
        acquiredAt: parsed.acquiredAt ?? nowIso(),
        updatedAt: parsed.updatedAt ?? nowIso(),
        expiresAt: parsed.expiresAt,
      };
    } catch {
      return null;
    }
  }
}
