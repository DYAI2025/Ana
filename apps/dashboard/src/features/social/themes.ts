/**
 * Content themes (ANA-38 brief §7) and hypothesis topical fit (ANA-39, Confluence 108920834).
 *
 * A theme is a DERIVED SUGGESTION from generic caption keywords, or a manual session override. Themes describe content
 * for browsing only: they never qualify a product hypothesis. Hypothesis eligibility (topical fit) has its own, more
 * specific rules below, and its own hypothesis-specific session corrections. A broad theme correction such as
 * "Opportunities / Practical resources" therefore cannot make a post count for H1 or H4, let alone both.
 */
import type { SocialPost } from "./types";
import type { ThemeId } from "./insights";

export const THEMES: readonly ThemeId[] = ["travel", "creator", "money", "personal", "opportunities"];

type FamilyId = "travel" | "creator" | "money" | "personal" | "opportunity" | "practical";
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

export interface ThemeAssignment {
  themes: readonly ThemeId[];
  source: "derived-keyword" | "manual-session" | "unclassified";
  /** for derived themes: the keywords that matched (generic words, never caption excerpts) */
  matched: readonly string[];
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Word-boundary rule; the words of a phrase may be joined by spaces or hyphens ("ugc-job" = "ugc job"). */
const ruleRe = (k: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${k.split(" ").map(escape).join("[\\s-]+")}($|[^\\p{L}\\p{N}])`, "iu");
const compile = (words: readonly string[]) => words.map((k) => [k, ruleRe(k)] as const);
const hits = (rules: ReturnType<typeof compile>, caption: string) => rules.filter(([, re]) => re.test(caption)).map(([k]) => k);

const FAMILY_RE: Readonly<Record<FamilyId, ReturnType<typeof compile>>> = Object.fromEntries(FAMILIES.map((f) => [f, compile(FAMILY_RULES[f])])) as Record<FamilyId, ReturnType<typeof compile>>;

const NONE: ThemeAssignment = { themes: [], source: "unclassified", matched: [] };

export function deriveThemes(caption: string | null): ThemeAssignment {
  if (!caption) return NONE;
  const themes = new Set<ThemeId>();
  const matched: string[] = [];
  for (const family of FAMILIES) {
    const found = hits(FAMILY_RE[family], caption);
    if (found.length) {
      themes.add(THEME_OF_FAMILY[family]);
      matched.push(...found);
    }
  }
  if (!themes.size) return NONE;
  return { themes: THEMES.filter((t) => themes.has(t)), source: "derived-keyword", matched };
}

export type ThemeOverrides = Readonly<Record<string, readonly ThemeId[]>>;

export function assignTheme(post: SocialPost, overrides: ThemeOverrides): ThemeAssignment {
  const manual = overrides[post.media_id];
  if (manual) return manual.length ? { themes: manual, source: "manual-session", matched: [] } : NONE;
  return deriveThemes(post.caption);
}

// ---------- hypothesis topical fit (TOPICAL_FIT lane) ----------

/** The two hypotheses that are candidates in F1.I1 (H2/H3 are parked). */
export type CandidateHypothesis = "H1" | "H4";
export const CANDIDATES: readonly CandidateHypothesis[] = ["H1", "H4"];

/**
 * H1 (Opportunity Drop) needs a specific creator/UGC/remote-work opportunity or job: an opportunity term next to a domain
 * term (adjacent, or one word apart: "UGC jobs", "brands hiring", "jobs for creators"). Terms that merely co-occur
 * ("remote island trip, what an opportunity", "quit my job to become a creator") do not qualify; neither do travel,
 * nomad, creator or UGC alone, or "apply" alone. A few compact hashtags count on their own.
 */
export const H1_OPPORTUNITY_TERMS = ["job", "jobs", "gig", "gigs", "opportunity", "opportunities", "hiring", "casting call", "open call", "job board", "job listing", "job listings", "vacancy", "vacancies", "stellenangebot", "stellenangebote", "offerte di lavoro", "opportunità di lavoro"] as const;
export const H1_DOMAIN_TERMS = ["ugc", "creator", "creators", "influencer", "influencers", "remote", "remoto", "brand", "brands"] as const;
export const H1_HASHTAG_TERMS = ["ugcjob", "ugcjobs", "ugcopportunities", "creatorjobs", "creatoropportunity", "creatoropportunities", "remotejob", "remotejobs"] as const;
/** At most this many words between the opportunity term and the domain term. */
const H1_MAX_GAP = 1;
/**
 * H4 (Working File) needs a specific reusable artifact: a template, checklist, worksheet, workflow or similar file.
 * Money, career, "tips", "guide", "how to" or "step by step" alone are not a reusable file. Ambiguous words (Italian
 * "modello" = model) are left out.
 */
export const H4_ARTIFACT_TERMS = ["template", "templates", "checklist", "checklists", "worksheet", "worksheets", "spreadsheet", "spreadsheets", "toolkit", "swipe file", "media kit", "rate card", "workflow", "workflows", "sop", "printable", "vorlage", "vorlagen", "checkliste", "checklisten"] as const;

/** Lower-case word tokens; punctuation, hyphens and "#" separate words ("ugc-job" = "ugc job", "#ugcjobs" = "ugcjobs"). */
const tokenize = (caption: string) => caption.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);

/** Token ranges [start, end] where a (possibly multi-word) term occurs. */
function occurrences(tokens: readonly string[], term: string): Array<[number, number]> {
  const words = term.split(" ");
  const found: Array<[number, number]> = [];
  for (let i = 0; i + words.length <= tokens.length; i += 1) if (words.every((w, k) => tokens[i + k] === w)) found.push([i, i + words.length - 1]);
  return found;
}

const present = (tokens: readonly string[], terms: readonly string[]) => terms.filter((t) => occurrences(tokens, t).length > 0);

/** Caption keywords that make a post topically eligible, or [] (generic words only, never caption excerpts). */
export function deriveTopicalFit(caption: string | null, hypothesis: CandidateHypothesis): readonly string[] {
  if (!caption) return [];
  const tokens = tokenize(caption);
  if (hypothesis === "H4") return present(tokens, H4_ARTIFACT_TERMS);
  const opportunity = new Set<string>();
  const domain = new Set<string>();
  for (const o of H1_OPPORTUNITY_TERMS)
    for (const [os, oe] of occurrences(tokens, o))
      for (const d of H1_DOMAIN_TERMS)
        for (const [ds, de] of occurrences(tokens, d)) {
          const gap = os > de ? os - de - 1 : ds - oe - 1;
          if (gap >= 0 && gap <= H1_MAX_GAP) {
            opportunity.add(o);
            domain.add(d);
          }
        }
  return [...present(tokens, H1_HASHTAG_TERMS), ...H1_OPPORTUNITY_TERMS.filter((t) => opportunity.has(t)), ...H1_DOMAIN_TERMS.filter((t) => domain.has(t))];
}

/** Hypothesis-specific analyst corrections for this browser session only: true = include, false = exclude. */
export type HypothesisCorrections = Readonly<Record<string, Partial<Readonly<Record<CandidateHypothesis, boolean>>>>>;

export interface TopicalFit {
  hypothesis: CandidateHypothesis;
  eligible: boolean;
  /**
   * derived-keyword: caption rule matched. manual-session: an analyst corrected this hypothesis in this session (not
   * stored, not independently reviewed). unclassified: no specific subject matter found. Durable review does not exist
   * in F1.I1, so no source ever claims it.
   */
  source: "derived-keyword" | "manual-session" | "unclassified";
  /** keywords the caption rule matched, kept visible even when a session correction overrides them */
  matched: readonly string[];
}

export function topicalFit(post: SocialPost, hypothesis: CandidateHypothesis, corrections: HypothesisCorrections): TopicalFit {
  const matched = deriveTopicalFit(post.caption, hypothesis);
  const manual = corrections[post.media_id]?.[hypothesis];
  if (manual !== undefined) return { hypothesis, eligible: manual, source: "manual-session", matched };
  return { hypothesis, eligible: matched.length > 0, source: matched.length ? "derived-keyword" : "unclassified", matched };
}
