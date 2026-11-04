// @vitest-environment node
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { NOW, world } from "@/features/world/worldFixture";
import { BRIEF_MIN_GAP_MS, createBriefService, parseBriefAnswer } from "./briefService";
import type { BrainCall } from "./brainWriter";

const config = { key: "k".repeat(30), model: "claude-haiku-5-5", timeoutMs: 1000 };
const answer = (factIds = ["F1"]) => ({
  headline: "Tier 1 trägt die Woche",
  patterns: [{ kind: "brand", title: "Tier 1 vorn", text: "Ein großer Teil des Engagements kommt aus Tier 1.", facts: factIds, counter: null, counter_facts: [], strength: "weak" }],
  brands: { text: "Für Marken zählt Tier 1.", facts: factIds },
  substack: null,
  next_test: "Zwei Posts im selben Format vergleichen.",
  limits: ["Meta liefert Zielgruppen nur kontoweit."],
});

function fakeModel(reply: () => unknown = () => answer()) {
  const prompts: string[] = [];
  const impl = (async (_u: RequestInfo | URL, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: Array<{ text: string }> }> };
    prompts.push(body.messages[0]!.content[0]!.text);
    const r = reply();
    return Response.json({ content: [{ type: "text", text: typeof r === "string" ? r : JSON.stringify(r) }] });
  }) as typeof fetch;
  return { impl, prompts };
}

describe("brief service — button and weekly brief", () => {
  let dir = "";
  let file = "";
  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "brief-"));
    file = path.join(dir, "world-brief.json");
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("the button writes a brief from the facts only (no caption), and returns the same one for 10 minutes", async () => {
    let t = NOW;
    const m = fakeModel();
    const s = createBriefService({ config, readHistory: async () => [], brain: null, file, fetchImpl: m.impl, now: () => t });
    const r = await s.generate(world(), "de");
    expect(r).toMatchObject({ ok: true, fresh: true, record: { kind: "now", week: "2026-w45", model: "claude-haiku-5-5" } });
    if (!r.ok) return;
    expect(r.record.brief.patterns).toHaveLength(1);
    expect(r.record.facts[0]?.id).toBe("F1");
    expect(m.prompts[0]).toContain("F1 [market]");
    expect(m.prompts[0]).not.toContain("SECRET");
    t += BRIEF_MIN_GAP_MS - 1000;
    expect(await s.generate(world(), "de")).toMatchObject({ ok: true, fresh: false });
    expect(m.prompts).toHaveLength(1);
    t += 2000;
    expect(await s.generate(world(), "de")).toMatchObject({ ok: true, fresh: true });
    expect(s.state()).toMatchObject({ state: "on", latest: { de: { kind: "now", locale: "de" } }, weekly: {} });
    expect(JSON.parse(await readFile(file, "utf8")).latest.kind).toBe("now");
  });

  it("presses at the same time share one model call; a weekly run does not make the button wait", async () => {
    const m = fakeModel();
    const s = createBriefService({ config, readHistory: async () => [], brain: null, file, fetchImpl: m.impl, now: () => NOW });
    s.scheduleWeekly(world());
    const rs = await Promise.all([s.generate(world(), "de"), s.generate(world(), "de"), s.generate(world(), "de")]);
    await s.idle();
    expect(rs.every((r) => r.ok)).toBe(true);
    // the three presses share one answer: at most one call for them, plus one per language for the weekly brief
    // (when the German weekly brief lands first, the presses get it as the newest German brief — no call at all)
    const ats = rs.map((r) => (r.ok ? r.record.at : ""));
    expect(new Set(ats).size).toBe(1);
    expect(m.prompts.length).toBeGreaterThanOrEqual(3);
    expect(m.prompts.length).toBeLessThanOrEqual(4);
  });

  it("an unusable answer is an error, not a brief; the next model call waits 2 minutes", async () => {
    let t = NOW;
    const m = fakeModel(() => answer(["F99"]));
    const s = createBriefService({ config, readHistory: async () => [], brain: null, file, fetchImpl: m.impl, now: () => t });
    expect(await s.generate(world(), "de")).toEqual({ ok: false, reason: "model-answer-unusable" });
    expect(s.state()).toMatchObject({ state: "error", reason: "model-answer-unusable" });
    expect(await s.generate(world(), "de")).toMatchObject({ ok: false });
    expect(m.prompts).toHaveLength(1);
    t += 2 * 60_000 + 1;
    await s.generate(world(), "de");
    expect(m.prompts).toHaveLength(2);
    expect(parseBriefAnswer("no json", [])).toBeNull();
  });

  it("the weekly brief goes into the Brain once per ISO week as CANDIDATE, derived from the week's pulse note", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    let brainDown = true;
    const brain: BrainCall = async (name, args) => {
      calls.push({ name, args });
      if (brainDown) throw new Error("down");
      return "";
    };
    let t = NOW;
    const m = fakeModel();
    const s = createBriefService({ config, readHistory: async () => [], brain, file, fetchImpl: m.impl, now: () => t });
    s.scheduleWeekly(world());
    await s.idle();
    // one weekly brief per language, written although the Brain is down
    expect(m.prompts).toHaveLength(3);
    expect(s.state()).toMatchObject({ state: "error", weekly: { de: { kind: "weekly", week: "2026-w45" }, en: { locale: "en" }, it: { locale: "it" } } });
    // the Brain is back an hour later: the same brief is written, the model is not asked again
    brainDown = false;
    t += 61 * 60_000;
    s.scheduleWeekly(world());
    await s.idle();
    expect(m.prompts).toHaveLength(3);
    const note = calls.filter((c) => c.name === "brain_create_note").at(-1)?.args as Record<string, unknown>;
    expect(note).toMatchObject({ id: "kn-world-brief-2026-w45", type: "concept", status: "CANDIDATE", topics: ["top-substack-signals", "top-brand-partnerships"] });
    expect(String(note.body)).toContain("F1: Engagement der letzten 7 Tage nach Werbemarkt");
    expect(String(note.body)).not.toContain("SECRET");
    expect(calls.at(-1)).toEqual({ name: "brain_add_relation", args: { from: "kn-world-brief-2026-w45", type: "derived_from", to: "kn-world-pulse-2026-w45" } });
    expect(s.state()).toMatchObject({ in_brain: true, brain: true });
    expect(JSON.stringify(calls)).not.toMatch(/CONFIRMED|supersedes|"confirm"/);
    const n = calls.length;
    // same week again, also from a new process: nothing
    s.scheduleWeekly(world());
    await s.idle();
    const s2 = createBriefService({ config, readHistory: async () => [], brain, file, fetchImpl: m.impl, now: () => t });
    s2.scheduleWeekly(world());
    await s2.idle();
    expect(calls.length).toBe(n);
    expect(m.prompts).toHaveLength(3);
    // next week: a new one
    t += 7 * 86_400_000;
    s2.scheduleWeekly(world());
    await s2.idle();
    expect(m.prompts).toHaveLength(6);
    expect(s2.state().weekly.de?.week).toBe("2026-w46");
    expect(s2.state().weekly.it?.week).toBe("2026-w46");
  });

  it("the button writes the brief in the language of the person who presses it — prompt, facts and record", async () => {
    let t = NOW;
    const m = fakeModel();
    const s = createBriefService({ config, readHistory: async () => [], brain: null, file, fetchImpl: m.impl, now: () => t });
    const en = await s.generate(world(), "en");
    expect(en).toMatchObject({ ok: true, fresh: true, record: { locale: "en", kind: "now" } });
    expect(m.prompts[0]).toContain("You are an analyst for Ana");
    expect(m.prompts[0]).toContain("Write every text in English");
    expect(m.prompts[0]).toContain("F1 [market] Engagement of the last 7 days by ad market");
    expect(m.prompts[0]).not.toMatch(/Fakten:|Werbemarkt|gegenüber/);
    // another language is its own brief: the 10-minute gap is per language
    t += 1000;
    const it = await s.generate(world(), "it");
    expect(it).toMatchObject({ ok: true, fresh: true, record: { locale: "it" } });
    expect(m.prompts[1]).toContain("Scrivi ogni testo in italiano");
    expect(m.prompts[1]).toContain("Engagement degli ultimi 7 giorni per mercato pubblicitario");
    expect(await s.generate(world(), "en")).toMatchObject({ ok: true, fresh: false, record: { locale: "en" } });
    expect(m.prompts).toHaveLength(2);
    const st = s.state();
    expect(Object.keys(st.latest).sort()).toEqual(["en", "it"]);
    expect(st.latest.de).toBeUndefined();
  });

  it("a file from before the languages is read as German; the weekly run adds only the missing languages", async () => {
    const old = { kind: "weekly", week: "2026-w45", at: new Date(NOW - 60_000).toISOString(), model: "m", facts: [{ id: "F1", kind: "market", text: "Tier 1 55 %" }], brief: { headline: "Alt", patterns: [], brands: null, substack: null, next_test: null, limits: [], dropped: 0 } };
    await writeFile(file, JSON.stringify({ version: 1, latest: old, weeks: [old] }));
    const m = fakeModel();
    const s = createBriefService({ config, readHistory: async () => [], brain: null, file, fetchImpl: m.impl, now: () => NOW });
    s.scheduleWeekly(world());
    await s.idle();
    expect(m.prompts).toHaveLength(2);
    const st = s.state();
    expect(st.weekly.de?.brief.headline).toBe("Alt");
    expect(st.weekly.en?.locale).toBe("en");
    expect(st.weekly.it?.locale).toBe("it");
    // the old German "latest" is still the German one, not shown for English
    expect(st.latest.de?.brief.headline).toBe("Alt");
  });
});
