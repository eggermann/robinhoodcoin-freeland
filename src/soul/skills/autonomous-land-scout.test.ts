import fs from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const landSearchMocks = vi.hoisted(() => ({
  addListing: vi.fn((input: Record<string, unknown>) => ({
    id: "listing-1",
    score: 92,
    ...input,
  })),
  addToShortlist: vi.fn(),
  getListings: vi.fn(() => []),
  getCriteria: vi.fn(() => ({
    maxPriceSOL: 200,
    minSizeAcres: 1,
    maxSizeAcres: 50,
    regions: ["EU"],
    zoningTypes: ["agricultural"],
  })),
}));

vi.mock("../land-search.js", () => ({
  getLandSearchManager: () => ({
    addListing: landSearchMocks.addListing,
    addToShortlist: landSearchMocks.addToShortlist,
    getListings: landSearchMocks.getListings,
    getCriteria: landSearchMocks.getCriteria,
  }),
}));

const ORIGINAL_ENV = { ...process.env };
let fetchMock: ReturnType<typeof vi.fn>;

describe("runAutonomousLandScoutCycle", () => {
  beforeEach(() => {
    vi.resetModules();
    process.env = {
      ...ORIGINAL_ENV,
      OPENCLAW_GATEWAY_URL: "http://gateway.local:18789",
      OPENCLAW_CHAT_COMPLETIONS_PATH: "/v1/chat/completions",
      OPENCLAW_GATEWAY_TOKEN: "gateway-secret",
      OPENCLAW_MODEL: "openclaw-test",
      OPENCLAW_AGENT_LAND_SCOUT_ID: "little-john",
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

  it("calls OpenClaw land-scout agent and ingests valid candidates", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                candidates: [
                  {
                    title: "Olive Grove Parcel",
                    location: {
                      country: "Portugal",
                      region: "Alentejo",
                      city: "Evora",
                    },
                    sizeAcres: 12,
                    priceUSD: 18000,
                    zoning: "agricultural",
                    description: "Flat parcel with road access.",
                    features: ["road access", "water nearby"],
                    sourceUrl: "https://example.com/listing/olive-grove",
                  },
                ],
              }),
            },
          },
        ],
      }),
    });

    const { runAutonomousLandScoutCycle } = await import("./autonomous-land-scout.js");
    const report = await runAutonomousLandScoutCycle({
      maxCandidatesPerRun: 3,
      shortlistMinScore: 80,
      verifySourceReachability: false,
      sourceTimeoutMs: 5000,
      regionHint: "EU",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(report.error).toBeUndefined();
    expect(report.received).toBe(1);
    expect(report.added).toBe(1);
    expect(report.shortlisted).toBe(1);
    expect(landSearchMocks.addListing).toHaveBeenCalledTimes(1);
    expect(landSearchMocks.addToShortlist).toHaveBeenCalledWith("listing-1");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://gateway.local:18789/v1/chat/completions");
    const headers = init.headers as Record<string, string>;
    expect(headers["x-openclaw-agent-id"]).toBe("little-john");
    expect(headers["x-openclaw-agent-role"]).toBe("land-scout");
    expect(headers.Authorization).toBe("Bearer gateway-secret");
  });

  it("returns a configured error when OPENCLAW_GATEWAY_URL is missing", async () => {
    process.env.OPENCLAW_GATEWAY_URL = "";

    const { runAutonomousLandScoutCycle } = await import("./autonomous-land-scout.js");
    const report = await runAutonomousLandScoutCycle({
      maxCandidatesPerRun: 2,
      shortlistMinScore: 80,
      verifySourceReachability: false,
      sourceTimeoutMs: 2000,
    });

    expect(fetchMock).not.toHaveBeenCalled();
    expect(report.error).toBe("OPENCLAW_GATEWAY_URL is not configured.");
    expect(report.configured).toBe(false);
  });

  it("records gateway errors instead of throwing", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 502,
      text: async () => "bad gateway",
    });

    const { runAutonomousLandScoutCycle } = await import("./autonomous-land-scout.js");
    const report = await runAutonomousLandScoutCycle({
      maxCandidatesPerRun: 1,
      shortlistMinScore: 80,
      verifySourceReachability: false,
      sourceTimeoutMs: 2000,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(report.error).toContain("OpenClaw land-scout gateway error 502");
    expect(report.added).toBe(0);
  });
});
