import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  searchWeb,
  searchExa,
  lookupCrm,
  scanLocalFiles,
} from "@/lib/research/collector";

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

beforeEach(() => {
  vi.clearAllMocks();
});

describe("searchWeb", () => {
  it("returns empty results when no API key", async () => {
    delete process.env.TAVILY_API_KEY;
    const result = await searchWeb("test query");
    expect(result.results).toEqual([]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns results on successful search", async () => {
    process.env.TAVILY_API_KEY = "test-key";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          {
            title: "Test Result",
            url: "https://example.com",
            content: "Some content",
            score: 0.9,
          },
        ],
        answer: "Test answer",
      }),
    });

    const result = await searchWeb("Jane Doe");
    expect(result.results).toHaveLength(1);
    expect(result.results[0].title).toBe("Test Result");
    expect(result.answer).toBe("Test answer");
  });

  it("returns empty results on fetch failure", async () => {
    process.env.TAVILY_API_KEY = "test-key";
    mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });

    const result = await searchWeb("test");
    expect(result.results).toEqual([]);
  });
});

describe("searchExa", () => {
  it("returns empty when no API key", async () => {
    delete process.env.EXA_API_KEY;
    const results = await searchExa("test");
    expect(results).toEqual([]);
  });

  it("returns results on success", async () => {
    process.env.EXA_API_KEY = "test-key";
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        results: [
          { title: "Exa Result", url: "https://exa.ai", text: "Content" },
        ],
      }),
    });

    const results = await searchExa("test");
    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Exa Result");
  });
});

describe("lookupCrm", () => {
  it("returns null when no CRM URL", async () => {
    delete process.env.CRM_API_URL;
    const result = await lookupCrm("Test Person");
    expect(result.contact).toBeNull();
    expect(result.activities).toEqual([]);
  });

  it("returns contact and activities on success", async () => {
    process.env.CRM_API_URL = "http://localhost:3011";

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { id: "c1", firstName: "Jane", lastName: "Doe", notes: "Contoso" },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            {
              id: "a1",
              type: "meeting",
              description: "Initial call",
              createdAt: "2026-01-15",
            },
          ],
        }),
      });

    const result = await lookupCrm("Jane Doe");
    expect(result.contact).not.toBeNull();
    expect(result.contact?.firstName).toBe("Jane");
    expect(result.activities).toHaveLength(1);
  });
});

describe("scanLocalFiles", () => {
  it("returns empty for short search terms", async () => {
    const results = await scanLocalFiles("x");
    expect(results).toEqual([]);
  });

  it("sanitizes special characters", async () => {
    const results = await scanLocalFiles('test"; rm -rf /');
    // Should not throw, should sanitize
    expect(Array.isArray(results)).toBe(true);
  });
});
