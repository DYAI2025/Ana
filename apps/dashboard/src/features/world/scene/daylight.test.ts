import { describe, expect, it } from "vitest";
import { subsolarPoint } from "./daylight";

// reference values: NOAA solar calculator (subsolar latitude = declination, longitude from solar noon)
describe("subsolarPoint", () => {
  it("June solstice, 12:00 UTC: sun over the Tropic of Cancer near Greenwich", () => {
    const p = subsolarPoint(new Date("2026-06-21T12:00:00Z"));
    expect(p.lat).toBeGreaterThan(23);
    expect(p.lat).toBeLessThan(23.5);
    expect(Math.abs(p.lon)).toBeLessThan(2);
  });
  it("December solstice: sun over the Tropic of Capricorn", () => {
    expect(subsolarPoint(new Date("2026-12-21T12:00:00Z")).lat).toBeLessThan(-23);
  });
  it("early November: declination about -16 deg, sun about 4 deg west of the meridian at 12:00 UTC (equation of time +16 min)", () => {
    const p = subsolarPoint(new Date("2026-11-05T12:00:00Z"));
    expect(p.lat).toBeGreaterThan(-17);
    expect(p.lat).toBeLessThan(-15);
    expect(p.lon).toBeGreaterThan(-5);
    expect(p.lon).toBeLessThan(-3);
  });
  it("moves 15 deg west per hour and wraps at the date line", () => {
    const a = subsolarPoint(new Date("2026-03-20T00:00:00Z"));
    expect(Math.abs(Math.abs(a.lon) - 180)).toBeLessThan(3);
    const b = subsolarPoint(new Date("2026-03-20T06:00:00Z"));
    expect(b.lon).toBeGreaterThan(88);
    expect(b.lon).toBeLessThan(93);
    expect(a.lon).toBeGreaterThanOrEqual(-180);
    expect(a.lon).toBeLessThan(180);
  });
});
