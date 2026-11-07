// @vitest-environment node
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { findLink, isPreviewAgent, kitLinksFile, kitOpensFile, parseKitLinks, readKitLinks, readOpens, recordOpen } from "./links";

const tok = (c: string) => c.repeat(43);
const A = tok("a");
const B = tok("b");

describe("kit-links.json: public brand links of the media kit", () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "kit-links-"));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("lives next to the audience history, like media-kit.json", () => {
    expect(kitLinksFile({ WORLD_STATE_DIR: "/state" })).toBe(path.join("/state", "kit-links.json"));
    expect(kitOpensFile({ STATE_DIRECTORY: "/var/lib/x" })).toBe(path.join("/var/lib/x", "kit-link-opens.json"));
  });

  it("keeps valid links; drops short or reused tokens, bad or duplicate ids and bad presets", () => {
    const links = parseKitLinks({
      links: [
        { id: "west-1", token: A, preset: "west", label: "English-speaking markets" },
        { id: "asia-1", token: B, preset: "asia", label: "Asia", revoked: true, brand: "Brand X", created_at: "2026-11-06" },
        { id: "short", token: "abc", preset: "west" },
        { id: "reused", token: A, preset: "west" },
        { id: "west-1", token: tok("c"), preset: "west" },
        { id: "Bad Id", token: tok("d"), preset: "west" },
        { id: "bad-preset", token: tok("e"), preset: "../x" },
        "junk",
      ],
    });
    expect(links.map((l) => l.id)).toEqual(["west-1", "asia-1"]);
    expect(links[0]).toEqual({ id: "west-1", token: A, preset: "west", label: "English-speaking markets", brand: null, created_at: null, revoked: false });
    expect(links[1]).toMatchObject({ revoked: true, brand: "Brand X" });
    for (const raw of [null, {}, { links: "x" }, []]) expect(parseKitLinks(raw)).toEqual([]);
  });

  it("finds only an active link; unknown, revoked and malformed tokens find nothing", () => {
    const links = parseKitLinks({ links: [{ id: "west-1", token: A, preset: "west" }, { id: "asia-1", token: B, preset: "asia", revoked: true }] });
    expect(findLink(links, A)?.id).toBe("west-1");
    expect(findLink(links, B)).toBeNull();
    expect(findLink(links, tok("z"))).toBeNull();
    expect(findLink(links, A.slice(0, 42))).toBeNull();
    expect(findLink(links, `${A.slice(0, 42)}é`)).toBeNull();
    expect(findLink([], A)).toBeNull();
  });

  it("a missing or broken file means no links, never an error", async () => {
    expect(await readKitLinks(path.join(dir, "none.json"))).toEqual([]);
    await writeFile(path.join(dir, "bad.json"), "{nope");
    expect(await readKitLinks(path.join(dir, "bad.json"))).toEqual([]);
  });

  it("counts views and link previews per link, also when opens arrive at the same moment; stores no visitor data", async () => {
    const file = path.join(dir, "kit-link-opens.json");
    const t1 = new Date("2026-11-06T10:00:00Z");
    const t2 = new Date("2026-11-06T11:00:00Z");
    await Promise.all([recordOpen("west-1", false, t1, file), recordOpen("west-1", true, t1, file), recordOpen("asia-1", false, t1, file)]);
    await recordOpen("west-1", false, t2, file);
    const opens = await readOpens(file);
    expect(opens["west-1"]).toEqual({ views: 2, previews: 1, first_view_at: t1.toISOString(), last_view_at: t2.toISOString() });
    expect(opens["asia-1"]).toMatchObject({ views: 1, previews: 0 });
    const text = await readFile(file, "utf8");
    expect(Object.keys(JSON.parse(text)).sort()).toEqual(["asia-1", "west-1"]);
    expect((await stat(file)).mode & 0o777).toBe(0o600);
  });

  it("a failed write never throws (the page still renders)", async () => {
    await expect(recordOpen("west-1", false, new Date(), path.join(dir, "missing-dir", "x.json"))).resolves.toBeUndefined();
  });

  it("link previews and scanners are not counted as views", () => {
    for (const ua of [
      "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)",
      "WhatsApp/2.23.20.0",
      "facebookexternalhit/1.1",
      "TelegramBot (like TwitterBot)",
      "Mozilla/5.0 (compatible; Discordbot/2.0)",
      "LinkedInBot/1.0",
      "Microsoft Office/16.0 (Windows NT 10.0; Microsoft Outlook 16.0)",
      "Mozilla/5.0 (compatible; Googlebot/2.1)",
    ]) {
      expect(isPreviewAgent(ua), ua).toBe(true);
    }
    expect(isPreviewAgent(null)).toBe(true);
    expect(isPreviewAgent("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15")).toBe(false);
    expect(isPreviewAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148")).toBe(false);
  });
});
