/**
 * Content themes (ANA-38 brief §7). A theme is a DERIVED SUGGESTION from generic caption keywords, or a manual
 * session override. Either way it is labelled with its provenance and never presented as observed audience intent.
 */
import type { SocialPost } from "./types";
import type { ThemeId } from "./insights";

export const THEMES: readonly ThemeId[] = ["travel", "creator", "money", "personal", "opportunities"];

/** Generic keyword rules; matched case-insensitively on word boundaries. Order = display priority. */
export const THEME_RULES: Readonly<Record<ThemeId, readonly string[]>> = {
  travel: ["travel", "trip", "flight", "airport", "hotel", "beach", "island", "vacation", "holiday", "abroad", "passport", "nomad", "explore", "wanderlust", "reise", "viaggio"],
  creator: ["ugc", "creator", "content", "brand deal", "brand", "collab", "sponsor", "pr package", "influencer", "capcut", "editing", "filming", "portfolio"],
  money: ["money", "income", "salary", "budget", "paid", "invoice", "freelance", "rate", "rates", "career", "client", "clients", "business", "earn", "price"],
  personal: ["story", "life", "family", "mom", "dad", "parents", "honest", "journey", "learned", "mistake", "friend", "feel"],
  opportunities: ["opportunity", "opportunities", "apply", "application", "hiring", "remote job", "remote work", "template", "guide", "tips", "how to", "checklist", "resource", "step by step", "save this"],
};

export interface ThemeAssignment {
  themes: readonly ThemeId[];
  source: "derived-keyword" | "manual-session" | "unclassified";
  /** for derived themes: the keywords that matched (generic words, never caption excerpts) */
  matched: readonly string[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RULE_RE: Readonly<Record<ThemeId, RegExp[]>> = Object.fromEntries(
  THEMES.map((t) => [t, THEME_RULES[t].map((k) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(k)}($|[^\\p{L}\\p{N}])`, "iu"))]),
) as Record<ThemeId, RegExp[]>;

export function deriveThemes(caption: string | null): ThemeAssignment {
  if (!caption) return { themes: [], source: "unclassified", matched: [] };
  const themes: ThemeId[] = [];
  const matched: string[] = [];
  for (const theme of THEMES) {
    const hits = THEME_RULES[theme].filter((_, i) => RULE_RE[theme][i]!.test(caption));
    if (hits.length) {
      themes.push(theme);
      matched.push(...hits);
    }
  }
  return themes.length ? { themes, source: "derived-keyword", matched } : { themes: [], source: "unclassified", matched: [] };
}

export type ThemeOverrides = Readonly<Record<string, readonly ThemeId[]>>;

export function assignTheme(post: SocialPost, overrides: ThemeOverrides): ThemeAssignment {
  const manual = overrides[post.media_id];
  if (manual) return { themes: manual, source: manual.length ? "manual-session" : "unclassified", matched: [] };
  return deriveThemes(post.caption);
}
