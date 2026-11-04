import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  runQuickSynthesis,
  runDeepSynthesis,
} from "@/lib/research/synthesizer";

// Mock ollama
vi.mock("@/lib/ollama", () => ({
  synthesizeQuick: vi.fn(),
  synthesizeDeep: vi.fn(),
}));

import { synthesizeQuick, synthesizeDeep } from "@/lib/ollama";

const mockQuick = vi.mocked(synthesizeQuick);
const mockDeep = vi.mocked(synthesizeDeep);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runQuickSynthesis", () => {
  it("returns synthesis on success", async () => {
    mockQuick.mockResolvedValueOnce({
      summary: "Test summary",
      talkingPoints: ["Point 1", "Point 2"],
      riskSignals: [],
      strategy: "Build rapport",
    });

    const result = await runQuickSynthesis("Jane Doe", "Contoso", {}, {});
    expect(result.summary).toBe("Test summary");
    expect(result.talkingPoints).toHaveLength(2);
  });

  it("returns fallback on error", async () => {
    mockQuick.mockRejectedValueOnce(new Error("Ollama down"));

    const result = await runQuickSynthesis("Jane Doe", "Contoso", {}, {});
    expect(result.summary).toContain("Jane Doe");
    expect(result.summary).toContain("unavailable");
  });
});

describe("runDeepSynthesis", () => {
  it("returns synthesis on success", async () => {
    mockDeep.mockResolvedValueOnce({
      summary: "Deep summary",
      talkingPoints: ["TP1", "TP2", "TP3"],
      riskSignals: ["Risk 1"],
      strategy: "Strategic approach",
    });

    const result = await runDeepSynthesis("Jane Doe", "Contoso", {}, {}, {});
    expect(result.summary).toBe("Deep summary");
    expect(result.riskSignals).toHaveLength(1);
  });

  it("returns fallback on error", async () => {
    mockDeep.mockRejectedValueOnce(new Error("Timeout"));

    const result = await runDeepSynthesis("Jane Doe", null, {}, {}, {});
    expect(result.summary).toContain("unavailable");
    expect(result.talkingPoints).toHaveLength(1);
  });
});
