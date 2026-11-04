import { describe, it, expect } from "vitest";
import { parseInput } from "@/lib/research/pipeline";

describe("parseInput", () => {
  it("parses single word as name", () => {
    const result = parseInput("ACME");
    expect(result.name).toBe("ACME");
    expect(result.company).toBeUndefined();
  });

  it("parses two words as full name", () => {
    const result = parseInput("Jane Doe");
    expect(result.name).toBe("Jane Doe");
    expect(result.company).toBeUndefined();
  });

  it("parses three+ words as name + company", () => {
    const result = parseInput("Jane Doe Contoso");
    expect(result.name).toBe("Jane Doe");
    expect(result.company).toBe("Contoso");
  });

  it("parses name with multi-word company", () => {
    const result = parseInput("John Doe Acme Corp International");
    expect(result.name).toBe("John Doe");
    expect(result.company).toBe("Acme Corp International");
  });

  it("trims whitespace", () => {
    const result = parseInput("  Jane Doe  ");
    expect(result.name).toBe("Jane Doe");
  });
});
