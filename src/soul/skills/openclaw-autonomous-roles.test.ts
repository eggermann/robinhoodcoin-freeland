import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencyMocks = vi.hoisted(() => ({
  listProposals: vi.fn(() => []),
  getActiveCampaigns: vi.fn(() => []),
  getActivePolls: vi.fn(() => []),
  getUpcomingEvents: vi.fn(() => []),
  getLandSearchManager: vi.fn(() => ({ getShortlist: () => [] })),
  getMemberLedgerStats: vi.fn(() => ({ totalMembers: 42 })),
  listOpportunities: vi.fn(() => []),
  getTreasuryBalanceSnapshot: vi.fn(async () => ({
    configured: true,
    balanceSOL: 100,
  })),
}));

vi.mock("../../dao/governance.js", () => ({
  listProposals: dependencyMocks.listProposals,
}));

vi.mock("../../nft/stamp-tiers.js", () => ({
  getActiveCampaigns: dependencyMocks.getActiveCampaigns,
}));

vi.mock("../community.js", () => ({
  getActivePolls: dependencyMocks.getActivePolls,
  getUpcomingEvents: dependencyMocks.getUpcomingEvents,
}));

vi.mock("../land-search.js", () => ({
  getLandSearchManager: dependencyMocks.getLandSearchManager,
}));

vi.mock("../member-ledger.js", () => ({
  getMemberLedgerStats: dependencyMocks.getMemberLedgerStats,
}));

vi.mock("../opportunity-scout.js", () => ({
  listOpportunities: dependencyMocks.listOpportunities,
}));

vi.mock("./treasury-tracker.js", () => ({
  getTreasuryBalanceSnapshot: dependencyMocks.getTreasuryBalanceSnapshot,
}));

const ORIGINAL_ENV = { ...process.env };
let fetchMock: ReturnType<typeof vi.fn>;

describe("runOpenClawAutonomyCycle", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      OPENCLAW_GATEWAY_URL: "http://gateway.local:18789",
      OPENCLAW_CHAT_COMPLETIONS_PATH: "/v1/chat/completions",
      OPENCLAW_GATEWAY_TOKEN: "gateway-secret",
      OPENCLAW_MODEL: "openclaw-test",
      OPENCLAW_AGENT_SOUL_ID: "soul-agent",
      OPENCLAW_AGENT_FINANCE_ID: "finance-agent",
      OPENCLAW_AGENT_GOVERNANCE_ID: "governance-agent",
    };

    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(fs, "mkdirSync").mockImplementation(() => undefined);
    vi.spyOn(fs, "appendFileSync").mockImplementation(() => undefined);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.unstubAllGlobals();
  });

  it("sends one gateway request per normalized role with routing headers", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"summary":"Stable","actions":["review treasury"],"alerts":[]}',
            },
          },
        ],
      }),
    });

    const { runOpenClawAutonomyCycle } = await import("./openclaw-autonomous-roles.js");
    const report = await runOpenClawAutonomyCycle({
      roles: ["soul", "finance"],
      maxTokens: 640,
      temperature: 0.15,
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(report.roles).toHaveLength(2);
    expect(report.roles[0]?.summary).toBe("Stable");
    expect(report.roles[1]?.summary).toBe("Stable");

    const [firstUrl, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(firstUrl).toBe("http://gateway.local:18789/v1/chat/completions");
    const firstHeaders = firstInit.headers as Record<string, string>;
    expect(firstHeaders["x-openclaw-agent-id"]).toBe("soul-agent");
    expect(firstHeaders["x-openclaw-agent-role"]).toBe("soul");
    expect(firstHeaders.Authorization).toBe("Bearer gateway-secret");
    const firstBody = JSON.parse(String(firstInit.body)) as Record<string, unknown>;
    expect(firstBody.model).toBe("openclaw-test");
    expect(firstBody.max_tokens).toBe(640);
    expect(firstBody.temperature).toBe(0.15);

    const [, secondInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    const secondHeaders = secondInit.headers as Record<string, string>;
    expect(secondHeaders["x-openclaw-agent-id"]).toBe("finance-agent");
    expect(secondHeaders["x-openclaw-agent-role"]).toBe("finance");
  });

  it("captures gateway errors in per-role report instead of throwing", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 503,
      text: async () => "temporarily unavailable",
    });

    const { runOpenClawAutonomyCycle } = await import("./openclaw-autonomous-roles.js");
    const report = await runOpenClawAutonomyCycle({
      roles: ["governance"],
      maxTokens: 500,
      temperature: 0.2,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(report.roles).toHaveLength(1);
    expect(report.roles[0]?.summary).toBe("Role execution failed.");
    expect(report.roles[0]?.error).toContain("OpenClaw gateway error 503");
  });

  it("filters invalid/duplicate roles before calling the gateway", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"summary":"ok","actions":[],"alerts":[]}',
            },
          },
        ],
      }),
    });

    const { runOpenClawAutonomyCycle } = await import("./openclaw-autonomous-roles.js");
    const report = await runOpenClawAutonomyCycle({
      roles: ["finance", "unknown", "finance"],
      maxTokens: 300,
      temperature: 0.2,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(report.roles).toHaveLength(1);
    expect(report.roles[0]?.role).toBe("finance");
  });
});
