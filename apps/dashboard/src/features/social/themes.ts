/**
 * Content themes (ANA-38 brief §7). A theme is a DERIVED SUGGESTION from generic caption keywords, or a manual
 * session override. Either way it is labelled with its provenance and never presented as observed audience intent.
 *
 * Keywords are grouped into signal families. The five displayed themes follow the brief; the brief's
 * "Opportunities / Practical resources" theme holds two families that point to different hypotheses (opportunity → H1,
 * practical file → H4), so hypothesis mapping uses families, not themes.
 */
import type { SocialPost } from "./types";
import type { ThemeId } from "./insights";

export const THEMES: readonly ThemeId[] = ["travel", "creator", "money", "personal", "opportunities"];

export type FamilyId = "travel" | "creator" | "money" | "personal" | "opportunity" | "practical";
const FAMILIES: readonly FamilyId[] = ["travel", "creator", "money", "personal", "opportunity", "practical"];

/** Generic keyword rules; matched case-insensitively on word boundaries. No calls to action (they move saves themselves). */
export const FAMILY_RULES: Readonly<Record<FamilyId, readonly string[]>> = {
  travel: ["travel", "trip", "flight", "airport", "hotel", "beach", "island", "vacation", "holiday", "abroad", "passport", "nomad", "explore", "wanderlust", "reise", "viaggio"],
  creator: ["ugc", "creator", "content", "brand deal", "brand", "collab", "sponsor", "pr package", "influencer", "capcut", "editing", "filming", "portfolio"],
  money: ["money", "income", "salary", "budget", "paid", "invoice", "freelance", "rate", "rates", "career", "client", "clients", "business", "earn", "price"],
  personal: ["story", "life", "family", "mom", "dad", "parents", "honest", "journey", "learned", "mistake", "friend", "feel"],
  opportunity: ["opportunity", "opportunities", "apply", "application", "hiring", "remote job", "remote work", "open call", "casting"],
  practical: ["template", "guide", "tips", "how to", "checklist", "resource", "step by step", "toolkit", "worksheet"],
};

const THEME_OF_FAMILY: Readonly<Record<FamilyId, ThemeId>> = { travel: "travel", creator: "creator", money: "money", personal: "personal", opportunity: "opportunities", practical: "opportunities" };
const FAMILIES_OF_THEME: Readonly<Record<ThemeId, readonly FamilyId[]>> = { travel: ["travel"], creator: ["creator"], money: ["money"], personal: ["personal"], opportunities: ["opportunity", "practical"] };

export interface ThemeAssignment {
  themes: readonly ThemeId[];
  families: readonly FamilyId[];
  source: "derived-keyword" | "manual-session" | "unclassified";
  /** for derived themes: the keywords that matched (generic words, never caption excerpts) */
  matched: readonly string[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const RULE_RE: Readonly<Record<FamilyId, RegExp[]>> = Object.fromEntries(
  FAMILIES.map((f) => [f, FAMILY_RULES[f].map((k) => new RegExp(`(^|[^\\p{L}\\p{N}])${escape(k)}($|[^\\p{L}\\p{N}])`, "iu"))]),
) as Record<FamilyId, RegExp[]>;

const NONE: ThemeAssignment = { themes: [], families: [], source: "unclassified", matched: [] };

export function deriveThemes(caption: string | null): ThemeAssignment {
  if (!caption) return NONE;
  const families: FamilyId[] = [];
  const matched: string[] = [];
  for (const family of FAMILIES) {
    const hits = FAMILY_RULES[family].filter((_, i) => RULE_RE[family][i]!.test(caption));
    if (hits.length) {
      families.push(family);
      matched.push(...hits);
    }
  }
  if (!families.length) return NONE;
  const themes = THEMES.filter((t) => families.some((f) => THEME_OF_FAMILY[f] === t));
  return { themes, families, source: "derived-keyword", matched };
}

export type ThemeOverrides = Readonly<Record<string, readonly ThemeId[]>>;

export function assignTheme(post: SocialPost, overrides: ThemeOverrides): ThemeAssignment {
  const manual = overrides[post.media_id];
  if (manual) return manual.length ? { themes: manual, families: manual.flatMap((t) => FAMILIES_OF_THEME[t]), source: "manual-session", matched: [] } : NONE;
  return deriveThemes(post.caption);
}
