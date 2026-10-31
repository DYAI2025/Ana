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
 * H1 (Opportunity Drop) needs a specific creator/UGC/remote-work job or opportunity TOPIC, read from a few fixed
 * constructions inside one clause (clauses end at . ! ? ; , and line breaks):
 * - domain term directly before the opportunity term: "UGC jobs", "creator opportunities", "brands hiring";
 * - opportunity term, a connector (for / für / per), then the domain term: "jobs for creators", "Stellenangebote für Creator",
 *   but not as the predicate of a copula ("Reels are a huge opportunity for brands" is commentary);
 * - "hiring" announced (clause start, "now hiring", "we're hiring", "brands hiring", "<brand> is hiring") and followed by the domain term
 *   (at most one word between): "hiring UGC creators"; advice such as "stop hiring influencers" does not count;
 * - a plural list head with a colon: "Opportunities list: remote work" (a singular "Dream job: UGC creator" is a label).
 * The topic is enough: a live job posting or an explicit offer signal ("apply", "deadline") is not required, and a how-to
 * or advice frame does not block it ("How to land your first UGC job", "Where to find remote jobs as a creator"). A match
 * is DERIVED editorial relevance only, never audience need, demand or a commercial outcome (AC2 contract repair, PO
 * 2026-10-31; this reverts the review-round-5 offer-signal gate and advice-frame abstention, which went beyond the contract).
 * Anything else does not qualify, however close the words are ("great job creators", "a brand new opportunity to
 * travel", "my UGC side gig", "remote island trip, what an opportunity"); neither do travel, nomad, creator or UGC alone,
 * or "apply" alone. A few compact hashtags count on their own.
 *
 * Bare "remote" pairs only with job-specific terms (job, gig, hiring), not with a bare "opportunity" ("remote opportunity
 * to travel"); "remote work" pairs with any opportunity term. A first-person possessive just before the construction
 * names the author's own job ("I quit my remote job", "my job for creators"), and a negator denies it ("not a UGC job"):
 * neither is an opportunity offered. When in doubt the rule abstains; an analyst can include the post for the session.
 * (Strategy since review round 3: allowlisted constructions instead of word proximity, which kept admitting new idioms.
 * Round 4 widened the guards to the whole clause. A caption keyword rule still cannot read intent: known residual false
 * positives are listed in docs/evidence/ANA-39/CHECKLIST.md, and the lane says "suggestion", never "confirmed".)
 */
export const H1_OPPORTUNITY_TERMS = ["job", "jobs", "gig", "gigs", "opportunity", "opportunities", "hiring", "casting call", "open call", "job board", "job listing", "job listings", "vacancy", "vacancies", "stellenangebot", "stellenangebote", "offerte di lavoro", "opportunità di lavoro"] as const;
export const H1_DOMAIN_TERMS = ["ugc", "creator", "creators", "influencer", "influencers", "remote work", "remote working", "remote", "remoto", "brand", "brands"] as const;
const DOMAIN_WORDS: ReadonlySet<string> = new Set(H1_DOMAIN_TERMS);
/** Bare "remote" may mean a place ("remote opportunity to travel"); it needs a job-specific term. "remote work" does not. */
const H1_WORK_ONLY_DOMAINS: ReadonlySet<string> = new Set(["remote", "remoto"]);
const H1_GENERIC_OPPORTUNITY: ReadonlySet<string> = new Set(["opportunity", "opportunities"]);
/** "jobs for creators", "Stellenangebote für Creator", "opportunità di lavoro per creator" */
const H1_CONNECTORS: ReadonlySet<string> = new Set(["for", "für", "per"]);
/** "our brand is hiring" */
const COPULAS: ReadonlySet<string> = new Set(["is", "are", "ist", "sind", "è", "sono"]);
/** Words before "hiring" that announce it ("now hiring", "we're hiring", "brand is hiring"); clause start counts too. */
const HIRING_ANNOUNCERS: ReadonlySet<string> = new Set(["now", "re", "m", "currently", "still", "is", "ist", "è"]);
/** Generic subjects make "X is/are hiring" a trend statement, not an announcement ("everyone is hiring UGC creators"). */
const GENERIC_SUBJECTS: ReadonlySet<string> = new Set(["everyone", "everybody", "anyone", "anybody", "nobody", "brands", "companies", "agencies", "more", "all"]);
/** List heads are plural ("UGC jobs: …", "Opportunities list: …"); a singular head before a colon is a label. */
const H1_PLURAL_OPPORTUNITY: ReadonlySet<string> = new Set(["jobs", "gigs", "opportunities", "vacancies", "job listings", "stellenangebote", "offerte di lavoro"]);
/** Job nouns that, after a first-person possessive ("my remote job"), name the author's own employment. */
const H1_OWN_JOB_NOUNS: ReadonlySet<string> = new Set(["job", "jobs", "gig", "gigs"]);
const FIRST_PERSON_POSSESSIVES: ReadonlySet<string> = new Set(["my", "our", "mein", "meine", "meinen", "meinem", "meiner", "unser", "unsere", "unseren", "unserem", "unserer", "mio", "mia", "miei", "mie", "nostro", "nostra", "nostri", "nostre"]);
/** Verbs that report the author's own job ("just booked another UGC gig", "landed a brand job"). */
const OWN_JOB_VERBS: ReadonlySet<string> = new Set(["booked", "landed", "wrapped", "quit", "left", "started", "finished", "lost", "got", "gekündigt", "verloren", "lasciato"]);
/** "Great job", "good job": praise, not a job */
const PRAISE: ReadonlySet<string> = new Set(["great", "good", "nice", "awesome", "amazing", "gut", "guter", "toller", "bravo", "ottimo", "bel"]);
/** "not a UGC job", "no template needed", "kein Job", "nessun lavoro" */
const NEGATORS: ReadonlySet<string> = new Set(["no", "not", "never", "without", "nobody", "nothing", "don", "doesn", "didn", "isn", "aren", "wasn", "weren", "won", "kein", "keine", "keinen", "nicht", "ohne", "non", "nessun", "nessuna", "senza"]);
export const H1_HASHTAG_TERMS = ["ugcjob", "ugcjobs", "ugcopportunities", "creatorjobs", "creatoropportunity", "creatoropportunities", "remotejob", "remotejobs"] as const;
/**
 * H4 (Working File) needs a specific reusable artifact: a template, checklist, worksheet, media kit or similar file.
 * Money, career, "tips", "guide", "how to" or "step by step" alone are not a reusable file. Ambiguous words (Italian
 * "modello" = model) are left out. A negated artifact ("no template needed") does not count.
 */
export const H4_ARTIFACT_TERMS = ["template", "templates", "checklist", "checklists", "worksheet", "worksheets", "swipe file", "media kit", "rate card", "sop", "printable", "vorlage", "vorlagen", "checkliste", "checklisten"] as const;
/**
 * "Workflow" alone is usually a routine ("my morning workout workflow"), "spreadsheet" an office job ("my spreadsheet job")
 * and "toolkit" a figure of speech ("my emotional toolkit"). They count only with a cue that the thing itself is a reusable
 * file, in the same clause, with no new subject in between, and either right before it as a modifier (at most one word
 * between: "downloadable workflow", "PDF workflow") or after it as an apposition at most H4_CUE_GAP words away
 * ("workflow as a PDF"). An app name alone is not a file cue ("Notion changed my workflow"); "Notion template" is. A cue the
 * routine acts on does not count ("workflow for video files", "workflow to file taxes", "workflow: download emails").
 * Calls to action ("save this") are not cues: they move saves themselves.
 */
export const H4_WEAK_ARTIFACT_TERMS = ["workflow", "workflows", "spreadsheet", "spreadsheets", "toolkit"] as const;
/** A Reels/CapCut "template" is an edit or audio preset, not a working file ("CapCut template in bio", "Use template"). */
const EDIT_PRESET_WORDS: ReadonlySet<string> = new Set(["reel", "reels", "capcut", "tiktok", "trend", "trending", "audio", "transition", "edit"]);
/** "workflow as a PDF", "Workflow als Datei", "workflow come file" */
const APPOSITION: ReadonlySet<string> = new Set(["as", "als", "come"]);
export const H4_REUSABLE_FILE_CUES = ["file", "files", "pdf", "download", "downloadable", "notion template", "google doc", "google sheet", "reusable", "plug and play", "datei", "dateien"] as const;
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

/**
 * A guard word anywhere earlier in the same clause ("I quit my full-time remote job", "we don't need a template").
 * Clause-wide on purpose: the rule abstains rather than guess how far a possessive, verb or negator reaches.
 */
const before = (tokens: readonly string[], start: number, set: ReadonlySet<string>) => tokens.slice(0, start).some((t) => set.has(t));

/**
 * "hiring" as an announcement: at the clause start, after "now/we're/I'm", after "<brand> is", or after a domain word
 * ("5 brands hiring creators"); not after a generic subject ("everyone is hiring") and not when the clause goes on to
 * judge it ("brands hiring influencers without contracts is a red flag").
 */
function announcedHiring(t: readonly string[], os: number): boolean {
  if (t.slice(os + 1).some((w) => COPULAS.has(w))) return false;
  if (os === 0) return true;
  const prev = t[os - 1]!;
  if (HIRING_ANNOUNCERS.has(prev)) return !(COPULAS.has(prev) && GENERIC_SUBJECTS.has(t[os - 2]!));
  return DOMAIN_WORDS.has(prev) && !t.slice(0, os).some((w) => GENERIC_SUBJECTS.has(w) && w !== prev);
}

/** One H1 construction between an opportunity occurrence [os, oe] and a domain occurrence [ds, de], or false. */
function h1Construction(t: readonly string[], o: string, [os, oe]: [number, number], [ds, de]: [number, number]): boolean {
  if (de === os - 1) return true; // "UGC jobs", "brands hiring"
  if (o === "hiring" && de === os - 2 && COPULAS.has(t[os - 1]!)) return true; // "our brand is hiring"
  if (ds === oe + 2 && H1_CONNECTORS.has(t[oe + 1]!) && !before(t, os, COPULAS)) return true; // "jobs for creators"
  if (o === "hiring" && ds > oe && ds - oe - 1 <= 1 && announcedHiring(t, os)) return true; // "(5 brands) hiring (talented) creators"
  if (H1_PLURAL_OPPORTUNITY.has(o) && ds > oe && t[ds - 1] === ":" && ds - 1 - oe - 1 <= 1) return true; // "Opportunities list: remote work"
  return false;
}

/** Caption keywords that make a post topically eligible, or [] (generic words only, never caption excerpts). */
export function deriveTopicalFit(caption: string | null, hypothesis: CandidateHypothesis): readonly string[] {
  if (!caption) return [];
  const cs = clauses(caption);
  const hits = new Set<string>();
  if (hypothesis === "H4") {
    for (const t of cs) {
      for (const a of H4_ARTIFACT_TERMS) if (occurrences(t, a).some(([s]) => !before(t, s, NEGATORS) && !(a.startsWith("template") && (t.some((w) => EDIT_PRESET_WORDS.has(w)) || t.slice(Math.max(0, s - 2), s).includes("use"))))) hits.add(a);
      for (const w of H4_WEAK_ARTIFACT_TERMS)
        for (const [ws, we] of occurrences(t, w)) {
          if (before(t, ws, NEGATORS)) continue;
          for (const c of H4_REUSABLE_FILE_CUES)
            for (const [cs0, ce] of occurrences(t, c)) {
              if (before(t, cs0, NEGATORS)) continue;
              const [lo, hi] = cs0 > we ? [we + 1, cs0] : [ce + 1, ws];
              if (cs0 > we && !APPOSITION.has(t[we + 1]!)) continue;
              if (cs0 < ws && ws - ce - 1 > 1) continue; // a modifier sits right before it ("downloadable (creator) toolkit")
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
            if (H1_OWN_JOB_NOUNS.has(o) && (before(t, start, FIRST_PERSON_POSSESSIVES) || before(t, start, OWN_JOB_VERBS))) continue;
            if (before(t, start, NEGATORS)) continue;
            if (H1_OWN_JOB_NOUNS.has(o) && (t.slice(Math.max(0, start - 2), start).some((x) => PRAISE.has(x)) || (t[occ[1] + 1] === "well" && t[occ[1] + 2] === "done"))) continue;
            if ((o === "gig" || o === "gigs") && t[occ[1] + 1] === "economy") continue;
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
