/**
 * Reel rates overview (Jira ANA-60): which posts and which kinds of post get liked, shared, saved and commented, per
 * reached account. Pure functions over the existing analysis; the UI lives in ContentRows.tsx.
 *
 * Categories are the Haiku readings of the world (src/features/world/postTags.ts), counted from TAG_MIN_CONFIDENCE on.
 * They are readings, not measurements: every summary shows its n and the formats it rests on (ANA-38 AC6).
 */
import { TAG_MIN_CONFIDENCE, THEMES, type Theme } from "@/features/world/postTags";
import { median, type PostAnalysis, type RateName } from "./insights";
import type { PostFormat, SocialCategories } from "./types";

/** The four rates of a row, in the order they are shown. */
export const OVERVIEW_RATES = ["likes_per_reach", "shares_per_reach", "saves_per_reach", "comments_per_reach"] as const satisfies readonly RateName[];
export type OverviewRate = (typeof OVERVIEW_RATES)[number];

/** Smallest category whose median is shown; below it the summary says "too few posts". */
export const MIN_CATEGORY_N = 3;

export type CategoryState = { kind: "theme"; theme: Theme } | { kind: "uncategorised" } | { kind: "unavailable" };

/** Tagger off (or no answer from the server) → unavailable; no tag or a reading below the threshold → uncategorised. */
export function categoryOf(mediaId: string, categories: SocialCategories | null | undefined): CategoryState {
  if (!categories || categories.state !== "on") return { kind: "unavailable" };
  const t = categories.tags[mediaId];
  if (!t || !(t.confidence >= TAG_MIN_CONFIDENCE) || !(THEMES as readonly string[]).includes(t.theme)) return { kind: "uncategorised" };
  return { kind: "theme", theme: t.theme };
}

/** A filter or summary key: a theme, or the posts without a confident category. */
export type CategoryKey = Theme | "uncategorised";
export const keyOf = (c: CategoryState): CategoryKey | null => (c.kind === "theme" ? c.theme : c.kind === "uncategorised" ? "uncategorised" : null);

/**
 * Feed or trial, from Meta's is_shared_to_feed. Photos and carousels are always feed posts. A Reel with false is
 * labelled trial (that this means "trial" is still to be verified); a Reel without the flag is "unknown".
 */
export type Distribution = "feed" | "trial" | "unknown";
export function distributionOf(p: PostAnalysis): Distribution {
  if (p.post.format !== "reel") return "feed";
  if (p.post.shared_to_feed === false) return "trial";
  return p.post.shared_to_feed === true ? "feed" : "unknown";
}

export type SortKey = "date" | "reach" | OverviewRate;
export type SortDir = "asc" | "desc";
export const SORT_KEYS: readonly SortKey[] = ["date", "reach", ...OVERVIEW_RATES];

function sortValue(p: PostAnalysis, key: SortKey): number | null {
  if (key === "date") {
    const t = p.post.published_at ? Date.parse(p.post.published_at) : NaN;
    return Number.isFinite(t) ? t : null;
  }
  if (key === "reach") return p.reach !== null && p.reach > 0 ? p.reach : null;
  return p.rates[key];
}

/** Sorted copy; posts without the value always come last, whatever the direction (ties: newest first, then id). */
export function sortRows(rows: readonly PostAnalysis[], key: SortKey, dir: SortDir): PostAnalysis[] {
  const date = (p: PostAnalysis) => sortValue(p, "date") ?? -Infinity;
  return [...rows].sort((a, b) => {
    const va = sortValue(a, key);
    const vb = sortValue(b, key);
    if (va === null || vb === null) {
      if (va !== vb) return va === null ? 1 : -1;
    } else if (va !== vb) return dir === "asc" ? va - vb : vb - va;
    return date(b) - date(a) || a.post.media_id.localeCompare(b.post.media_id);
  });
}

export interface Filters {
  category: CategoryKey | "all";
  format: PostFormat | "all";
  distribution: Distribution | "all";
}
export const NO_FILTERS: Filters = { category: "all", format: "all", distribution: "all" };

export function filterRows(rows: readonly PostAnalysis[], filters: Filters, categories: SocialCategories | null | undefined): PostAnalysis[] {
  return rows.filter(
    (p) =>
      (filters.format === "all" || p.post.format === filters.format) &&
      (filters.distribution === "all" || distributionOf(p) === filters.distribution) &&
      (filters.category === "all" || keyOf(categoryOf(p.post.media_id, categories)) === filters.category),
  );
}

/** Category filter options: only themes that occur in the rows (in catalogue order), then "uncategorised". */
export function categoryOptions(rows: readonly PostAnalysis[], categories: SocialCategories | null | undefined): CategoryKey[] {
  if (!categories || categories.state !== "on") return [];
  const seen = new Set(rows.map((p) => keyOf(categoryOf(p.post.media_id, categories))));
  return [...THEMES.filter((t) => seen.has(t)), "uncategorised"];
}

export interface RateSummary {
  /** posts of the category with this rate measured */
  n: number;
  /** null when fewer than MIN_CATEGORY_N posts carry the rate */
  median: number | null;
}

export interface CategorySummary {
  key: CategoryKey;
  /** posts of the category in the filtered rows */
  n: number;
  /** formats the population rests on, most frequent first (shown, never mixed silently) */
  formats: Array<{ format: PostFormat; n: number }>;
  /** posts younger than MATURE_AGE_DAYS: their lifetime counts are still growing */
  young: number;
  rates: Readonly<Record<OverviewRate, RateSummary>>;
}

/** Per category over the given (already filtered) rows: n, formats, young posts and the median of each rate. */
export function summarize(rows: readonly PostAnalysis[], categories: SocialCategories | null | undefined): CategorySummary[] {
  if (!categories || categories.state !== "on") return [];
  const groups = new Map<CategoryKey, PostAnalysis[]>();
  for (const p of rows) {
    const k = keyOf(categoryOf(p.post.media_id, categories));
    if (k) groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  const order = (k: CategoryKey) => (k === "uncategorised" ? THEMES.length : THEMES.indexOf(k));
  return [...groups.entries()]
    .map(([key, ps]) => {
      const counts = new Map<PostFormat, number>();
      for (const p of ps) counts.set(p.post.format, (counts.get(p.post.format) ?? 0) + 1);
      const rates = Object.fromEntries(
        OVERVIEW_RATES.map((r) => {
          const values = ps.map((p) => p.rates[r]).filter((v): v is number => v !== null);
          return [r, { n: values.length, median: values.length >= MIN_CATEGORY_N ? median(values) : null }];
        }),
      ) as Record<OverviewRate, RateSummary>;
      return {
        key,
        n: ps.length,
        formats: [...counts.entries()].map(([format, n]) => ({ format, n })).sort((a, b) => b.n - a.n || a.format.localeCompare(b.format)),
        young: ps.filter((p) => p.ageDays !== null && !p.mature).length,
        rates,
      };
    })
    .sort((a, b) => b.n - a.n || order(a.key) - order(b.key));
}

/** "x of 100 reached people": the rate on a scale of 100, one decimal. */
export const perHundred = (rate: number): number => Math.round(rate * 1000) / 10;
