// @vitest-environment node
import { describe, expect, it } from "vitest";
import { formatDay, formatIndex, formatObservation } from "./format";

describe("social formatting", () => {
  it("publish dates follow the viewer's time zone (a post just after midnight in Berlin is that Berlin day)", () => {
    const iso = "2026-10-01T22:30:00.000Z"; // 00:30 on 2 Oct in Berlin
    expect(formatDay(iso, "en", "Europe/Berlin")).toBe("02 Oct 2026");
    expect(formatDay(iso, "en", "UTC")).toBe("01 Oct 2026");
  });

  it("a Reel's watch time reads in seconds and its skip rate in percent, with the locale's separators", () => {
    expect(formatObservation({ value: 28130, unit: "ms" }, "en")).toBe("28.1 s");
    expect(formatObservation({ value: 28130, unit: "ms" }, "de")).toBe("28,1 s");
    expect(formatObservation({ value: 34.5, unit: "percent" }, "en")).toBe("34.5%");
    expect(formatObservation({ value: 34.5, unit: "percent" }, "de")).toBe("34,5\u00a0%");
    expect(formatObservation({ value: 12400, unit: "count" }, "en")).toBe("12,400");
  });

  it("the 1.00× baseline uses the locale's decimal separator", () => {
    expect([formatIndex(1, "en"), formatIndex(1, "de"), formatIndex(1, "it")]).toEqual(["1.00×", "1,00×", "1,00×"]);
  });
});
