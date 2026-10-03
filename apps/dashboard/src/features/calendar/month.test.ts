import { describe, expect, it } from "vitest";
import { addMonths, isoDate, monthGrid } from "./month";

describe("monthGrid", () => {
  it("builds Monday-first weeks for October 2026 (starts on a Thursday)", () => {
    const grid = monthGrid(2026, 10);
    expect(grid[0]).toHaveLength(7);
    expect(grid[0]![0]).toEqual({ date: "2026-09-28", inMonth: false });
    expect(grid[0]![3]).toEqual({ date: "2026-10-01", inMonth: true });
    const days = grid.flat().filter((d) => d.inMonth);
    expect(days).toHaveLength(31);
    expect(days.at(-1)!.date).toBe("2026-10-31");
    expect(grid.flat().length % 7).toBe(0);
  });

  it("handles a month that starts on Monday (June 2026)", () => {
    expect(monthGrid(2026, 6)[0]![0]).toEqual({ date: "2026-06-01", inMonth: true });
  });

  it("handles February in a leap year", () => {
    expect(monthGrid(2028, 2).flat().filter((d) => d.inMonth)).toHaveLength(29);
  });
});

describe("addMonths", () => {
  it("wraps across years", () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
  });
});

describe("isoDate", () => {
  it("zero-pads", () => {
    expect(isoDate(2026, 3, 7)).toBe("2026-03-07");
  });
});
