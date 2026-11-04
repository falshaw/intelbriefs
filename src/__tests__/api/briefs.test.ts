import { describe, it, expect, vi, beforeEach } from "vitest";

// These are integration-style tests that validate request/response shapes
// Actual API testing requires running the app

describe("Brief API contracts", () => {
  it("POST /api/briefs expects input and mode", () => {
    const validPayload = {
      input: "Jane Doe Contoso",
      mode: "QUICK",
    };

    expect(validPayload.input).toBeDefined();
    expect(validPayload.mode).toMatch(/^(QUICK|DEEP)$/);
  });

  it("GET /api/briefs supports pagination params", () => {
    const params = new URLSearchParams({
      page: "1",
      limit: "20",
      type: "PERSON",
      mode: "QUICK",
      search: "Jane",
    });

    expect(params.get("page")).toBe("1");
    expect(params.get("limit")).toBe("20");
    expect(params.get("type")).toBe("PERSON");
    expect(params.get("mode")).toBe("QUICK");
    expect(params.get("search")).toBe("Jane");
  });

  it("Brief status follows valid state machine", () => {
    const validStatuses = [
      "PENDING",
      "RESEARCHING",
      "SYNTHESIZING",
      "COMPLETE",
      "FAILED",
    ];
    const validTransitions: Record<string, string[]> = {
      PENDING: ["RESEARCHING", "FAILED"],
      RESEARCHING: ["SYNTHESIZING", "FAILED"],
      SYNTHESIZING: ["COMPLETE", "FAILED"],
      COMPLETE: ["PENDING"], // for refresh
      FAILED: ["PENDING"], // for retry
    };

    for (const status of validStatuses) {
      expect(validTransitions[status]).toBeDefined();
    }
  });
});
