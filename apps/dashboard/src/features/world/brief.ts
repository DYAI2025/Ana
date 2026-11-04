/**
 * "Das Wichtigste fürs Geschäft": a short brief on what the numbers mean for money — Substack (H1 Opportunity Drop,
 * H4 Working File) and brand partnerships (reach, markets, who). Evidence first:
 *
 * 1. briefFacts() turns the measured, aggregated numbers into numbered facts (F1, F2, …) with the numbers written out.
 * 2. A model reads only these facts and writes patterns that cite fact ids (prompt in server/world/briefService.ts).
 * 3. parseBrief() keeps a pattern only when every id it cites exists, every number written in digits appears in the
 *    facts it cites, and no quantity is written in words (a list of German and English number words — a list is never
 *    complete, so every claim is shown next to the facts it cites). The strength the model gives is capped by what it
 *    cites (capStrength). So the brief can phrase and weigh, but not bring a figure of its own in digits.
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
import { FACT_WORDS } from "./briefText";
import type { Locale } from "@/lib/locale";

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

const pairShares = (rows: Array<[string, number]>) => {
  const total = rows.reduce((s, [, v]) => s + v, 0);
  return total > 0 ? new Map(rows.map(([k, v]) => [k, v / total])) : new Map<string, number>();
};

/**
 * The facts in the dashboard language `locale` (wording in briefText.ts). The same data gives the same facts with the
 * same ids and the same numbers in every language; only the words differ.
 */
export function briefFacts(world: WorldPayload, history: readonly HistoryDay[], nowMs: number, locale: Locale = "de"): Fact[] {
  const L = FACT_WORDS[locale];
  const pts = (x: number) => `${x > 0 ? "+" : ""}${x.toFixed(1)} ${L.pts}`;
  const value = (f: TagField, v: string) => (f === "ana" ? (L.ana[v] ?? v) : v);
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
    add("market", L.split(7, MARKET_SOURCE, pct(week.t1, 0), pct(week.t2, 0), pct(week.t3, 0)));
    if (month) add("market", L.t1VsMonth(pct(week.t1, 0), pct(month.t1, 0), pts((week.t1 - month.t1) * 100)));
    if (week.top1.length) add("market", L.top1(week.top1.map((c) => `${c.key} ${pct(c.share, 0)}`).join(", ")));
    add("market", L.cpm);
  } else if (month) {
    add("market", L.split(30, MARKET_SOURCE, pct(month.t1, 0), pct(month.t2, 0), pct(month.t3, 0)));
  }
  const moves = trends(a.engaged_country_week, a.engaged_country);
  const rising = [...moves].filter(([, v]) => v >= TREND_POINTS).sort((x, y) => y[1] - x[1]).slice(0, 3);
  const falling = [...moves].filter(([, v]) => v <= -TREND_POINTS).sort((x, y) => x[1] - y[1]).slice(0, 3);
  if (rising.length) add("audience", L.rising(rising.map(([k, v]) => L.move(k, tierOf(k), pts(v))).join(", ")));
  if (falling.length) add("audience", L.falling(falling.map(([k, v]) => L.move(k, tierOf(k), pts(v))).join(", ")));

  // who: the week against the month
  const whoLine = (label: string, w: ReturnType<typeof whoView>) => {
    if (!w) return;
    const ages = w.mode === "pyramid" ? w.rows.map((r) => ({ band: r.band, share: r.f + r.m + r.u })) : w.ages;
    const top = [...ages].sort((x, y) => y.share - x.share).slice(0, 2);
    const g = w.mode === "pyramid" ? { f: w.rows.reduce((s, r) => s + r.f, 0), m: w.rows.reduce((s, r) => s + r.m, 0) } : w.gender;
    if (!top.length && !g) return;
    add("audience", `${label}: ${top.length ? L.ages(top.map((t) => `${t.band} ${pct(t.share, 0)}`).join(", ")) : ""}${top.length && g ? "; " : ""}${g ? L.gender(pct(g.f, 0), pct(g.m, 0)) : ""}.`);
  };
  whoLine(L.whoWeek, whoView(a.who.engaged_week));
  whoLine(L.whoMonth, whoView(a.who.engaged_month));

  // the stored daily snapshots: how the 7-day audience moved over the days we have
  const days = [...history].sort((x, y) => x.day.localeCompare(y.day));
  const first = days[0];
  const last = days[days.length - 1];
  const span = first && last ? Math.round((Date.parse(`${last.day}T00:00:00Z`) - Date.parse(`${first.day}T00:00:00Z`)) / 86_400_000) : 0;
  if (first && last && span >= 3) {
    const t1 = (rows: Array<[string, number]>) => [...pairShares(rows)].filter(([k]) => tierOf(k) === 1).reduce((s, [, v]) => s + v, 0);
    add("audience", L.history(first.day, pct(t1(first.week.country), 0), last.day, pct(t1(last.week.country), 0), span));
  }

  // content: which kind of post reaches which rate (post-level, measured)
  const allEr = median(ig.posts.map((p) => p.er).filter((x): x is number => x !== null));
  const allSsr = median(ig.posts.map((p) => p.ssr).filter((x): x is number => x !== null));
  const nEr = ig.posts.filter((p) => p.er !== null).length;
  if (allEr !== null) add("content", L.allPosts(pct(allEr), nEr, pct(allSsr, 2)));
  const byEr = whatWorks(ig.posts, tags, "er").fields;
  const bySsr = whatWorks(ig.posts, tags, "ssr").fields;
  for (const f of ["ana", "theme", "shot", "hook", "mood", "format"] as const) {
    const rows = byEr[f].filter((r) => r.n >= MIN_N);
    if (rows.length >= 2) {
      const best = rows[0]!;
      const worst = rows[rows.length - 1]!;
      add("content", L.bestWorst(L.field[f], value(f, best.value), pct(best.median), best.n, value(f, worst.value), pct(worst.median), worst.n));
    }
    const srows = bySsr[f].filter((r) => r.n >= MIN_N);
    if (srows.length >= 2) {
      const best = srows[0]!;
      add("substack", L.ssrBest(L.field[f], value(f, best.value), pct(best.median, 2), best.n));
    }
  }
  if (d.fresh.length) {
    const best = d.fresh[0]!;
    add("content", L.fresh(d.fresh.length, pct(best.er), best.vsMedian !== null ? best.vsMedian.toFixed(1) : null, best.tags ? `${best.tags.theme}/${value("ana", best.tags.ana)}/${best.tags.shot}` : null));
  }
  if (d.brand.n) add("brand", L.brand(pct(d.brand.er), d.brand.n, pct(d.brand.otherEr), d.brand.otherN));
  if (week || month) add("brand", L.reach(String(ig.reach28 ?? "—"), String(ig.followers ?? "—")));

  // Substack hypotheses of the Instagram cockpit (keyword families of the captions, read here, never sent)
  if (world.instagram.ok) {
    const signals = hypothesisSignals(analyze(world.instagram.snapshot), (post) => deriveThemes(post.caption).families);
    for (const s of signals) {
      const name = L.hypName(s.hypothesis.id === "H1" ? "H1" : "H4");
      add("substack", s.state === "SIGNAL" ? L.hypSignal(name, s.mapped.length, s.medianHighIntentIndex?.toFixed(2) ?? "—", s.supporting.length, s.contradicting.length) : L.hypThin(name, s.mapped.length));
    }
    const t = nextTest(signals);
    add("substack", t.lean ? L.lean(L.hypLabel(t.lean), t.nH1, t.nH4) : L.noLean(t.nH1, t.nH4));
  }

  // limits, stated as facts so the brief can name them
  const tagged = ig.posts.filter((p) => (tags[p.id]?.confidence ?? 0) >= TAG_MIN_CONFIDENCE).length;
  add("limit", L.limitHistory(days.length, first?.day ?? "—", tagged, ig.posts.length));
  add("limit", L.limitMeta);
  add("limit", L.limitSubstack);
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
/** digits in any script, with grouping or a decimal mark: "6.1", "6,10", "1.000", "40 000" is two tokens */
const NUM = /\p{Nd}+(?:[.,]\p{Nd}+)*/gu;
/** "1.000" / "22,000" are grouped integers (German or English), never 1 or 22 */
const GROUPED = /^\d{1,3}(?:[.,]\d{3})+$/;

/** a number token as one canonical string; null when it is not plain ASCII digits */
function canon(token: string): string | null {
  if (!/^[0-9.,]+$/.test(token)) return null;
  if (GROUPED.test(token)) return String(Number(token.replace(/[.,]/g, "")));
  if (/[.,].*[.,]/.test(token)) return null;
  const n = Number(token.replace(",", "."));
  return Number.isFinite(n) ? String(n) : null;
}

/** names that carry a digit but are not figures: H1/H4, Tier 1–3 and the 7/28/30-day windows (German, English, Italian) */
const NAMES = /(?<![\p{L}\p{N}])(?:H[1-4]|Tier ?[123])(?![\p{L}\p{N}])|(?<![\p{L}\p{N}])(?:7|28|30)[ -](?:Tage|Tagen|days?|giorni)(?![\p{L}\p{N}])/gu;

/** quantities in words bring figures too (German, English, Italian): a claim with one of them is not backed by any fact ("einfach" is not one) */
const NUMBER_WORDS = new RegExp(
  `(?<![\\p{L}])(?:${[
    "(?:zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn|elf|zwölf)(?:mal|fach\\p{L}*|zehn\\p{L}*|zig\\p{L}*|tel\\p{L}*|stellig\\p{L}*|hundert\\p{L}*|tausend\\p{L}*|einhalb|viertel)?",
    "eins", "zwanzig\\p{L}*", "dreißig\\p{L}*", "sechzig\\p{L}*", "siebzig\\p{L}*", "sechzehn\\p{L}*", "siebzehn\\p{L}*", "hundert\\p{L}*", "tausend\\p{L}*", "dutzend\\p{L}*",
    "million(?:en)?", "milliarde(?:n)?", "ver(?:doppel|drei|vier|fünf|sechs|zehn|hundert|tausend|viel)fach\\p{L}*",
    "hälfte", "halb(?:e|en|er|so)?", "halbier\\p{L}*", "doppel(?:t|te|ten|ter)?", "verdoppel\\p{L}*", "drittel", "viertel",
    "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "\\p{L}*teen", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety",
    "hundred\\p{L}*", "thousand\\p{L}*", "million", "billion", "half", "once", "twice", "thrice", "double(?:d|s)?", "triple(?:d|s)?", "\\p{L}+fold", "third", "quarter",
    // Italian ("un", "uno", "una" are articles too, like "ein"/"eine" — left out)
    "due", "tre", "quattro", "cinque", "sei", "sette", "otto", "nove", "dieci", "undici", "dodici", "tredici", "quattordici", "quindici", "sedici", "venti\\p{L}*", "trenta\\p{L}*", "quaranta\\p{L}*", "cinquanta\\p{L}*",
    "cento\\p{L}*", "mille", "(?:due|tre|quattro|cinque|sei|sette|otto|nove|dieci)mila", "milion[ei]", "miliard[oi]", "metà", "dimezza\\p{L}*", "doppi[oa]?", "raddoppi\\p{L}*", "tripl[oa]", "triplica\\p{L}*", "terz[oi]", "quart[oi]", "decin[ae]", "dozzin[ae]",
  ].join("|")})(?![\\p{L}])`,
  "iu",
);

/** "40 000" (space or narrow space as a thousands separator) is one number */
const joinSpaced = (s: string) => s.replace(/(\p{Nd})[   ](?=\p{Nd}{3}(?!\p{Nd}))/gu, "$1");

/**
 * Every number in `text` appears in the texts of the cited facts (6.1 = 6,10; 1.000 = 1000), and no quantity is
 * written in words. Checks tokens, not their role: a fact's number can still be put in the wrong place, which is why
 * every claim shows its facts.
 */
export function numbersBacked(text: string, cited: readonly Fact[]): boolean {
  if (NUMBER_WORDS.test(text)) return false;
  const pool = new Set<string>();
  for (const f of cited) for (const m of joinSpaced(f.text).match(NUM) ?? []) {
    const c = canon(m);
    if (c !== null) pool.add(c);
  }
  return (joinSpaced(text.replace(NAMES, " ")).match(NUM) ?? []).every((m) => {
    const c = canon(m);
    return c !== null && pool.has(c);
  });
}

/** smallest group size (n …) among the cited facts; null when they name none */
function minN(cited: readonly Fact[]): number | null {
  const ns = cited.flatMap((f) => [...f.text.matchAll(/\(n (\d+)\)|: (\d+) (?:zugeordnete|assigned|post associati)/g)].map((m) => Number(m[1] ?? m[2])));
  return ns.length ? Math.min(...ns) : null;
}

/**
 * The strength the model gives is capped by what it cites: "strong" needs at least two facts that are not limits and
 * groups of 8 posts or more; groups under 5, or a single fact, are "weak" at most.
 */
export function capStrength(claimed: BriefPattern["strength"], cited: readonly Fact[]): BriefPattern["strength"] {
  const real = cited.filter((f) => f.kind !== "limit");
  // facts about posts must say how many posts they rest on; without a readable n they cannot carry "strong"
  const counted = real.filter((f) => f.kind === "content" || f.kind === "brand" || f.kind === "substack");
  const unknownN = counted.some((f) => minN([f]) === null);
  const n = minN(real);
  let ceiling: BriefPattern["strength"] = real.length < 2 || (n !== null && n < 5) ? "weak" : n !== null && n < 8 ? "medium" : "strong";
  if (ceiling === "strong" && unknownN) ceiling = "medium";
  const rank = { weak: 0, medium: 1, strong: 2 } as const;
  return rank[claimed] <= rank[ceiling] ? claimed : ceiling;
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
    patterns.push({ kind, title, text, facts: f, counter, counter_facts: cf, strength: capStrength(strength, cite(f)) });
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
  /** the language the facts and the brief are written in; records from before 2026-11-05 have none and are German */
  locale?: Locale;
  /** when the brief was written, ISO */
  at: string;
  /** ISO week of the Berlin day, e.g. 2026-w45 */
  week: string;
  kind: "weekly" | "now";
  model: string;
  facts: Fact[];
  brief: Brief;
}
