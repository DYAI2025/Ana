// @vitest-environment node
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { WorldPayload } from "@/features/world/types";
import { brainWriterConfigFromEnv, createBrainWriter, isoWeek, SOURCE_ID, TOPICS, weekNoteId } from "./brainWriter";

const KEY = "anab_" + "k".repeat(40);
const config = { url: "http://127.0.0.1:8790/mcp", key: KEY };
const NOW = Date.parse("2026-11-03T10:00:00.000Z");
const N = { state: "not_fetched" as const, reason: null, results: [] };

function world(): WorldPayload {
  return {
    version: 1,
    generated_at: new Date(NOW).toISOString(),
    instagram: { ok: false, failure: { code: "not-configured" } } as unknown as WorldPayload["instagram"],
    pulse: { state: "ok", reason: null, fetched_at: null, followers: null, media_count: null, items: [] },
    audience: {
      state: "ok", reason: null, fetched_at: null, timeframe: "this_month",
      engaged_country: { state: "ok", reason: null, results: [{ key: "DE", value: 50 }, { key: "TH", value: 50 }] },
      engaged_country_week: { state: "ok", reason: null, results: [{ key: "TH", value: 70 }, { key: "DE", value: 30 }] },
      engaged_city: N, engaged_city_week: N, follower_country: N, follower_city: N,
      who: { engaged_week: { age: N, gender: N, age_gender: N }, engaged_month: { age: N, gender: N, age_gender: N }, follower: { age: N, gender: N, age_gender: N } },
      history: { days: 0, since: null },
    },
    work: { state: "not-configured", reason: null, fetched_at: null, issues: [] },
    places: { ana: null },
    ana_look: {} as WorldPayload["ana_look"],
    release: { sha: null, started_at: new Date(NOW).toISOString() },
    post_tags: { state: "off", tags: {} },
    post_topics: { state: "off", version: "t", topics: {}, failing: 0 },
    brain: { state: "off", last_day: null, note: null, reason: null },
    brief: { state: "off", busy: false, latest: null, weekly: null, in_brain: false, brain: false, reason: null },
  } as WorldPayload;
}

function fakeBrain(answer: (name: string, args: Record<string, unknown>) => { isError?: boolean; text?: string } | number = () => ({})) {
  const calls: Array<{ name: string; args: Record<string, unknown>; auth: string | null; url: string }> = [];
  const impl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { id: number; params: { name: string; arguments: Record<string, unknown> } };
    calls.push({ name: body.params.name, args: body.params.arguments, auth: new Headers(init?.headers).get("authorization"), url: String(input) });
    const a = answer(body.params.name, body.params.arguments);
    if (typeof a === "number") return new Response("no", { status: a });
    return Response.json({ jsonrpc: "2.0", id: body.id, result: { isError: a.isError, content: [{ type: "text", text: a.text ?? "{}" }] } });
  }) as typeof fetch;
  return { impl, calls };
}

describe("Brain writer — Was läuft, once per Berlin day as agent:lumen", () => {
  let dir = "";
  let file = "";
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "brainw-"));
    file = path.join(dir, "world-brain-sync.json");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("only a loopback Brain gets the key", () => {
    expect(brainWriterConfigFromEnv({ ANA_BRAIN_MCP_URL: "http://127.0.0.1:8790/mcp", ANA_BRAIN_WRITE_KEY: KEY })).toEqual(config);
    expect(brainWriterConfigFromEnv({ ANA_BRAIN_MCP_URL: "https://mcp.ana.dyai.cloud/mcp", ANA_BRAIN_WRITE_KEY: KEY })).toBeNull();
    expect(brainWriterConfigFromEnv({ ANA_BRAIN_MCP_URL: "http://127.0.0.1.evil.example/mcp", ANA_BRAIN_WRITE_KEY: KEY })).toBeNull();
    expect(brainWriterConfigFromEnv({ ANA_BRAIN_MCP_URL: "http://127.0.0.1:8790/mcp" })).toBeNull();
  });

  it("sets up source and topics once, a week note, then one DERIVED observation per day", async () => {
    const b = fakeBrain();
    const w = createBrainWriter(config, file, b.impl, () => NOW);
    w.schedule(world(), NOW);
    await w.idle();
    expect(b.calls.map((c) => c.name)).toEqual(["brain_register_source", "brain_create_note", "brain_create_note", "brain_create_note", "brain_get", "brain_append_observation"]);
    expect(b.calls.every((c) => c.auth === `Bearer ${KEY}` && c.url === config.url)).toBe(true);
    expect(b.calls[0]?.args).toMatchObject({ id: SOURCE_ID, source: { kind: "url", data_class: "G1" } });
    // the topics frame what the numbers are for: CANDIDATE until a person confirms them
    expect(b.calls[1]?.args).toMatchObject({ id: TOPICS.substack, type: "topic", status: "CANDIDATE" });
    expect(b.calls[2]?.args).toMatchObject({ id: TOPICS.brands, type: "topic", status: "CANDIDATE" });
    expect(b.calls[3]?.args).toMatchObject({ id: "kn-world-pulse-2026-w45", type: "observation", status: "DERIVED", topics: [TOPICS.substack, TOPICS.brands] });
    expect(b.calls[4]?.args).toEqual({ id: "kn-world-pulse-2026-w45" });
    const obs = b.calls[5]?.args as { id: string; text: string; status: string };
    expect(obs).toMatchObject({ id: "kn-world-pulse-2026-w45", status: "DERIVED" });
    expect(obs.text).toContain("Steigend: TH +20.0 Pkt");
    // nothing asks for CONFIRMED, nothing supersedes
    expect(JSON.stringify(b.calls)).not.toMatch(/CONFIRMED|supersedes|confirm/);
    expect(w.status()).toEqual({ state: "on", last_day: "2026-11-03", note: "kn-world-pulse-2026-w45", reason: null });
    // the same day again: nothing; a new process reads the day from the file
    w.schedule(world(), NOW + 3_600_000);
    await w.idle();
    expect(b.calls.length).toBe(6);
    const again = fakeBrain();
    const w2 = createBrainWriter(config, file, again.impl, () => NOW);
    w2.schedule(world(), NOW);
    await w2.idle();
    expect(again.calls.length).toBe(0);
    // the next day: only the observation
    w2.schedule(world(), NOW + 86_400_000);
    await w2.idle();
    expect(again.calls.map((c) => c.name)).toEqual(["brain_get", "brain_append_observation"]);
  });

  it("a day the note already carries is not appended again (a timed-out append that landed, a lost state file)", async () => {
    const b = fakeBrain((name) => (name === "brain_get" ? { text: JSON.stringify({ body: "## Observations\n- 2026-11-03T09:00:00Z · agent:lumen · DERIVED · Puls 2026-11-03 (Instagram …)" }) } : {}));
    const w = createBrainWriter(config, file, b.impl, () => NOW);
    w.schedule(world(), NOW);
    await w.idle();
    expect(b.calls.map((c) => c.name)).not.toContain("brain_append_observation");
    expect(w.status()).toMatchObject({ state: "on", last_day: "2026-11-03" });
  });

  it("a state file that cannot be written is reported, and the next process still does not append twice", async () => {
    const blocked = path.join(dir, "no-dir-here", "\0bad");
    const b = fakeBrain();
    const w = createBrainWriter(config, blocked, b.impl, () => NOW);
    w.schedule(world(), NOW);
    await w.idle();
    expect(w.status()).toMatchObject({ state: "error", reason: expect.stringContaining("state file") });
    expect(b.calls.filter((c) => c.name === "brain_append_observation").length).toBe(1);
  });

  it("notes that already exist count as done; an error waits 30 minutes and never shows the key", async () => {
    let t = NOW;
    let down = true;
    const b = fakeBrain((name) => (name === "brain_append_observation" && down ? 500 : name !== "brain_append_observation" && name !== "brain_get" ? { isError: true, text: "exists: note already exists" } : {}));
    const w = createBrainWriter(config, file, b.impl, () => t);
    w.schedule(world(), t);
    await w.idle();
    expect(w.status()).toMatchObject({ state: "error", last_day: null, reason: "brain_append_observation: HTTP 500" });
    expect(JSON.stringify(w.status())).not.toContain(KEY);
    const n = b.calls.length;
    down = false;
    w.schedule(world(), t);
    await w.idle();
    expect(b.calls.length).toBe(n);
    t += 31 * 60_000;
    w.schedule(world(), t);
    await w.idle();
    expect(w.status()).toMatchObject({ state: "on", last_day: "2026-11-03" });
    // a refusal that is not "exists" is an error
    const r = fakeBrain(() => ({ isError: true, text: "forbidden: nope" }));
    const w3 = createBrainWriter(config, path.join(dir, "other.json"), r.impl, () => NOW);
    w3.schedule(world(), NOW);
    await w3.idle();
    expect(w3.status()).toMatchObject({ state: "error", reason: "brain_register_source: forbidden: nope" });
  });

  it("ISO weeks across a year end", () => {
    expect(isoWeek("2026-11-03")).toBe("2026-w45");
    expect(isoWeek("2027-01-01")).toBe("2026-w53");
    expect(isoWeek("2025-12-29")).toBe("2026-w01");
    expect(weekNoteId("2026-01-05")).toBe("kn-world-pulse-2026-w02");
  });
});
