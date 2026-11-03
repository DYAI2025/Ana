/**
 * Categories of Ana's posts (agreed with Ben and Ana, 2026-11-02), read once per post by a Claude model from the cover
 * image and the caption. Only these values are kept, never the caption. They let the team see which kinds of post
 * reach which engagement — and, next to the daily audience history, which kinds go with which audience shifts. A
 * category is a reading of the post, not a measurement: every view of it shows how many posts it rests on.
 */

export const TAG_VERSION = 1;

export const THEMES = ["beach", "nature", "city", "food", "nightlife", "culture", "stay", "transport", "friends", "lifestyle", "fashion", "costume", "other"] as const;
export const PRESENCE = ["face", "figure", "none"] as const;
export const SHOTS = ["selfie", "portrait", "action", "scenery", "detail", "group"] as const;
export const HOOKS = ["question", "place", "tip", "story", "humor", "prompt", "none"] as const;
export const CTAS = ["none", "comment", "save_share", "follow", "link"] as const;
export const MOODS = ["energetic", "calm", "romantic", "funny", "informative"] as const;

export type Theme = (typeof THEMES)[number];
export type Presence = (typeof PRESENCE)[number];
export type Shot = (typeof SHOTS)[number];
export type Hook = (typeof HOOKS)[number];
export type Cta = (typeof CTAS)[number];
export type Mood = (typeof MOODS)[number];

export interface PostTags {
  theme: Theme;
  ana: Presence;
  shot: Shot;
  hook: Hook;
  cta: Cta;
  mood: Mood;
  /** ISO 3166-1 alpha-2 of the place shown, when recognisable */
  country: string | null;
  brand: boolean;
  /** the model's own confidence (0..1) */
  confidence: number;
}

/** below this the categories of a post are kept but not counted */
export const TAG_MIN_CONFIDENCE = 0.5;

// user-assigned or reserved codes a model might echo as a placeholder
const PLACEHOLDER_CODES = new Set(["XX", "ZZ", "AA", "QQ", "XY", "XZ"]);

const pick = <T extends string>(list: readonly T[], v: unknown): T | null => (typeof v === "string" && (list as readonly string[]).includes(v) ? (v as T) : null);

/** A model answer or a stored record, checked field by field: anything off the lists makes the whole record null. */
export function parseTags(raw: unknown): PostTags | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const theme = pick(THEMES, o.theme);
  const ana = pick(PRESENCE, o.ana);
  const shot = pick(SHOTS, o.shot);
  const hook = pick(HOOKS, o.hook);
  const cta = pick(CTAS, o.cta);
  const mood = pick(MOODS, o.mood);
  const confidence = typeof o.confidence === "number" && o.confidence >= 0 && o.confidence <= 1 ? o.confidence : null;
  // a code in either case is fine; "XX"-style placeholders and anything else make the record null
  const code = typeof o.country === "string" ? o.country.trim().toUpperCase() : null;
  const country = o.country === null || o.country === undefined || o.country === "" ? null : code && /^[A-Z]{2}$/.test(code) && !PLACEHOLDER_CODES.has(code) ? code : undefined;
  if (!theme || !ana || !shot || !hook || !cta || !mood || confidence === null || country === undefined || typeof o.brand !== "boolean") return null;
  return { theme, ana, shot, hook, cta, mood, country, brand: o.brand, confidence };
}

export const TAG_FIELDS = ["theme", "ana", "shot", "hook", "mood", "cta", "format"] as const;
export type TagField = (typeof TAG_FIELDS)[number];

export interface WorksRow {
  value: string;
  n: number;
  /** median engagement rate (interactions ÷ reach) of the posts with this value */
  median: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? (s[m] as number) : ((s[m - 1] as number) + (s[m] as number)) / 2;
};

/**
 * Median engagement rate per category value, over the posts that have a measured rate and confident categories.
 * Format comes from Meta, not from the model. Rows are sorted by median, highest first.
 */
export function whatWorks(posts: ReadonlyArray<{ id: string; format: string; er: number | null }>, tags: Readonly<Record<string, PostTags>>): { counted: number; fields: Record<TagField, WorksRow[]> } {
  const measured = posts.filter((p) => p.er !== null && Number.isFinite(p.er));
  const counted = measured.filter((p) => (tags[p.id]?.confidence ?? 0) >= TAG_MIN_CONFIDENCE);
  const fields = Object.fromEntries(TAG_FIELDS.map((f) => [f, [] as WorksRow[]])) as Record<TagField, WorksRow[]>;
  for (const f of TAG_FIELDS) {
    const groups = new Map<string, number[]>();
    for (const p of f === "format" ? measured : counted) {
      const v = f === "format" ? p.format : String((tags[p.id] as PostTags)[f]);
      groups.set(v, [...(groups.get(v) ?? []), p.er as number]);
    }
    fields[f] = [...groups.entries()].map(([value, ers]) => ({ value, n: ers.length, median: median(ers) })).sort((a, b) => b.median - a.median);
  }
  return { counted: counted.length, fields };
}

/** Posts with one category value (format from Meta, the rest only from confident readings), best rate first. */
export function postsWith<P extends { id: string; format: string; er: number | null }>(posts: readonly P[], tags: Readonly<Record<string, PostTags>>, field: TagField, value: string): P[] {
  return posts
    .filter((p) => {
      if (field === "format") return p.format === value;
      const t = tags[p.id];
      return t !== undefined && t.confidence >= TAG_MIN_CONFIDENCE && String(t[field]) === value;
    })
    .sort((a, b) => (b.er ?? -1) - (a.er ?? -1));
}

/** The best posts by measured engagement rate. */
export function topPosts<P extends { er: number | null }>(posts: readonly P[], n: number): P[] {
  return posts.filter((p) => p.er !== null && Number.isFinite(p.er)).sort((a, b) => (b.er as number) - (a.er as number)).slice(0, n);
}
