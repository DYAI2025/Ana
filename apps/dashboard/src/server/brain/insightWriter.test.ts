// @vitest-environment node
import { describe, expect, it } from "vitest";
import type { SocialResult } from "@/features/social/types";
import type { PostTags } from "@/features/world/postTags";
import { createInsightStep } from "./insightWriter";
import { createBrainMcp } from "./mcpClient";

const NOW = Date.parse("2026-11-03T12:00:00Z");

function result(stale = false): SocialResult {
  const p = (id: string, saves: number) => ({
    media_id: id, media_type: "VIDEO", media_product_type: "REELS", format: "reel", caption: "x", permalink: null, thumbnail_url: null,
    published_at: "2026-10-01T00:00:00Z", insights_state: "ok",
    observations: [["reach", 1000], ["saves", saves], ["shares", 10]].map(([m, value]) => ({ media_id: id, metric_name: m, value, availability_state: "VERIFIED" })),
  });
  const snapshot = { observed_at: "2026-11-03T11:50:00Z", posts: [p("101", 90), p("102", 100), p("103", 80), p("201", 10), p("202", 20), p("203", 30)] };
  return (stale ? { ok: true, snapshot, stale: true, failure: { state: "STALE", code: "upstream" } } : { ok: true, snapshot, stale: false }) as unknown as SocialResult;
}
const tag = (theme: PostTags["theme"]): PostTags => ({ theme, ana: "face", shot: "action", hook: "place", cta: "none", mood: "calm", country: null, brand: false, confidence: 0.9 });
const TAGS = { "101": tag("beach"), "102": tag("beach"), "103": tag("beach"), "201": tag("city"), "202": tag("food"), "203": tag("culture") };

/** The Brain's tool answers, kept in memory: refuses existing ids, keeps one body per note. */
function fakeBrain() {
  const notes = new Map<string, string>();
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let down = false;
  const fetchImpl = (async (_url: string, init: RequestInit) => {
    if (down) throw new Error("connect ECONNREFUSED");
    const { params } = JSON.parse(String(init.body)) as { params: { name: string; arguments: Record<string, unknown> } };
    calls.push({ name: params.name, args: params.arguments });
    const id = String(params.arguments.id);
    const answer = (text: string, isError = false) => new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { isError, content: [{ type: "text", text }] } }), { status: 200 });
    if (params.name === "brain_register_source" || params.name === "brain_create_note") {
      if (notes.has(id)) return answer(`exists: note already exists: ${id}`, true);
      notes.set(id, String(params.arguments.body ?? ""));
      return answer(JSON.stringify({ id }));
    }
    if (params.name === "brain_get") return notes.has(id) ? answer(JSON.stringify({ frontmatter: { id }, body: notes.get(id) })) : answer(`not_found: ${id}`, true);
    if (params.name === "brain_append_observation") {
      const block = `obs-${calls.length}-agent-lumen`;
      const c = params.arguments.corrects;
      notes.set(id, `${notes.get(id)}\n- 2026-11-03T12:00:00Z · agent:lumen · ${String(params.arguments.status)} · ${c ? `corrects ^${String(c)} · ` : ""}${String(params.arguments.text)} ^${block}`);
      return answer(JSON.stringify({ block_id: `^${block}` }));
    }
    return answer("unexpected tool", true);
  }) as typeof fetch;
  return { notes, calls, fetchImpl, setDown: (v: boolean) => (down = v) };
}
const appended = (b: ReturnType<typeof fakeBrain>) => b.calls.filter((c) => c.name === "brain_append_observation");
const drive = (fetchImpl: typeof fetch, version = 1, now = () => NOW) => {
  const step = createInsightStep(createBrainMcp({ url: "http://127.0.0.1:8790/mcp", key: "anab_synthetic_key_0000" }, fetchImpl), { derivationVersion: version });
  let last: Promise<unknown> = Promise.resolve();
  return {
    status: step.status,
    schedule: (r: SocialResult, tags: Readonly<Record<string, PostTags>>) => {
      last = step.run(r, tags, now()).catch(() => {});
    },
    idle: () => last,
    run: (r: SocialResult, tags: Readonly<Record<string, PostTags>>) => step.run(r, tags, now()),
  };
};
const writerOn = (b: ReturnType<typeof fakeBrain>, version = 1, now = () => NOW) => drive(b.fetchImpl, version, now);

describe("createInsightStep", () => {
  it("writes source, topic, note and one measurement, in that order, as DERIVED", async () => {
    const b = fakeBrain();
    const w = writerOn(b);
    w.schedule(result(), TAGS);
    await w.idle();
    expect(b.calls.map((c) => c.name).slice(0, 5)).toEqual(["brain_register_source", "brain_create_note", "brain_create_note", "brain_get", "brain_append_observation"]);
    expect(b.calls[0]?.args).toMatchObject({ id: "src-instagram-insights", source: { kind: "url", access: "internal", data_class: "G1" } });
    expect(appended(b)[0]?.args).toMatchObject({ id: "kn-ig-resonanz-reel-beach", status: "DERIVED" });
    expect(JSON.stringify(b.calls)).not.toMatch(/CONFIRMED|supersedes|"caption"/);
    expect(w.status()).toMatchObject({ state: "on", last_day: "2026-11-03", notes: 1, reason: null });
  });

  it("repeats create no duplicates: the same process, a restart, and a lost state all stay at one block", async () => {
    const b = fakeBrain();
    const first = writerOn(b);
    first.schedule(result(), TAGS);
    await first.idle();
    first.schedule(result(), TAGS);
    await first.idle();
    const restarted = writerOn(b);
    restarted.schedule(result(), TAGS);
    await restarted.idle();
    expect(appended(b)).toHaveLength(1);
    expect(b.notes.get("kn-ig-resonanz-reel-beach")?.match(/IG-INSIGHT/g)).toHaveLength(1);
  });

  it("a new day appends, the earlier day stays", async () => {
    const b = fakeBrain();
    const w = writerOn(b);
    w.schedule(result(), TAGS);
    await w.idle();
    const next = writerOn(b, 1, () => NOW + 86_400_000);
    next.schedule(result(), TAGS);
    await next.idle();
    const body = b.notes.get("kn-ig-resonanz-reel-beach") ?? "";
    expect(body).toContain("tag=2026-11-03");
    expect(body).toContain("tag=2026-11-04");
  });

  it("a corrected derivation on the same day corrects the block and keeps it", async () => {
    const b = fakeBrain();
    const w = writerOn(b);
    w.schedule(result(), TAGS);
    await w.idle();
    const old = /\^(obs-\S+)/.exec(b.notes.get("kn-ig-resonanz-reel-beach") ?? "")?.[1];
    const fixed = writerOn(b, 2);
    fixed.schedule(result(), TAGS);
    await fixed.idle();
    expect(appended(b)[1]?.args.corrects).toBe(old);
    const body = b.notes.get("kn-ig-resonanz-reel-beach") ?? "";
    expect(body).toContain("v=1");
    expect(body).toContain("v=2");
  });

  it("an older derivation (a rollback) does not overwrite a newer block of that day", async () => {
    const b = fakeBrain();
    const fixed = writerOn(b, 2);
    fixed.schedule(result(), TAGS);
    await fixed.idle();
    const rolledBack = writerOn(b, 1);
    rolledBack.schedule(result(), TAGS);
    await rolledBack.idle();
    expect(appended(b)).toHaveLength(1);
  });

  it("writes nothing from a stale snapshot and says so", async () => {
    const b = fakeBrain();
    const w = writerOn(b);
    w.schedule(result(true), TAGS);
    await w.idle();
    expect(b.calls).toEqual([]);
    expect(w.status()).toMatchObject({ state: "skipped", reason: "stale-snapshot" });
  });

  it("without categories there is nothing to derive, and it says so", async () => {
    const b = fakeBrain();
    const w = writerOn(b);
    w.schedule(result(), {});
    await w.idle();
    expect(b.calls).toEqual([]);
    expect(w.status()).toMatchObject({ state: "skipped", reason: "tags-incomplete" });
  });

  it("a stale read after a finished day does not take the finished day back", async () => {
    const b = fakeBrain();
    const w = writerOn(b);
    w.schedule(result(), TAGS);
    await w.idle();
    w.schedule(result(true), TAGS);
    await w.idle();
    expect(w.status()).toMatchObject({ state: "on", reason: null, last_day: "2026-11-03" });
  });

  it("a note without a comparison is CANDIDATE from the start", async () => {
    const b = fakeBrain();
    const w = writerOn(b);
    const tags = { "101": TAGS["101"], "102": TAGS["102"], "103": TAGS["103"], "201": TAGS["101"], "202": TAGS["101"], "203": TAGS["101"] } as typeof TAGS;
    w.schedule(result(), tags);
    await w.idle();
    const created = b.calls.find((c) => c.name === "brain_create_note" && String(c.args.id).startsWith("kn-"));
    expect(created?.args.status).toBe("CANDIDATE");
    expect(appended(b)[0]?.args.status).toBe("CANDIDATE");
  });

  it("one refused note does not stop the others; the day stays open and the browser gets no raw error", async () => {
    const b = fakeBrain();
    const real = b.fetchImpl;
    const order: string[] = [];
    const refusing = (async (u: string, init: RequestInit) => {
      const { params } = JSON.parse(String(init.body)) as { params: { name: string; arguments: { id?: string } } };
      if (params.name === "brain_append_observation") order.push(String(params.arguments.id));
      if (params.name === "brain_append_observation" && params.arguments.id === "kn-ig-resonanz-reel-beach") {
        return new Response(JSON.stringify({ jsonrpc: "2.0", id: 1, result: { isError: true, content: [{ type: "text", text: "EACCES: permission denied, open '/var/lib/ana-brain/vault/x'" }] } }), { status: 200 });
      }
      return real(u, init);
    }) as typeof fetch;
    const w = drive(refusing);
    // two themes that both reach three posts
    const six = { ...TAGS, "201": tag("city"), "202": tag("city"), "203": tag("city") };
    w.schedule(result(), six);
    await w.idle();
    expect(order).toEqual(["kn-ig-resonanz-reel-beach", "kn-ig-resonanz-reel-city"]);
    expect(b.notes.get("kn-ig-resonanz-reel-city")).toContain("IG-INSIGHT");
    expect(w.status()).toMatchObject({ state: "error", last_day: null, reason: "brain_append_observation refused" });
    expect(JSON.stringify(w.status())).not.toContain("/var/lib");
  });

  it("an outage rejects (the daily writer backs off), is visible, never shows the key, and the next run completes", async () => {
    const b = fakeBrain();
    b.setDown(true);
    const w = writerOn(b);
    await expect(w.run(result(), TAGS)).rejects.toThrow();
    expect(w.status().state).toBe("error");
    expect(JSON.stringify(w.status())).not.toContain("anab_");
    b.setDown(false);
    await w.run(result(), TAGS);
    expect(w.status().state).toBe("on");
    expect(appended(b)).toHaveLength(1);
  });
});
