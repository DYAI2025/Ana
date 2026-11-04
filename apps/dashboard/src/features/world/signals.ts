/**
 * "Läuft gerade gut / Bremst gerade": the kinds of post whose engagement rate is clearly above or below the account's
 * usual rate, measured over Ana's posts (no model, no audience guess). Plain and few on purpose: at most three each way,
 * one per category, only groups of 3 posts or more, only a clear difference (≥ 15 %). Everything else stays in
 * "Alle Kategorien im Detail".
 */
import { median, type WorldPost } from "./model";
import { TAG_MIN_CONFIDENCE, whatWorks, type PostTags, type TagField } from "./postTags";

export const SIGNAL_FIELDS = ["ana", "theme", "shot", "hook", "mood", "format"] as const satisfies readonly TagField[];
export type SignalField = (typeof SIGNAL_FIELDS)[number];

export interface Signal {
  field: SignalField;
  value: string;
  /** posts in the group */
  n: number;
  /** median engagement rate of the group and of all measured posts */
  median: number;
  overall: number;
  /** median ÷ overall */
  ratio: number;
  /** up to three posts of the group, best (or for "slow" weakest) first, for their covers */
  examples: WorldPost[];
}

export const SIGNAL_MIN_N = 3;
export const SIGNAL_UP = 1.15;
export const SIGNAL_DOWN = 0.85;

const inGroup = (p: WorldPost, tags: Readonly<Record<string, PostTags>>, f: SignalField, v: string) => {
  if (f === "format") return p.format === v;
  const t = tags[p.id];
  return t !== undefined && t.confidence >= TAG_MIN_CONFIDENCE && String(t[f]) === v;
};

export function signals(posts: readonly WorldPost[], tags: Readonly<Record<string, PostTags>>): { good: Signal[]; slow: Signal[]; overall: number | null } {
  const measured = posts.filter((p) => p.er !== null && Number.isFinite(p.er));
  const overall = median(measured.map((p) => p.er as number));
  if (overall === null || overall <= 0) return { good: [], slow: [], overall };
  const fields = whatWorks(measured, tags, "er").fields;
  const all: Signal[] = SIGNAL_FIELDS.flatMap((f) =>
    fields[f]
      .filter((r) => r.n >= SIGNAL_MIN_N && r.value !== "unknown")
      .map((r) => ({ field: f, value: r.value, n: r.n, median: r.median, overall, ratio: r.median / overall, examples: [] as WorldPost[] })),
  );
  const pick = (list: Signal[], dir: 1 | -1) => {
    const seen = new Set<string>();
    const out: Signal[] = [];
    for (const s of list.sort((a, b) => dir * (b.ratio - a.ratio))) {
      if (seen.has(s.field)) continue;
      seen.add(s.field);
      const group = measured.filter((p) => inGroup(p, tags, s.field, s.value)).sort((a, b) => dir * ((b.er as number) - (a.er as number)));
      out.push({ ...s, examples: group.slice(0, 3) });
      if (out.length === 3) break;
    }
    return out;
  };
  return { good: pick(all.filter((s) => s.ratio >= SIGNAL_UP), 1), slow: pick(all.filter((s) => s.ratio <= SIGNAL_DOWN), -1), overall };
}
