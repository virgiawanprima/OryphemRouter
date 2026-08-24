import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock global fetch so the verifier never hits the network.
const fetchMock = vi.fn();
global.fetch = fetchMock;

import { verifyProviderModels } from "../../open-sse/services/modelVerifier.js";

function jsonResponse(data, { ok = true, status = 200 } = {}) {
  return { ok, status, json: async () => data };
}

describe("modelVerifier", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("classifies advertised models against the real catalog", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      data: [
        { id: "deepseek-v4-pro", name: "DeepSeek V4 Pro" },
        { id: "deepseek-v4-flash", name: "DeepSeek V4 Flash" },
      ],
    }));

    const report = await verifyProviderModels({
      provider: "deepseek",
      credentials: { apiKey: "sk-test" },
    });

    expect(report.live).toBeTruthy();
    expect(report.verified).toContain("deepseek-v4-pro");
    expect(report.verified).toContain("deepseek-v4-flash");
    // deepseek-chat / deepseek-reasoner (legacy aliases) and the vision model are
    // not in this small fake catalog → reported missing.
    expect(report.missing).toContain("deepseek-chat");
    expect(report.catalog.length).toBe(2);
  });

  it("maps corrected models via upstreamModelId", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      data: [{ id: "qwen3.7-plus", name: "Qwen 3.7 Plus" }],
    }));

    // The qoder registry maps qwen3.7-plus → upstreamModelId "qmodel".
    const report = await verifyProviderModels({
      provider: "qoder",
      credentials: { apiKey: "pt-test" },
    });

    // qwen3.7-plus exists in catalog → verified.
    expect(report.verified).toContain("qwen3.7-plus");
  });

  it("is fail-open when the live catalog cannot be fetched", async () => {
    fetchMock.mockRejectedValueOnce(new Error("network down"));

    const report = await verifyProviderModels({
      provider: "deepseek",
      credentials: { apiKey: "sk-test" },
    });

    expect(report.live).toBeNull();
    expect(report.missing).toEqual([]); // nothing flagged as fake
    expect(report.catalog).toEqual([]);
  });

  it("reports missing models only when a live catalog exists", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({
      data: [{ id: "deepseek-v4-pro" }],
    }));

    const report = await verifyProviderModels({
      provider: "deepseek",
      credentials: { apiKey: "sk-test" },
      additionalModels: ["deepseek-made-up-model"],
    });

    expect(report.missing).toContain("deepseek-made-up-model");
  });
});
