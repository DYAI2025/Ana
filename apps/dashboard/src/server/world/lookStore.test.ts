// @vitest-environment node
import { mkdtempSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lookFile, parseManual, readManual, writeManual } from "./lookStore";

describe("lookStore", () => {
  it("stores, reads and removes a manual pick", async () => {
    const file = path.join(mkdtempSync(path.join(os.tmpdir(), "look-")), "world-ana-look.json");
    expect(await readManual(file)).toBeNull();
    const pick = { look: "everyday" as const, color: "#d8566f", activity: "reading" as const, set_at: "2026-11-01T10:00:00.000Z" };
    await writeManual(pick, file);
    expect(await readManual(file)).toEqual(pick);
    await writeManual(null, file);
    expect(await readManual(file)).toBeNull();
  });

  it("refuses anything that is not a known look and a #rrggbb colour", () => {
    expect(parseManual({ look: "dragon", color: "auto", set_at: "2026-11-01T10:00:00.000Z" })).toBeNull();
    expect(parseManual({ look: "auto", color: "red", set_at: "2026-11-01T10:00:00.000Z" })).toBeNull();
    expect(parseManual({ look: "auto", color: "auto", set_at: "yesterday" })).toBeNull();
    expect(parseManual("x")).toBeNull();
    expect(parseManual({ look: "auto", color: "auto", activity: "skydiving", set_at: "2026-11-01T10:00:00.000Z" })).toBeNull();
    // picks stored before activities existed read as "auto"
    expect(parseManual({ look: "scooter", color: "auto", set_at: "2026-11-01T10:00:00.000Z" })?.activity).toBe("auto");
  });

  it("uses the unit's cache directory on the server and an override for tests", () => {
    expect(lookFile({ CACHE_DIRECTORY: "/var/cache/dyai/ana-dashboard" })).toBe("/var/cache/dyai/ana-dashboard/world-ana-look.json");
    expect(lookFile({ WORLD_STATE_DIR: "/tmp/x", CACHE_DIRECTORY: "/var/cache/y" })).toBe("/tmp/x/world-ana-look.json");
  });
});
