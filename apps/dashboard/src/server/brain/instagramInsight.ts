import type { CanonicalMetric, PostFormat, SocialPost, SocialSnapshot } from "@/features/social/types";
import { TAG_MIN_CONFIDENCE, type PostTags, type Theme } from "@/features/world/postTags";
import { median } from "@/features/world/model";

/**
 * One kind of traceable insight: how the save+share rate of the posts on one theme compares with the other posts of the
 * same format. Meta's values are SOURCE, the rates and the model's theme reading are DERIVED, what could not be measured
 * is UNKNOWN. The note holds the definition; every measurement is an append-only block. Only ids and numbers go to the
 * Brain, never a caption. It describes posts of this account: no statement about people, need, purchase or revenue.
 */

export const DERIVATION_VERSION = 1;
export const SOURCE_ID = "src-instagram-insights";
export const TOPIC_ID = "top-ig-resonanz";
/** fewer posts on a side are not compared */
export const MIN_POSTS = 3;
/** lifetime values of younger posts are still growing (the cockpit's maturity cutoff; not an age normalization) */
export const MATURE_DAYS = 7;
/** the Brain's limit for one observation block */
export const MAX_MEASUREMENT = 2000;
const MAX_REFS = 6;
/** below this share of read posts a format waits: a partial reading must not become the day's measurement */
const MIN_READ_SHARE = 0.8;
/** a Substack hypothesis is only worded from this lead on (theme median ÷ median of the others) */
const HYPOTHESIS_LIFT = 1.25;

export interface MeasuredPost {
  id: string;
  saves: number;
  shares: number;
  reach: number;
  ssr: number;
}

export interface InstagramInsight {
  id: string;
  theme: Theme;
  format: PostFormat;
  /** the Berlin day of this measurement */
  day: string;
  observedAt: string;
  /** minutes between the snapshot and the derivation */
  ageMinutes: number;
  status: "DERIVED" | "UNKNOWN";
  direction: "above" | "below" | "equal" | null;
  n: number;
  restN: number;
  themeMedian: number;
  restMedian: number | null;
  /** all measured posts of the theme, highest rate first */
  measured: MeasuredPost[];
  /** the measured posts of the comparison group, highest rate first */
  rest: MeasuredPost[];
  /** posts on the side of the stated direction, strongest first */
  supporting: MeasuredPost[];
  /** posts on the other side, strongest first */
  contradicting: MeasuredPost[];
  /** theme posts level with the comparison, on neither side (not counted for "equal", where they support it) */
  level: number;
  /** theme posts without a computable rate (a value missing, or a reach of 0) */
  unknownIds: string[];
  /** comparison posts without a computable rate */
  restUnknown: number;
  /** posts of this format left out of the comparison because their theme reading is missing or unsure */
  unclassified: number;
  coverage: { retrieved: number | null; withValues: number | null; halted: string | null };
}

export function berlinDay(ms: number): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(ms);
}

const verified = (post: SocialPost, metric: CanonicalMetric): number | null => {
  const o = post.observations.find((x) => x.metric_name === metric && x.availability_state === "VERIFIED");
  return typeof o?.value === "number" && Number.isFinite(o.value) ? o.value : null;
};

function measure(post: SocialPost): MeasuredPost | null {
  const reach = verified(post, "reach");
  const saves = verified(post, "saves");
  const shares = verified(post, "shares");
  if (!reach || saves === null || shares === null) return null;
  return { id: post.media_id, saves, shares, reach, ssr: (saves + shares) / reach };
}

const direction = (theme: number, rest: number | null): InstagramInsight["direction"] => (rest === null ? null : theme > rest ? "above" : theme < rest ? "below" : "equal");

export function deriveInsights(snapshot: SocialSnapshot, tags: Readonly<Record<string, PostTags>>, nowMs: number): { insights: InstagramInsight[]; unreadFormats: PostFormat[] } {
  const observed = Date.parse(snapshot.observed_at);
  const mature = snapshot.posts.filter((p) => p.published_at !== null && observed - Date.parse(p.published_at) >= MATURE_DAYS * 86_400_000);
  const insights: InstagramInsight[] = [];
  const unreadFormats: PostFormat[] = [];
  const themeOf = (p: SocialPost): Theme | null => {
    const t = tags[p.media_id];
    return t && t.confidence >= TAG_MIN_CONFIDENCE ? t.theme : null;
  };
  const coverage = {
    retrieved: snapshot.coverage?.retrieved ?? null,
    withValues: snapshot.coverage?.posts_with_insights ?? null,
    halted: snapshot.coverage?.halted ?? null,
  };
  for (const format of new Set(mature.map((p) => p.format))) {
    if (format === "unknown") continue;
    const ofFormat = mature.filter((p) => p.format === format);
    if (ofFormat.filter((p) => tags[p.media_id]).length / ofFormat.length < MIN_READ_SHARE) {
      unreadFormats.push(format);
      continue;
    }
    const classified = ofFormat.filter((p) => themeOf(p) !== null);
    for (const theme of new Set(classified.map(themeOf))) {
      if (!theme || theme === "other") continue;
      const group = classified.filter((p) => themeOf(p) === theme);
      const others = classified.filter((p) => themeOf(p) !== theme);
      const byRate = (posts: SocialPost[]) => posts.flatMap((p) => measure(p) ?? []).sort((a, b) => b.ssr - a.ssr);
      const measured = byRate(group);
      if (measured.length < MIN_POSTS) continue;
      const rest = byRate(others);
      const themeMedian = median(measured.map((p) => p.ssr)) as number;
      const restMedian = rest.length >= MIN_POSTS ? median(rest.map((p) => p.ssr)) : null;
      const dir = direction(themeMedian, restMedian);
      const over = restMedian === null ? [] : measured.filter((p) => p.ssr > restMedian);
      const under = restMedian === null ? [] : measured.filter((p) => p.ssr < restMedian).reverse();
      const level = restMedian === null ? [] : measured.filter((p) => p.ssr === restMedian);
      insights.push({
        id: `kn-ig-resonanz-${format}-${theme}`,
        theme,
        format,
        day: berlinDay(nowMs),
        observedAt: snapshot.observed_at,
        ageMinutes: Math.max(0, Math.round((nowMs - observed) / 60_000)),
        status: restMedian === null ? "UNKNOWN" : "DERIVED",
        direction: dir,
        n: measured.length,
        restN: rest.length,
        themeMedian,
        restMedian,
        measured,
        rest,
        supporting: dir === "above" ? over : dir === "below" ? under : dir === "equal" ? level : [],
        contradicting: dir === "above" ? under : dir === "below" ? over : dir === "equal" ? [...over, ...under] : [],
        level: dir === "equal" ? 0 : level.length,
        unknownIds: group.filter((p) => !measure(p)).map((p) => p.media_id),
        restUnknown: others.filter((p) => !measure(p)).length,
        unclassified: ofFormat.length - classified.length,
        coverage,
      });
    }
  }
  return { insights: insights.sort((a, b) => b.n - a.n || a.id.localeCompare(b.id)), unreadFormats };
}

const pct = (x: number) => `${(x * 100).toFixed(2)} %`;
const ref = (p: MeasuredPost) => `instagram:media/${p.id} saves=${p.saves} count shares=${p.shares} count reach=${p.reach} accounts`;
const list = <T,>(items: readonly T[], show: (x: T) => string, max: number) => {
  if (items.length === 0) return "keine";
  const shown = items.slice(0, max).map(show);
  if (items.length > max) shown.push(`+${items.length - max} weitere`);
  return shown.join("; ");
};
const LIMITS = "nur Posts dieses Kontos, keine Aussage über die Community; keine Aussage über Bedürfnis, Kaufabsicht oder Umsatz; Korrelation, keine Ursache; Lifetime-Werte, nicht altersnormiert";

function text(i: InstagramInsight, version: number, max: number): string {
  const themeSide = `Median (Saves + Shares) ÷ Reichweite: ${pct(i.themeMedian)} (Thema, n=${i.n})`;
  const comparison =
    i.direction === null
      ? `${themeSide}; Vergleich nicht möglich: weniger als ${MIN_POSTS} andere gemessene ${i.format}-Posts (n=${i.restN})`
      : `${themeSide} gegen ${pct(i.restMedian as number)} (übrige ${i.format}-Posts mit Themen-Lesung, n=${i.restN})`;
  const reading = i.direction === null ? "keine" : `Posts zu „${i.theme}“ liegen im Format ${i.format} ${i.direction === "above" ? "über" : i.direction === "below" ? "unter" : "gleichauf mit"} den übrigen`;
  const lead = i.restMedian ? i.themeMedian / i.restMedian : 0;
  const hypothesis =
    i.direction === "above" && lead >= HYPOTHESIS_LIFT
      ? `SUBSTACK-HYPOTHESE (CANDIDATE, unbelegt): Ein längerer Text zu „${i.theme}“ könnte auf Interesse stoßen; prüft erst ein echter Substack-Test, Instagram-Verhalten belegt das nicht`
      : "SUBSTACK-HYPOTHESE: keine";
  const unknown = [
    i.unknownIds.length > 0 ? `ohne berechenbare Rate (Wert fehlt oder Reichweite 0): ${list(i.unknownIds, (id) => `instagram:media/${id}`, max)}` : null,
    i.restUnknown > 0 ? `${i.restUnknown} Posts der Vergleichsgruppe ohne berechenbare Rate` : null,
    i.unclassified > 0 ? `${i.unclassified} Posts ohne sichere Themen-Lesung nicht verglichen` : null,
    i.coverage.withValues !== null && i.coverage.retrieved !== null ? `Abdeckung: ${i.coverage.withValues} von ${i.coverage.retrieved} Posts mit Werten` : null,
    i.coverage.halted ? `Lesen abgebrochen: ${i.coverage.halted}` : null,
  ].filter(Boolean);
  const evidence =
    i.direction === null
      ? [`GEMESSEN: ${list(i.measured, ref, max)}`]
      : [
          `BELEGE dafür: ${list(i.supporting, ref, max)}`,
          `BELEGE dagegen: ${list(i.contradicting, ref, max)}${i.level > 0 ? ` (${i.level} gleichauf)` : ""}`,
          `VERGLEICHSGRUPPE: ${list(i.rest, (p) => `instagram:media/${p.id} rate=${pct(p.ssr)}`, max)}`,
        ];
  return [
    `IG-INSIGHT tag=${i.day} v=${version} status=${i.status}`,
    `BEOBACHTUNG (SOURCE): observed_at=${i.observedAt} Datenalter=${i.ageMinutes} min Zeitraum=lifetime Quelle=Meta Insights; Werte unten`,
    `ABLEITUNG (DERIVED): ${comparison}; Regel: reif ab ${MATURE_DAYS} Tagen, je Seite mindestens ${MIN_POSTS} Posts; Thema gelesen vom Modell (Konfidenz ≥ ${TAG_MIN_CONFIDENCE})`,
    `INTERPRETATION (${i.status}): ${reading}; ${LIMITS}`,
    `UNBEKANNT (UNKNOWN): ${unknown.length > 0 ? unknown.join("; ") : "nichts offen"}`,
    ...evidence,
    hypothesis,
  ].join(" | ");
}

/** One measurement block: observation, derivation and interpretation stay apart. Fewer references when the Brain's limit demands it. */
export function measurementText(i: InstagramInsight, version: number = DERIVATION_VERSION): string {
  for (let max = MAX_REFS; max > 0; max--) {
    const line = text(i, version, max);
    if (line.length <= MAX_MEASUREMENT) return line;
  }
  return text(i, version, 0);
}

/** What never changes for this id: the question and the meaning of the labels. Rule, sources and values are in the blocks. */
export function insightNote(i: Pick<InstagramInsight, "id" | "theme" | "format">): { id: string; title: string; body: string; source_refs: Array<{ source: string; locator: string }> } {
  return {
    id: i.id,
    title: `Instagram-Resonanz: Thema ${i.theme} im Format ${i.format}`,
    body: `Analysierter Zusammenhang: Liegt die Save+Share-Rate von ${i.format}-Posts zum Thema „${i.theme}“ über oder unter der Rate der übrigen ${i.format}-Posts?
Ableitung: Rate je Post = (Saves + Shares) ÷ Reichweite, je Seite der Median; das Thema liest ein Modell. Regel und Version nennt jeder Block.
Grenzen: ${LIMITS}.
Status je Wert: SOURCE = von Meta gemessen, DERIVED = daraus berechnet oder vom Modell gelesen, UNKNOWN = nicht gemessen. Die Messungen stehen unten, je Tag ein Block; frühere bleiben erhalten.`,
    source_refs: [{ source: SOURCE_ID, locator: `instagram:media-insights?format=${i.format}&theme=${i.theme}` }],
  };
}
