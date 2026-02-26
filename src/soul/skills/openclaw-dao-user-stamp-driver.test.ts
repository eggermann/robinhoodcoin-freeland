import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const dependencyMocks = vi.hoisted(() => ({
  activateProposal: vi.fn((id: string) => ({ id })),
  createProposal: vi.fn(() => ({ id: "proposal-1" })),
  getProposal: vi.fn(() => null),
  listProposals: vi.fn(() => []),
  createLandStampBatch: vi.fn(async () => ({ campaign: { id: "campaign-1" } })),
  findSelectableLand: vi.fn(() => null),
  listSelectableLands: vi.fn(() => []),
  getCampaign: vi.fn(() => null),
  getCampaignProgress: vi.fn(() => ({ percentFunded: 0 })),
  getActiveCampaigns: vi.fn(() => []),
  getAllCampaigns: vi.fn(() => []),
  getLandSearchManager: vi.fn(() => ({ getShortlist: () => [] })),
  getMemberLedgerStats: vi.fn(() => ({ totalMembers: 7 })),
}));

vi.mock("../../dao/governance.js", () => ({
  activateProposal: dependencyMocks.activateProposal,
  createProposal: dependencyMocks.createProposal,
  getProposal: dependencyMocks.getProposal,
  listProposals: dependencyMocks.listProposals,
}));

vi.mock("../../nft/land-stamp-factory.js", () => ({
  createLandStampBatch: dependencyMocks.createLandStampBatch,
  findSelectableLand: dependencyMocks.findSelectableLand,
  listSelectableLands: dependencyMocks.listSelectableLands,
}));

vi.mock("../../nft/stamp-tiers.js", () => ({
  getCampaign: dependencyMocks.getCampaign,
  getCampaignProgress: dependencyMocks.getCampaignProgress,
  getActiveCampaigns: dependencyMocks.getActiveCampaigns,
  getAllCampaigns: dependencyMocks.getAllCampaigns,
}));

vi.mock("../land-search.js", () => ({
  getLandSearchManager: dependencyMocks.getLandSearchManager,
}));

vi.mock("../member-ledger.js", () => ({
  getMemberLedgerStats: dependencyMocks.getMemberLedgerStats,
}));

const ORIGINAL_ENV = { ...process.env };
let fetchMock: ReturnType<typeof vi.fn>;

describe("runOpenClawDaoUserStampDriver", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      OPENCLAW_GATEWAY_URL: "http://gateway.local:18789",
      OPENCLAW_CHAT_COMPLETIONS_PATH: "/v1/chat/completions",
      OPENCLAW_GATEWAY_TOKEN: "gateway-secret",
      OPENCLAW_MODEL: "openclaw-test",
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

  it("short-circuits when fusion is disabled", async () => {
    const { runOpenClawDaoUserStampDriver } = await import("./openclaw-dao-user-stamp-driver.js");
    const report = await runOpenClawDaoUserStampDriver({
      enabled: false,
      maxActions: 3,
      maxTokens: 900,
      temperature: 0.1,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(report.summary).toBe("Fusion driver disabled by configuration.");
    expect(report.actionsRequested).toHaveLength(0);
  });

  it("skips and reports missing gateway url", async () => {
    process.env.OPENCLAW_GATEWAY_URL = "";

    const { runOpenClawDaoUserStampDriver } = await import("./openclaw-dao-user-stamp-driver.js");
    const report = await runOpenClawDaoUserStampDriver({
      enabled: true,
      maxActions: 3,
      maxTokens: 900,
      temperature: 0.1,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(report.summary).toContain("OPENCLAW_GATEWAY_URL is not configured");
    expect(report.skipped).toContain("missing OPENCLAW_GATEWAY_URL");
  });

  it("calls OpenClaw gateway with governance routing headers", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: '{"summary":"No actions this cycle","actions":[]}',
            },
          },
        ],
      }),
    });

    const { runOpenClawDaoUserStampDriver } = await import("./openclaw-dao-user-stamp-driver.js");
    const report = await runOpenClawDaoUserStampDriver({
      enabled: true,
      maxActions: 2,
      maxTokens: 250,
      temperature: 0.05,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(report.summary).toBe("No actions this cycle");
    expect(report.actionsRequested).toHaveLength(0);
    expect(report.errors).toHaveLength(0);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://gateway.local:18789/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-openclaw-agent-id"]).toBe("governance-agent");
    expect(headers["x-openclaw-agent-role"]).toBe("governance");
    expect(headers.Authorization).toBe("Bearer gateway-secret");

    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    expect(body.model).toBe("openclaw-test");
    expect(body.max_tokens).toBe(300);
    expect(body.temperature).toBe(0.05);
  });
});
