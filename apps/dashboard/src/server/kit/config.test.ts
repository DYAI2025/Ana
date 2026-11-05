// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EMPTY_KIT_CONFIG } from "@/features/kit/config";
import { kitConfigFile, readKitConfig } from "./config";

describe("readKitConfig — media-kit.json in the state directory", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "kit-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("lives next to the audience history", () => {
    expect(kitConfigFile({ WORLD_STATE_DIR: "/state" })).toBe(path.join("/state", "media-kit.json"));
    expect(kitConfigFile({ STATE_DIRECTORY: "/var/lib/x" })).toBe(path.join("/var/lib/x", "media-kit.json"));
  });

  it("missing is an empty kit without error; broken JSON is empty with the error flag; valid is parsed", async () => {
    const file = path.join(dir, "media-kit.json");
    expect(await readKitConfig(file)).toEqual({ config: EMPTY_KIT_CONFIG, error: false });
    await writeFile(file, "{nope");
    expect(await readKitConfig(file)).toEqual({ config: EMPTY_KIT_CONFIG, error: true });
    await writeFile(file, JSON.stringify({ tagline: "Hi" }));
    expect((await readKitConfig(file)).config.tagline).toBe("Hi");
    // unreadable (a directory) is an error too
    expect((await readKitConfig(dir)).error).toBe(true);
  });
});
