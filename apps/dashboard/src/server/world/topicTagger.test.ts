// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { OFFICE_TOPICS, OFFICE_VERSION } from "@/features/world/office";
import { createTopicTagger, parseTopicAnswer, topicPrompt, TOPIC_BATCH } from "./topicTagger";

const config = { key: "k".repeat(30), model: "claude-haiku-5-5", timeoutMs: 1000 };
const known = new Set(OFFICE_TOPICS.map((t) => t.id));

function fakeApi(reply: (n: number) => unknown, status = 200) {
  const calls: Array<{ body: string }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (String(input).includes("cdninstagram")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
    calls.push({ body: String(init?.body ?? "") });
    const r = reply(calls.length);
    return new Response(JSON.stringify({ content: [{ type: "text", text: typeof r === "string" ? r : JSON.stringify(r) }] }), { status });
  }) as typeof fetch;
  return { impl, calls };
}

const post = (id: string) => ({ id, cover: "https://scontent.cdninstagram.com/x.jpg", caption: `SECRET-CAPTION-${id}` });

describe("office topics of Ana's posts — ids only, read in the background", () => {
  let dir = "";
  let file = "";
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "topics-"));
    file = path.join(dir, "world-post-topics.json");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("keeps only known ids, at most three, and refuses malformed answers", () => {
    expect(parseTopicAnswer(`ok ${JSON.stringify({ topics: ["homesick", "made-up", "homesick"], confidence: 0.8 })}`, known)).toEqual({ topics: ["homesick"], confidence: 0.8 });
    expect(parseTopicAnswer(JSON.stringify({ topics: ["homesick", "solo-lessons", "quit-to-travel", "travel-budget"], confidence: 0.9 }), known)?.topics).toHaveLength(3);
    expect(parseTopicAnswer(JSON.stringify({ topics: "homesick", confidence: 0.8 }), known)).toBeNull();
    expect(parseTopicAnswer(JSON.stringify({ topics: [], confidence: 1.5 }), known)).toBeNull();
    expect(parseTopicAnswer("no json", known)).toBeNull();
  });

  it("the prompt lists every topic with what it covers", () => {
    const p = topicPrompt(OFFICE_TOPICS);
    for (const t of OFFICE_TOPICS) expect(p).toContain(`- ${t.id}: ${t.about}`);
  });

  it("reads a few posts per run (one model call each), sends cover and caption, stores only the ids; unsure readings count as 'no topic'", async () => {
    const api = fakeApi((n) => (n === 2 ? { topics: ["solo-lessons"], confidence: 0.3 } : { topics: ["solo-lessons", "homesick"], confidence: 0.9 }));
    const t = createTopicTagger(config, file, api.impl);
    const posts = Array.from({ length: TOPIC_BATCH + 1 }, (_, i) => post(`p${i}`));
    t.schedule(posts);
    await t.idle();
    expect(api.calls.length).toBe(TOPIC_BATCH);
    expect(t.current().p0).toEqual(["solo-lessons", "homesick"]);
    expect(t.current().p1).toEqual([]);
    const sent = JSON.parse(api.calls[0]?.body ?? "{}");
    expect(sent.messages[0].content[0].type).toBe("image");
    expect(sent.messages[0].content[1].text).toContain("<caption>SECRET-CAPTION-p0</caption>");
    const stored = await readFile(file, "utf8");
    expect(stored).not.toContain("SECRET-CAPTION");
    expect(JSON.parse(stored).version).toBe(OFFICE_VERSION);
    t.schedule(posts);
    await t.idle();
    t.schedule(posts);
    await t.idle();
    expect(api.calls.length).toBe(TOPIC_BATCH + 1);
    // a new process starts from the file and asks nothing again
    const again = fakeApi(() => ({ topics: [], confidence: 1 }));
    const t2 = createTopicTagger(config, file, again.impl);
    t2.schedule(posts);
    await t2.idle();
    expect(again.calls.length).toBe(0);
    expect(t2.current().p0).toEqual(["solo-lessons", "homesick"]);
  });

  it("another catalog version reads every post again; a failed call waits 30 minutes", async () => {
    await writeFile(file, JSON.stringify({ version: "old", readings: { p0: { topics: ["homesick"], confidence: 0.9 } } }));
    let now = 0;
    let down = true;
    const api = fakeApi(() => (down ? "" : { topics: [], confidence: 1 }), 200);
    const failing = (async (input: RequestInfo | URL, init?: RequestInit) => (down && !String(input).includes("cdninstagram") ? new Response("no", { status: 500 }) : api.impl(input, init))) as typeof fetch;
    const t = createTopicTagger(config, file, failing, () => now);
    t.schedule([post("p0")]);
    await t.idle();
    expect(t.current()).toEqual({});
    down = false;
    t.schedule([post("p0")]);
    await t.idle();
    expect(t.current()).toEqual({});
    // the failed post is visible as failing until it is read
    expect(t.failing()).toBe(1);
    now += 31 * 60_000;
    t.schedule([post("p0")]);
    await t.idle();
    expect(t.current()).toEqual({ p0: [] });
    expect(t.failing()).toBe(0);
  });

  it("an unreadable store is never overwritten: nothing is read or written until it loads", async () => {
    await writeFile(file, "{ not json");
    const api = fakeApi(() => ({ topics: ["homesick"], confidence: 0.9 }));
    const t = createTopicTagger(config, file, api.impl);
    t.schedule([post("p0")]);
    await t.idle();
    expect(api.calls.length).toBe(0);
    expect(await readFile(file, "utf8")).toBe("{ not json");
    // once the file is readable again the next schedule loads it and continues
    await writeFile(file, JSON.stringify({ version: OFFICE_VERSION, readings: { p9: { topics: ["solo-lessons"], confidence: 0.9, model: "m", at: "2026-11-04T00:00:00.000Z" } } }));
    t.schedule([post("p0")]);
    await t.idle();
    expect(api.calls.length).toBe(1);
    const stored = JSON.parse(await readFile(file, "utf8"));
    expect(Object.keys(stored.readings).sort()).toEqual(["p0", "p9"]);
    expect(stored.readings.p9).toMatchObject({ model: "m", at: "2026-11-04T00:00:00.000Z" });
  });
});
