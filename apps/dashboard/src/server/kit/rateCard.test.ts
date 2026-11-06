// @vitest-environment node
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EMPTY_RATE_CARD } from "@/features/kit/rateCard";
import { rateCardFile, readRateCard } from "./rateCard";

describe("rate-card.json on the server", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "rate-card-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("lives next to media-kit.json in the state directory", () => {
    expect(rateCardFile({ WORLD_STATE_DIR: "/state" })).toBe(path.join("/state", "rate-card.json"));
  });

  it("missing means no card without an error; unreadable means no card with the flag", async () => {
    expect(await readRateCard(path.join(dir, "none.json"))).toEqual({ card: EMPTY_RATE_CARD, error: false });
    await writeFile(path.join(dir, "bad.json"), "{nope");
    expect(await readRateCard(path.join(dir, "bad.json"))).toEqual({ card: EMPTY_RATE_CARD, error: true });
    await writeFile(path.join(dir, "ok.json"), JSON.stringify({ rates: [{ id: "reel", name: "Reel", quote: 1500 }] }));
    expect((await readRateCard(path.join(dir, "ok.json"))).card.rates).toHaveLength(1);
  });

  it("nothing a brand can open reads it: only the API route imports the server module, no kit page imports the card", async () => {
    const { readdirSync, readFileSync } = await import("node:fs");
    const files = (readdirSync("src", { recursive: true }) as string[]).filter((f) => /\.tsx?$/.test(f)).map((f) => path.join("src", f));
    const importsServer = files
      .filter((f) => {
        const text = readFileSync(f, "utf8");
        return text.includes('from "@/server/kit/rateCard"') || (path.dirname(f) === path.join("src", "server", "kit") && text.includes('from "./rateCard"'));
      })
      .sort();
    expect(importsServer).toEqual(["src/app/api/rate-card/route.ts", "src/server/kit/rateCard.test.ts"]);
    const kitPages = files.filter((f) => (f.startsWith(path.join("src", "app", "kit")) || f.startsWith(path.join("src", "features", "kit"))) && f.endsWith(".tsx") && readFileSync(f, "utf8").includes("rateCard"));
    expect(kitPages).toEqual([]);
  });
});
