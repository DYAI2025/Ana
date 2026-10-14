// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatDay, formatIndex } from "./format";

describe("social formatting", () => {
  it("publish dates follow the viewer's time zone (a post just after midnight in Berlin is that Berlin day)", () => {
    const iso = "2026-10-01T22:30:00.000Z"; // 00:30 on 2 Oct in Berlin
    expect(formatDay(iso, "en", "Europe/Berlin")).toBe("02 Oct 2026");
    expect(formatDay(iso, "en", "UTC")).toBe("01 Oct 2026");
  });

  it("the 1.00× baseline uses the locale's decimal separator", () => {
    expect([formatIndex(1, "en"), formatIndex(1, "de"), formatIndex(1, "it")]).toEqual(["1.00×", "1,00×", "1,00×"]);
  });
});
