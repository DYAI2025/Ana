/**
 * "Das Wichtigste fürs Geschäft": a short brief on what the numbers mean for money — Substack (H1 Opportunity Drop,
 * H4 Working File) and brand partnerships (reach, markets, who). Evidence first:
 *
 * 1. briefFacts() turns the measured, aggregated numbers into numbered facts (F1, F2, …) with the numbers written out.
 * 2. A model reads only these facts and writes patterns that cite fact ids (prompt in server/world/briefService.ts).
 * 3. parseBrief() keeps a pattern only when every id it cites exists and every number in its words appears in the facts
 *    it cites — so the brief can phrase and weigh, but cannot bring a figure of its own.
 *
 * Nothing about people: countries, age and gender bands are Meta's account-wide aggregates; posts are counted by
 * categories, never quoted. Meta does not say which person reacted to which post, so a link between a kind of post and
 * an audience is a correlation across weeks at best, and the facts say how many weeks there are.
 */
import { analyze } from "@/features/social/insights";
import { hypothesisSignals, nextTest } from "@/features/social/offers";
import { deriveThemes } from "@/features/social/themes";
import { instagramView, median, trends, TREND_POINTS, whoView } from "./model";
import { MARKET_SOURCE, marketSplit, tierOf } from "./markets";
import { MIN_N, pulseDigest } from "./pulse";
import { TAG_MIN_CONFIDENCE, whatWorks, type TagField } from "./postTags";
import type { WorldPayload } from "./types";

export type FactKind = "market" | "audience" | "content" | "substack" | "brand" | "limit";
export interface Fact {
  id: string;
  kind: FactKind;
  text: string;
}

/** the part of a stored daily audience snapshot the brief compares (server/world/audienceHistory.ts) */
export interface HistoryDay {
  day: string;
  week: { country: Array<[string, number]>; age: Array<[string, number]>; gender: Array<[string, number]> };
}

const pct = (x: number | null, d = 1) => (x === null ? "—" : `${(x * 100).toFixed(d)} %`);
const pts = (x: number) => `${x > 0 ? "+" : ""}${x.toFixed(1)} Pkt`;

const FIELD_DE: Record<TagField, string> = { theme: "Thema", ana: "Ana im Bild", shot: "Bildart", hook: "Aufmacher", mood: "Stimmung", cta: "Aufforderung", format: "Format" };
const ANA_DE: Record<string, string> = { face: "Gesicht sichtbar", figure: "nur Figur / von weitem", none: "nicht im Bild" };
const valueDe = (f: TagField, v: string) => (f === "ana" ? (ANA_DE[v] ?? v) : v);

const pairShares = (rows: Array<[string, number]>) => {
  const total = rows.reduce((s, [, v]) => s + v, 0);
  return total > 0 ? new Map(rows.map(([k, v]) => [k, v / total])) : new Map<string, number>();
};

export function briefFacts(world: WorldPayload, history: readonly HistoryDay[], nowMs: number): Fact[] {
  const out: Fact[] = [];
  const add = (kind: FactKind, text: string) => out.push({ id: `F${out.length + 1}`, kind, text });
  const a = world.audience;
  const d = pulseDigest(world, nowMs);
  const ig = instagramView(world);
  const tags = world.post_tags.tags;

  // markets: where the engagement sits, in what brands pay for
  const week = marketSplit(a.engaged_country_week);
  const month = marketSplit(a.engaged_country);
  if (week) {
    add("market", `Engagement der letzten 7 Tage nach Werbemarkt (Annahme: ${MARKET_SOURCE}): Tier 1 ${pct(week.t1, 0)}, Tier 2 ${pct(week.t2, 0)}, Tier 3 ${pct(week.t3, 0)}.`);
    if (month) add("market", `Tier-1-Anteil 7 Tage ${pct(week.t1, 0)} gegenüber 30 Tage ${pct(month.t1, 0)} (${pts((week.t1 - month.t1) * 100)}).`);
    if (week.top1.length) add("market", `Größte Tier-1-Länder (7 Tage): ${week.top1.map((c) => `${c.key} ${pct(c.share, 0)}`).join(", ")}.`);
    add("market", "Größenordnung laut veröffentlichten Meta-CPM-Schätzungen 2026 (adamigo.ai): USA etwa 23 $, UK und Deutschland etwa 10 $, Indien etwa 2,60 $ pro 1000 Impressionen.");
  } else if (month) {
    add("market", `Engagement der letzten 30 Tage nach Werbemarkt (Annahme: ${MARKET_SOURCE}): Tier 1 ${pct(month.t1, 0)}, Tier 2 ${pct(month.t2, 0)}, Tier 3 ${pct(month.t3, 0)}.`);
  }
  const moves = trends(a.engaged_country_week, a.engaged_country);
  const rising = [...moves].filter(([, v]) => v >= TREND_POINTS).sort((x, y) => y[1] - x[1]).slice(0, 3);
  const falling = [...moves].filter(([, v]) => v <= -TREND_POINTS).sort((x, y) => x[1] - y[1]).slice(0, 3);
  if (rising.length) add("audience", `Steigend (7 gegen 30 Tage): ${rising.map(([k, v]) => `${k} (Tier ${tierOf(k)}) ${pts(v)}`).join(", ")}.`);
  if (falling.length) add("audience", `Fallend (7 gegen 30 Tage): ${falling.map(([k, v]) => `${k} (Tier ${tierOf(k)}) ${pts(v)}`).join(", ")}.`);

  // who: the week against the month
  const whoLine = (label: string, w: ReturnType<typeof whoView>) => {
    if (!w) return;
    const ages = w.mode === "pyramid" ? w.rows.map((r) => ({ band: r.band, share: r.f + r.m + r.u })) : w.ages;
    const top = [...ages].sort((x, y) => y.share - x.share).slice(0, 2);
    const g = w.mode === "pyramid" ? { f: w.rows.reduce((s, r) => s + r.f, 0), m: w.rows.reduce((s, r) => s + r.m, 0) } : w.gender;
    if (!top.length && !g) return;
    add("audience", `${label}: ${top.length ? `Altersgruppen ${top.map((t) => `${t.band} ${pct(t.share, 0)}`).join(", ")}` : ""}${top.length && g ? "; " : ""}${g ? `weiblich ${pct(g.f, 0)}, männlich ${pct(g.m, 0)}` : ""}.`);
  };
  whoLine("Wer in den letzten 7 Tagen reagiert hat", whoView(a.who.engaged_week));
  whoLine("Wer in den letzten 30 Tagen reagiert hat", whoView(a.who.engaged_month));

  // the stored daily snapshots: how the 7-day audience moved over the days we have
  const days = [...history].sort((x, y) => x.day.localeCompare(y.day));
  const first = days[0];
  const last = days[days.length - 1];
  const span = first && last ? Math.round((Date.parse(`${last.day}T00:00:00Z`) - Date.parse(`${first.day}T00:00:00Z`)) / 86_400_000) : 0;
  if (first && last && span >= 3) {
    const t1 = (rows: Array<[string, number]>) => [...pairShares(rows)].filter(([k]) => tierOf(k) === 1).reduce((s, [, v]) => s + v, 0);
    add("audience", `Tier-1-Anteil im 7-Tage-Fenster am ${first.day}: ${pct(t1(first.week.country), 0)}, am ${last.day}: ${pct(t1(last.week.country), 0)} (${span} Tage auseinander).`);
  }

  // content: which kind of post reaches which rate (post-level, measured)
  const allEr = median(ig.posts.map((p) => p.er).filter((x): x is number => x !== null));
  const allSsr = median(ig.posts.map((p) => p.ssr).filter((x): x is number => x !== null));
  const nEr = ig.posts.filter((p) => p.er !== null).length;
  if (allEr !== null) add("content", `Alle Posts mit Insights: Interaktionsrate im Median ${pct(allEr)} (n ${nEr}), Save+Share-Rate im Median ${pct(allSsr, 2)}.`);
  const byEr = whatWorks(ig.posts, tags, "er").fields;
  const bySsr = whatWorks(ig.posts, tags, "ssr").fields;
  for (const f of ["ana", "theme", "shot", "hook", "mood", "format"] as const) {
    const rows = byEr[f].filter((r) => r.n >= MIN_N);
    if (rows.length >= 2) {
      const best = rows[0]!;
      const worst = rows[rows.length - 1]!;
      add("content", `${FIELD_DE[f]}: höchste Interaktionsrate „${valueDe(f, best.value)}“ ${pct(best.median)} (n ${best.n}), niedrigste „${valueDe(f, worst.value)}“ ${pct(worst.median)} (n ${worst.n}).`);
    }
    const srows = bySsr[f].filter((r) => r.n >= MIN_N);
    if (srows.length >= 2) {
      const best = srows[0]!;
      add("substack", `${FIELD_DE[f]} nach Save+Share-Rate (behalten und weitergeben, Substack-Hinweis): am höchsten „${valueDe(f, best.value)}“ ${pct(best.median, 2)} (n ${best.n}).`);
    }
  }
  if (d.fresh.length) {
    const best = d.fresh[0]!;
    add("content", `Posts der letzten 7 Tage: ${d.fresh.length}; der stärkste hat ${pct(best.er)} Interaktionsrate${best.vsMedian !== null ? ` (${best.vsMedian.toFixed(1)}× Median)` : ""}${best.tags ? `, Kategorien ${best.tags.theme}/${valueDe("ana", best.tags.ana)}/${best.tags.shot}` : ""}.`);
  }
  if (d.brand.n) add("brand", `Posts mit sichtbarer Marke: ${d.brand.n}, Interaktionsrate im Median ${pct(d.brand.er)}; ohne Marke: ${d.brand.otherN}, ${pct(d.brand.otherEr)}.`);
  if (week || month) add("brand", `Reichweite 28 Tage: ${ig.reach28 ?? "—"}; Follower: ${ig.followers ?? "—"}.`);

  // Substack hypotheses of the Instagram cockpit (keyword families of the captions, read here, never sent)
  if (world.instagram.ok) {
    const signals = hypothesisSignals(analyze(world.instagram.snapshot), (post) => deriveThemes(post.caption).families);
    for (const s of signals) {
      const name = s.hypothesis.id === "H1" ? "H1 Opportunity Drop (kuratierte Chancen für Creator-, UGC-, Remote- und Reisearbeit)" : "H4 Working File (praktische Creator- und Business-Dateien aus Anas Arbeit)";
      add(
        "substack",
        s.state === "SIGNAL"
          ? `${name}: ${s.mapped.length} zugeordnete Posts, High-Intent-Index im Median ${s.medianHighIntentIndex?.toFixed(2) ?? "—"}× (1,00× = typisch fürs Format); ${s.supporting.length} stützend, ${s.contradicting.length} widersprechend.`
          : `${name}: ${s.mapped.length} zugeordnete Posts, zu wenige für ein Signal.`,
      );
    }
    const t = nextTest(signals);
    add("substack", t.lean ? `Tendenz zwischen H1 und H4: ${t.lean} (ohne Überschneidung verglichen: ${t.nH1} H1-Posts, ${t.nH4} H4-Posts). Keine Entscheidung.` : `Keine Tendenz zwischen H1 und H4 (ohne Überschneidung: ${t.nH1} H1-Posts, ${t.nH4} H4-Posts).`);
  }

  // limits, stated as facts so the brief can name them
  const tagged = ig.posts.filter((p) => (tags[p.id]?.confidence ?? 0) >= TAG_MIN_CONFIDENCE).length;
  add("limit", `Gespeicherte Tagesstände der Zielgruppe: ${days.length} (seit ${first?.day ?? "—"}). Post-Kategorien gelesen für ${tagged} von ${ig.posts.length} Posts.`);
  add("limit", "Meta liefert Länder, Alter und Geschlecht nur für das ganze Konto (bis 48 h verzögert, erst ab 100 Interaktionen), nicht pro Post: ein Zusammenhang zwischen einer Post-Art und einer Zielgruppe lässt sich nur über viele Wochen als Korrelation zeigen.");
  add("limit", "Substack, Link-Klicks und Verkäufe sind nicht verbunden: Nachfrage lässt sich hier nicht messen, nur Vorzeichen auf Instagram.");
  return out;
}

export type PatternKind = "content" | "audience" | "brand" | "substack";
export interface BriefPattern {
  kind: PatternKind;
  title: string;
  text: string;
  facts: string[];
  counter: string | null;
  counter_facts: string[];
  strength: "weak" | "medium" | "strong";
}
export interface Brief {
  headline: string;
  patterns: BriefPattern[];
  brands: { text: string; facts: string[] } | null;
  substack: { text: string; facts: string[]; lean: "H1" | "H4" | null } | null;
  next_test: string | null;
  limits: string[];
  /** patterns the check removed (unknown fact, or a number not in its facts) */
  dropped: number;
}

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const NUM = /\d+(?:[.,]\d+)?/g;
const norm = (s: string) => s.replace(",", ".").replace(/^0+(?=\d)/, "");

/** names that carry a digit but are not figures: H1/H4, Tier 1–3 and the 7/28/30-day windows */
const NAMES = /\b(?:H[1-4]|Tier ?[123])\b|\b(?:7|28|30)[ -]?(?:Tage[n]?|days?|T\.?)(?=\W|$)/giu;

/** every number in `text` appears in the texts of the cited facts (7 and 7.0 count as the same) */
export function numbersBacked(text: string, cited: readonly Fact[]): boolean {
  text = text.replace(NAMES, " ");
  const pool = new Set<string>();
  for (const f of cited) for (const m of f.text.match(NUM) ?? []) {
    pool.add(norm(m));
    pool.add(String(Number(norm(m))));
  }
  return (text.match(NUM) ?? []).every((m) => pool.has(norm(m)) || pool.has(String(Number(norm(m)))));
}

/** The model's answer, checked against the facts. Null when it is not a brief at all. */
export function parseBrief(raw: unknown, facts: readonly Fact[]): Brief | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const byId = new Map(facts.map((f) => [f.id, f]));
  const ids = (v: unknown) => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string" && byId.has(x)))].slice(0, 8) : []);
  const cite = (list: string[]) => list.map((id) => byId.get(id) as Fact);
  const headline = str(o.headline, 160);
  if (!headline) return null;
  let dropped = 0;
  const patterns: BriefPattern[] = [];
  for (const p of Array.isArray(o.patterns) ? o.patterns.slice(0, 6) : []) {
    const q = (p ?? {}) as Record<string, unknown>;
    const kind = ["content", "audience", "brand", "substack"].includes(q.kind as string) ? (q.kind as PatternKind) : null;
    const strength = ["weak", "medium", "strong"].includes(q.strength as string) ? (q.strength as BriefPattern["strength"]) : null;
    const f = ids(q.facts);
    const cf = ids(q.counter_facts);
    const title = str(q.title, 90);
    const text = str(q.text, 450);
    const counter = str(q.counter, 300) || null;
    const ok = kind && strength && title && text && f.length > 0 && numbersBacked(`${title} ${text}`, cite(f)) && (!counter || numbersBacked(counter, cite([...f, ...cf])));
    if (!ok) {
      dropped++;
      continue;
    }
    patterns.push({ kind, title, text, facts: f, counter, counter_facts: cf, strength });
  }
  const section = (v: unknown) => {
    const q = (v ?? {}) as Record<string, unknown>;
    const text = str(q.text, 550);
    const f = ids(q.facts);
    return text && f.length && numbersBacked(text, cite(f)) ? { text, facts: f } : null;
  };
  const brands = section(o.brands);
  const sub = section(o.substack);
  const leanRaw = ((o.substack ?? {}) as Record<string, unknown>).lean;
  const nextTest = str(o.next_test, 450);
  return {
    headline: numbersBacked(headline, facts) ? headline : "",
    patterns: patterns.slice(0, 5),
    brands,
    substack: sub ? { ...sub, lean: leanRaw === "H1" || leanRaw === "H4" ? leanRaw : null } : null,
    next_test: nextTest && numbersBacked(nextTest, facts) ? nextTest : null,
    limits: (Array.isArray(o.limits) ? o.limits : []).map((l) => str(l, 250)).filter((l) => l && numbersBacked(l, facts)).slice(0, 4),
    dropped,
  };
}

export interface BriefRecord {
  /** when the brief was written, ISO */
  at: string;
  /** ISO week of the Berlin day, e.g. 2026-w45 */
  week: string;
  kind: "weekly" | "now";
  model: string;
  facts: Fact[];
  brief: Brief;
}
