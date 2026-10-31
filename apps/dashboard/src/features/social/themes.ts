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
 * H1 (Opportunity Drop) needs a specific creator/UGC/remote-work opportunity or job, read from a few fixed constructions
 * inside one clause (clauses end at . ! ? ; , and line breaks):
 * - domain term directly before the opportunity term: "UGC jobs", "creator opportunities", "brands hiring";
 * - opportunity term, a connector (for / für / per), then the domain term: "jobs for creators", "Stellenangebote für Creator";
 * - "hiring" followed by the domain term (at most one word between): "hiring UGC creators"; "<brand> is hiring";
 * - a list head with a colon: "Opportunities list: remote work".
 * Anything else does not qualify, however close the words are ("great job creators", "a brand new opportunity to
 * travel", "my UGC side gig", "remote island trip, what an opportunity"); neither do travel, nomad, creator or UGC alone,
 * or "apply" alone. A few compact hashtags count on their own.
 *
 * Bare "remote" pairs only with job-specific terms (job, gig, hiring), not with a bare "opportunity" ("remote opportunity
 * to travel"); "remote work" pairs with any opportunity term. A first-person possessive just before the construction
 * names the author's own job ("I quit my remote job", "my job for creators"), and a negator denies it ("not a UGC job"):
 * neither is an opportunity offered. When in doubt the rule abstains; an analyst can include the post for the session.
 * (Strategy since review round 3: allowlisted constructions instead of word proximity, which kept admitting new idioms.)
 */
export const H1_OPPORTUNITY_TERMS = ["job", "jobs", "gig", "gigs", "opportunity", "opportunities", "hiring", "casting call", "open call", "job board", "job listing", "job listings", "vacancy", "vacancies", "stellenangebot", "stellenangebote", "offerte di lavoro", "opportunità di lavoro"] as const;
export const H1_DOMAIN_TERMS = ["ugc", "creator", "creators", "influencer", "influencers", "remote work", "remote working", "remote", "remoto", "brand", "brands"] as const;
/** Bare "remote" may mean a place ("remote opportunity to travel"); it needs a job-specific term. "remote work" does not. */
const H1_WORK_ONLY_DOMAINS: ReadonlySet<string> = new Set(["remote", "remoto"]);
const H1_GENERIC_OPPORTUNITY: ReadonlySet<string> = new Set(["opportunity", "opportunities"]);
/** "jobs for creators", "Stellenangebote für Creator", "opportunità di lavoro per creator" */
const H1_CONNECTORS: ReadonlySet<string> = new Set(["for", "für", "per"]);
/** "our brand is hiring" */
const COPULAS: ReadonlySet<string> = new Set(["is", "are", "ist", "sind", "è", "sono"]);
/** Job nouns that, after a first-person possessive ("my remote job"), name the author's own employment. */
const H1_OWN_JOB_NOUNS: ReadonlySet<string> = new Set(["job", "jobs", "gig", "gigs"]);
const FIRST_PERSON_POSSESSIVES: ReadonlySet<string> = new Set(["my", "mein", "meine", "meinen", "meinem", "meiner", "mio", "mia", "miei", "mie"]);
/** "Great job", "good job": praise, not a job */
const PRAISE: ReadonlySet<string> = new Set(["great", "good", "nice", "awesome", "amazing", "gut", "guter", "toller", "bravo", "ottimo", "bel"]);
/** "not a UGC job", "no template needed", "kein Job", "nessun lavoro" */
const NEGATORS: ReadonlySet<string> = new Set(["no", "not", "never", "without", "kein", "keine", "keinen", "nicht", "ohne", "non", "nessun", "nessuna", "senza"]);
/** How many tokens before a construction a possessive or negator may stand ("my old remote job", "not a UGC job"). */
const LOOKBACK = 2;
export const H1_HASHTAG_TERMS = ["ugcjob", "ugcjobs", "ugcopportunities", "creatorjobs", "creatoropportunity", "creatoropportunities", "remotejob", "remotejobs"] as const;
/**
 * H4 (Working File) needs a specific reusable artifact: a template, checklist, worksheet, media kit or similar file.
 * Money, career, "tips", "guide", "how to" or "step by step" alone are not a reusable file. Ambiguous words (Italian
 * "modello" = model) are left out. A negated artifact ("no template needed") does not count.
 */
export const H4_ARTIFACT_TERMS = ["template", "templates", "checklist", "checklists", "worksheet", "worksheets", "spreadsheet", "spreadsheets", "toolkit", "swipe file", "media kit", "rate card", "sop", "printable", "vorlage", "vorlagen", "checkliste", "checklisten"] as const;
/**
 * "Workflow" alone is usually a routine ("my morning workout workflow"), not a file. It counts only with a cue that the
 * workflow itself is a reusable file, in the same clause, at most H4_CUE_GAP words away and with no new subject in between
 * ("my morning workflow before I download my emails" is not one). Calls to action ("save this") are not cues: they move
 * saves themselves.
 */
export const H4_WEAK_ARTIFACT_TERMS = ["workflow", "workflows"] as const;
export const H4_REUSABLE_FILE_CUES = ["file", "files", "pdf", "download", "downloadable", "notion", "google doc", "google sheet", "reusable", "plug and play", "datei", "dateien"] as const;
const H4_CUE_GAP = 3;
const SUBJECT_PRONOUNS: ReadonlySet<string> = new Set(["i", "we", "you", "he", "she", "they", "ich", "wir", "du", "io", "noi", "tu"]);

/**
 * Clauses of lower-case word tokens. Clauses end at . ! ? ; , and line breaks; inside a clause a colon is kept as its own
 * token (list heads). Hyphens and "#" separate words ("ugc-job" = "ugc job", "#ugcjobs" = "ugcjobs").
 */
const clauses = (caption: string) =>
  caption
    .toLowerCase()
    .split(/[.!?;,\n\r•|]+/u)
    .map((c) => c.replace(/:/g, " : ").split(/[^\p{L}\p{N}:]+/u).filter(Boolean))
    .filter((c) => c.length > 0);

/** Token ranges [start, end] where a (possibly multi-word) term occurs. */
function occurrences(tokens: readonly string[], term: string): Array<[number, number]> {
  const words = term.split(" ");
  const found: Array<[number, number]> = [];
  for (let i = 0; i + words.length <= tokens.length; i += 1) if (words.every((w, k) => tokens[i + k] === w)) found.push([i, i + words.length - 1]);
  return found;
}

const before = (tokens: readonly string[], start: number, set: ReadonlySet<string>) => tokens.slice(Math.max(0, start - LOOKBACK), start).some((t) => set.has(t));

/** One H1 construction between an opportunity occurrence [os, oe] and a domain occurrence [ds, de], or false. */
function h1Construction(t: readonly string[], o: string, [os, oe]: [number, number], [ds, de]: [number, number]): boolean {
  if (de === os - 1) return true; // "UGC jobs", "brands hiring"
  if (o === "hiring" && de === os - 2 && COPULAS.has(t[os - 1]!)) return true; // "our brand is hiring"
  if (ds === oe + 2 && H1_CONNECTORS.has(t[oe + 1]!)) return true; // "jobs for creators"
  if (o === "hiring" && ds > oe && ds - oe - 1 <= 1) return true; // "hiring (talented) creators"
  if (ds > oe && t[ds - 1] === ":" && ds - 1 - oe - 1 <= 1) return true; // "Opportunities list: remote work"
  return false;
}

/** Caption keywords that make a post topically eligible, or [] (generic words only, never caption excerpts). */
export function deriveTopicalFit(caption: string | null, hypothesis: CandidateHypothesis): readonly string[] {
  if (!caption) return [];
  const cs = clauses(caption);
  const hits = new Set<string>();
  if (hypothesis === "H4") {
    for (const t of cs) {
      for (const a of H4_ARTIFACT_TERMS) if (occurrences(t, a).some(([s]) => !before(t, s, NEGATORS))) hits.add(a);
      for (const w of H4_WEAK_ARTIFACT_TERMS)
        for (const [ws, we] of occurrences(t, w)) {
          if (before(t, ws, NEGATORS)) continue;
          for (const c of H4_REUSABLE_FILE_CUES)
            for (const [cs0, ce] of occurrences(t, c)) {
              const [lo, hi] = cs0 > we ? [we + 1, cs0] : [ce + 1, ws];
              if (hi - lo > H4_CUE_GAP || t.slice(lo, hi).some((x) => SUBJECT_PRONOUNS.has(x))) continue;
              hits.add(w);
              hits.add(c);
            }
        }
    }
    return [...H4_ARTIFACT_TERMS, ...H4_WEAK_ARTIFACT_TERMS, ...H4_REUSABLE_FILE_CUES].filter((k) => hits.has(k));
  }
  for (const t of cs) {
    for (const h of H1_HASHTAG_TERMS) if (occurrences(t, h).length) hits.add(h);
    for (const o of H1_OPPORTUNITY_TERMS)
      for (const occ of occurrences(t, o))
        for (const d of H1_DOMAIN_TERMS)
          for (const dOcc of occurrences(t, d)) {
            if (!h1Construction(t, o, occ, dOcc)) continue;
            if (H1_WORK_ONLY_DOMAINS.has(d) && H1_GENERIC_OPPORTUNITY.has(o)) continue;
            const start = Math.min(occ[0], dOcc[0]);
            if (H1_OWN_JOB_NOUNS.has(o) && before(t, start, FIRST_PERSON_POSSESSIVES)) continue;
            if (before(t, start, NEGATORS)) continue;
            if (H1_OWN_JOB_NOUNS.has(o) && (PRAISE.has(t[occ[0] - 1]!) || (t[occ[1] + 1] === "well" && t[occ[1] + 2] === "done"))) continue;
            hits.add(o);
            hits.add(d);
          }
  }
  return [...H1_HASHTAG_TERMS, ...H1_OPPORTUNITY_TERMS, ...H1_DOMAIN_TERMS].filter((k) => hits.has(k));
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
