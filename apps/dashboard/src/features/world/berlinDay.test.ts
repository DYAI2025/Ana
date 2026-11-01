import { describe, expect, it } from "vitest";
import { BEN_ACTIVITIES, berlinDay, VINCE_ACTIVITIES } from "./berlinDay";
import { ACTIVITY_SLOT_MS } from "./looks";

describe("berlinDay", () => {
  it("sleeps from midnight to 7 in Berlin, awake otherwise", () => {
    expect(berlinDay(Date.parse("2026-11-01T23:30:00Z")).night).toBe(true); // 00:30 in Berlin (CET)
    expect(berlinDay(Date.parse("2026-11-02T05:59:00Z")).night).toBe(true); // 06:59
    expect(berlinDay(Date.parse("2026-11-02T06:00:00Z")).night).toBe(false); // 07:00
    expect(berlinDay(Date.parse("2026-11-01T22:30:00Z")).night).toBe(false); // 23:30
  });

  it("one activity per 20-minute slot, the same for everyone; Ben mostly at the laptop, Vince sometimes at the gym", () => {
    const t0 = Date.parse("2026-11-02T08:00:00Z");
    expect(berlinDay(t0)).toEqual(berlinDay(t0 + 60_000));
    const ben: Record<string, number> = {};
    const vince: Record<string, number> = {};
    for (let i = 0; i < 3000; i++) {
      const d = berlinDay(t0 + i * ACTIVITY_SLOT_MS);
      ben[d.ben] = (ben[d.ben] ?? 0) + 1;
      vince[d.vince] = (vince[d.vince] ?? 0) + 1;
    }
    for (const a of BEN_ACTIVITIES) expect(ben[a]).toBeGreaterThan(0);
    for (const a of VINCE_ACTIVITIES) expect(vince[a]).toBeGreaterThan(0);
    expect(ben.laptop ?? 0).toBeGreaterThan((ben.wine ?? 0) + (ben.ai ?? 0) - 300);
    expect(ben.laptop ?? 0).toBeGreaterThan(ben.wine ?? 0);
    expect(vince.gym ?? 0).toBeLessThan(vince.phone ?? 0);
    expect(berlinDay(t0).until % ACTIVITY_SLOT_MS).toBe(0);
  });
});
