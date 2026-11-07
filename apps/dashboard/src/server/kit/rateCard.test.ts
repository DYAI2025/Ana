// @vitest-environment node
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EMPTY_RATE_CARD } from "@/features/kit/rateCard";
import { rateCardFile, readRateCard, saveRateCard } from "./rateCard";

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

  it("saves an edited card for everyone, with who and when; refuses invalid input and never overwrites a newer save", async () => {
    const file = path.join(dir, "rate-card.json");
    const t1 = new Date("2026-11-07T00:30:00Z");
    const first = await saveRateCard({ rates: [{ id: "reel", name: "Instagram Reel", quote: 1500 }], addons: [], tips: [] }, null, "ben@example.com", t1, file);
    expect(first).toMatchObject({ ok: true, card: { updated_at: t1.toISOString(), updated_by: "ben@example.com", rates: [{ id: "reel", quote: 1500 }] } });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    // someone who started before that save cannot overwrite it: they get the current card back
    const stale = await saveRateCard({ rates: [{ id: "reel", name: "Instagram Reel", quote: 900 }] }, null, "vince@example.com", new Date(), file);
    expect(stale).toMatchObject({ ok: false, conflict: true, card: { rates: [{ quote: 1500 }] } });
    // invalid input is refused whole
    const bad = await saveRateCard({ rates: [{ id: "reel", name: "", quote: -1 }] }, t1.toISOString(), "vince@example.com", new Date(), file);
    expect(bad).toMatchObject({ ok: false, conflict: false });
    expect(JSON.parse(await readFile(file, "utf8")).rates[0].quote).toBe(1500);
    // from the current version it saves
    const next = await saveRateCard({ rates: [{ id: "reel", name: "Instagram Reel", quote: 1725, minimum: 1500 }] }, t1.toISOString(), "vince@example.com", new Date("2026-11-07T01:00:00Z"), file);
    expect(next).toMatchObject({ ok: true, card: { updated_by: "vince@example.com", rates: [{ quote: 1725, minimum: 1500 }] } });
    expect((await readRateCard(file)).card.rates[0]!.minimum).toBe(1500);
  });
});
