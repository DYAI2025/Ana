/**
 * "Was läuft": where the community is moving right now, read from one WorldPayload. Pure and shared by the panel tab
 * and the Brain writer, so the team and the Brain see the same numbers. Everything is aggregated (countries, age and
 * gender bands, post categories); nothing names a person. A movement is a comparison of measured numbers, not a cause.
 */
import { instagramView, median, shares, trends, TREND_POINTS, whoView, type WorldPost } from "./model";
import { TAG_MIN_CONFIDENCE, whatWorks, type PostTags } from "./postTags";
import type { WorldPayload } from "./types";

export interface CountryMove {
  key: string;
  /** share of the last 7 days (0..1) */
  share: number;
  /** points against the 30 days */
  delta: number;
}

export interface HotPost {
  id: string;
  format: string;
  published_at: string;
  er: number | null;
  ssr: number | null;
  reach: number | null;
  /** er ÷ median er of all posts; null when either is unknown */
  vsMedian: number | null;
  tags: PostTags | null;
}

export interface ThemeRow {
  value: string;
  n: number;
  median: number;
}

export interface PulseDigest {
  /** Berlin calendar day of the read */
  day: string;
  rising: CountryMove[];
  falling: CountryMove[];
  /** the leading countries of the last 7 days */
  leading: CountryMove[];
  /** posts of the last 7 days, best engagement first */
  fresh: HotPost[];
  erMedian: number | null;
  ssrMedian: number | null;
  /** themes with at least MIN_N confident posts, by median engagement / by median save+share rate */
  themesEr: ThemeRow[];
  themesSsr: ThemeRow[];
  /** largest age band and gender split of the people who engaged in the last 7 days */
  topAge: { band: string; share: number } | null;
  gender: { f: number; m: number; u: number } | null;
  /** posts that visibly promote a brand vs the others (median engagement) */
  brand: { n: number; er: number | null; otherN: number; otherEr: number | null };
  reach28: number | null;
  followers: number | null;
  /** how many posts the categories rest on */
  tagged: number;
}

export const MIN_N = 3;
const WEEK_MS = 7 * 86_400_000;

export function berlinDayOf(ms: number): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(ms));
}

const confident = (tags: Readonly<Record<string, PostTags>>, id: string) => {
  const t = tags[id];
  return t && t.confidence >= TAG_MIN_CONFIDENCE ? t : null;
};

export function pulseDigest(world: WorldPayload, nowMs: number): PulseDigest {
  const ig = instagramView(world);
  const tags = world.post_tags.tags;
  const a = world.audience;
  const week = shares(a.engaged_country_week);
  const delta = trends(a.engaged_country_week, a.engaged_country);
  const moves: CountryMove[] = week.map((c) => ({ key: c.key, share: c.share, delta: delta.get(c.key) ?? 0 }));
  const rising = moves.filter((m) => m.delta >= TREND_POINTS).sort((x, y) => y.delta - x.delta).slice(0, 3);
  const falling = moves.filter((m) => m.delta <= -TREND_POINTS).sort((x, y) => x.delta - y.delta).slice(0, 3);

  const measured = ig.posts.filter((p) => !p.fresh);
  const ssrMedian = median(measured.map((p) => p.ssr).filter((x): x is number => x !== null));
  const fresh: HotPost[] = ig.posts
    .filter((p): p is WorldPost & { published_at: string } => p.published_at !== null && nowMs - Date.parse(p.published_at) <= WEEK_MS && Date.parse(p.published_at) <= nowMs)
    .map((p) => ({ id: p.id, format: p.format, published_at: p.published_at, er: p.er, ssr: p.ssr, reach: p.reach, vsMedian: p.er !== null && ig.erMedian ? p.er / ig.erMedian : null, tags: confident(tags, p.id) }))
    .sort((x, y) => (y.er ?? -1) - (x.er ?? -1));

  const themes = (kind: "er" | "ssr") => whatWorks(ig.posts, tags, kind).fields.theme.filter((r) => r.n >= MIN_N).slice(0, 3);
  const who = whoView(a.who.engaged_week);
  let topAge: PulseDigest["topAge"] = null;
  let gender: PulseDigest["gender"] = null;
  if (who?.mode === "pyramid") {
    const best = [...who.rows].sort((x, y) => y.f + y.m + y.u - (x.f + x.m + x.u))[0];
    topAge = best ? { band: best.band, share: best.f + best.m + best.u } : null;
    const f = who.rows.reduce((s, r) => s + r.f, 0);
    const m = who.rows.reduce((s, r) => s + r.m, 0);
    gender = { f, m, u: Math.max(0, 1 - f - m) };
  } else if (who?.mode === "split") {
    topAge = [...who.ages].sort((x, y) => y.share - x.share)[0] ?? null;
    gender = who.gender;
  }
  const withEr = measured.filter((p) => p.er !== null);
  const brandPosts = withEr.filter((p) => confident(tags, p.id)?.brand === true);
  const other = withEr.filter((p) => confident(tags, p.id)?.brand === false);
  return {
    day: berlinDayOf(nowMs),
    rising,
    falling,
    leading: [...moves].sort((x, y) => y.share - x.share).slice(0, 5),
    fresh,
    erMedian: ig.erMedian,
    ssrMedian,
    themesEr: themes("er"),
    themesSsr: themes("ssr"),
    topAge,
    gender,
    brand: { n: brandPosts.length, er: median(brandPosts.map((p) => p.er as number)), otherN: other.length, otherEr: median(other.map((p) => p.er as number)) },
    reach28: ig.reach28,
    followers: ig.followers,
    tagged: ig.posts.filter((p) => confident(tags, p.id)).length,
  };
}

/** Whether a digest carries anything worth writing down (no audience and no posts: nothing). */
export function digestHasSignal(d: PulseDigest): boolean {
  return d.leading.length > 0 || d.fresh.length > 0 || d.themesEr.length > 0;
}

const pct = (x: number | null, digits = 1) => (x === null ? "—" : `${(x * 100).toFixed(digits)} %`);
const pts = (x: number) => `${x > 0 ? "+" : ""}${x.toFixed(1)} Pkt`;

/**
 * The digest as one German observation for the Brain (≤ 2000 characters): measured numbers only, no captions, no
 * people. Countries stay ISO codes, categories stay the agreed category values.
 */
export function digestText(d: PulseDigest): string {
  const lines: string[] = [];
  lines.push(`Puls ${d.day} (Instagram, aggregiert, gemessen; Kategorien von Claude Haiku gelesen, ${d.tagged} Posts).`);
  if (d.leading.length) lines.push(`Engagement 7 T nach Land: ${d.leading.map((c) => `${c.key} ${pct(c.share, 0)}${Math.abs(c.delta) >= TREND_POINTS ? ` (${pts(c.delta)} ggü. 30 T)` : ""}`).join(", ")}.`);
  if (d.rising.length) lines.push(`Steigend: ${d.rising.map((c) => `${c.key} ${pts(c.delta)}`).join(", ")}.`);
  if (d.falling.length) lines.push(`Fallend: ${d.falling.map((c) => `${c.key} ${pts(c.delta)}`).join(", ")}.`);
  if (d.topAge || d.gender) lines.push(`Wer (7 T): ${d.topAge ? `größte Altersgruppe ${d.topAge.band} ${pct(d.topAge.share, 0)}` : ""}${d.topAge && d.gender ? "; " : ""}${d.gender ? `weiblich ${pct(d.gender.f, 0)}, männlich ${pct(d.gender.m, 0)}` : ""}.`);
  if (d.fresh.length) {
    const top = d.fresh.slice(0, 3).map((p) => `${p.format}${p.tags ? `/${p.tags.theme}/${p.tags.shot}/${p.tags.hook}` : ""} ER ${pct(p.er)}${p.vsMedian !== null ? ` (${p.vsMedian.toFixed(1)}× Median)` : ""}, Save+Share ${pct(p.ssr, 2)}`);
    lines.push(`Neue Posts 7 T (${d.fresh.length}), beste: ${top.join("; ")}.`);
  }
  lines.push(`Median aller Posts: ER ${pct(d.erMedian)}, Save+Share ${pct(d.ssrMedian, 2)}.`);
  if (d.themesEr.length) lines.push(`Themen nach ER (n ≥ ${MIN_N}): ${d.themesEr.map((r) => `${r.value} ${pct(r.median)} (n ${r.n})`).join(", ")}.`);
  if (d.themesSsr.length) lines.push(`Themen nach Save+Share (Substack-Hinweis): ${d.themesSsr.map((r) => `${r.value} ${pct(r.median, 2)} (n ${r.n})`).join(", ")}.`);
  if (d.brand.n || d.brand.otherN) lines.push(`Marken-Posts: ${d.brand.n} mit ER-Median ${pct(d.brand.er)}, übrige ${d.brand.otherN} mit ${pct(d.brand.otherEr)}.`);
  if (d.reach28 !== null || d.followers !== null) lines.push(`Reichweite 28 T ${d.reach28 ?? "—"}, Follower ${d.followers ?? "—"}.`);
  lines.push("Nur Korrelation: Meta sagt nicht, welche Person auf welchen Post reagiert hat.");
  const text = lines.join("\n");
  return text.length <= 2000 ? text : `${text.slice(0, 1997)}…`;
}
