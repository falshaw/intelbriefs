import { describe, it, expect } from "vitest";
import { describeChangedFields } from "@/lib/changed-fields";

describe("describeChangedFields", () => {
  it("joins two fields with 'and'", () => {
    expect(describeChangedFields(["riskSignals", "talkingPoints"])).toBe(
      "risk signals and talking points",
    );
  });
  it("handles one field and unknown names", () => {
    expect(describeChangedFields(["summary"])).toBe("the summary");
    expect(describeChangedFields(["other"])).toBe("other");
  });
  it("lists three fields", () => {
    expect(describeChangedFields(["summary", "riskSignals", "strategy"])).toBe(
      "the summary, risk signals and strategy",
    );
  });
});
