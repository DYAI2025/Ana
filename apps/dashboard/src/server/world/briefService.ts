import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { briefFacts, parseBrief, type BriefRecord, type Fact, type HistoryDay } from "@/features/world/brief";
import { berlinDayOf } from "@/features/world/pulse";
import type { WorldBriefState, WorldPayload } from "@/features/world/types";
import { LOCALES, type Locale } from "@/lib/locale";
import { historyFile } from "./audienceHistory";
import { BrainCallError, isoWeek, SOURCE_ID, TOPICS, type BrainCall } from "./brainWriter";
import { askModel, type VisionConfig } from "./vision";

/**
 * The brief "Das Wichtigste fürs Geschäft" (features/world/brief.ts): written by the same Claude model as the post
 * categories, from numbered facts only — no caption, no post, no person goes to the model. Two ways:
 *
 * - the button ("Zusammenfassen", POST /api/world/brief): a brief of the current numbers, at most one per 10 minutes;
 * - the weekly brief: the first world read of each ISO week (Berlin) writes one in the background and puts it into the
 *   Brain as a CANDIDATE note (agent:lumen), derived from that week's pulse note, for Ana, Ben or Vince to confirm or
 *   reject.
 *
 * Every brief is written in one dashboard language (de, en, it): the facts are worded in that language
 * (features/world/briefText.ts) and the prompt asks for answers in it. The button writes the brief in the language of
 * the person who presses it; the weekly brief is written once per language. The Brain note stays the German one.
 *
 * Both are kept in world-brief.json next to the audience history (the StateDirectory on the VPS).
 */

export const BRIEF_PROMPT = `Du bist Analyst für Ana, eine Reise-Content-Creatorin auf Instagram. Das Team (Ana, Ben, Vince) will verstehen, was die Zahlen fürs Geschäft bedeuten: (1) ein Substack mit einer von zwei Ideen — "Chancen-Newsletter" (ausgewählte Jobs und Chancen für Creator- und Reisearbeit) oder "Vorlagen & Arbeitsdateien" (praktische Vorlagen aus Anas Arbeit) — und (2) Kooperationen mit Marken, die Reichweite, Community und Zielgruppe einkaufen (Länder mit hoher Kaufkraft, Tier 1, zählen dafür mehr als Tier 3).

Du bekommst nummerierte Fakten (F1, F2, …). Es sind die einzigen Daten. Regeln:
- Jede Aussage stützt sich auf Fakten und nennt deren Nummern in "facts". Zahlen nur als Ziffern und nur, wenn sie wörtlich in den genannten Fakten stehen; sonst ohne Zahl formulieren. Keine Mengen in Worten (Hälfte, doppelt, zehn …). Erfinde nichts.
- Unterscheide gemessen und gedeutet. Wenn Fakten einer Aussage widersprechen, nenne das in "counter" mit "counter_facts".
- "strength": weak bei kleinen n (unter 8) oder nur einem Fakt, medium bei mehreren stimmigen Fakten, strong nur bei großen n und keinem Gegenbeleg.
- Kein Zusammenhang zwischen einer Post-Art und einer Zielgruppe behaupten: Meta liefert Zielgruppen nur kontoweit; höchstens als zu prüfende Vermutung.
- Schreib für Ana, die mit Statistik nichts zu tun hat: Alltagssprache, kurz, ohne Floskeln. Keine Kürzel und kein Fachjargon: nie "H1", "H4", "Tier", "Index", "Median", "n", "Rate", "KPI". Sag stattdessen "Top-Märkte" (Länder, für die Marken am meisten zahlen), "Substack-Idee Chancen-Newsletter", "Substack-Idee Vorlagen & Arbeitsdateien", "Reaktionen", "gespeichert und geteilt".
- "title" höchstens 6 Wörter; "text" genau ein Satz mit höchstens 20 Wörtern; "headline", "brands.text", "substack.text" und "next_test" je ein Satz. Höchstens 4 Muster, die wichtigsten zuerst.

Antworte mit genau einem JSON-Objekt und sonst nichts:
{"headline": "ein Satz: das Wichtigste", "patterns": [{"kind": "content"|"audience"|"brand"|"substack", "title": "kurz", "text": "ein Satz", "facts": ["F1"], "counter": "Gegenbeleg oder null", "counter_facts": [], "strength": "weak"|"medium"|"strong"}], "brands": {"text": "was das für Marken-Kooperationen heißt", "facts": ["F1"]}, "substack": {"text": "was das für die zwei Substack-Ideen heißt", "facts": ["F1"], "lean": "H1"|"H4"|null}, "next_test": "der eine nächste Test, der am meisten klärt", "limits": ["was die Daten nicht sagen"]}`;

const BRIEF_PROMPT_EN = `You are an analyst for Ana, a travel content creator on Instagram. The team (Ana, Ben, Vince) wants to understand what the numbers mean for the business: (1) a Substack with one of two ideas — "Opportunity newsletter" (hand-picked jobs and opportunities for creator and travel work) or "Templates & working files" (practical templates from Ana's work) — and (2) partnerships with brands that buy reach, community and audience (countries with high purchasing power, Tier 1, count more for this than Tier 3).

You get numbered facts (F1, F2, …). They are the only data. Rules:
- Every statement rests on facts and names their numbers in "facts". Numbers only as digits and only when they appear literally in the cited facts; otherwise phrase it without a number. No quantities in words (half, double, ten …). Invent nothing.
- Tell measured from interpreted. If facts contradict a statement, say so in "counter" with "counter_facts".
- "strength": weak for small n (under 8) or a single fact, medium for several consistent facts, strong only for large n and no counter-evidence.
- Do not claim a link between a kind of post and an audience: Meta gives audiences only for the whole account; at most as a guess to be tested.
- Write for Ana, who has nothing to do with statistics: everyday language, short, no filler. No abbreviations and no jargon: never "H1", "H4", "Tier", "index", "median", "n", "rate", "KPI". Say instead "top markets" (countries brands pay the most for), "Substack idea Opportunity newsletter", "Substack idea Templates & working files", "reactions", "saved and shared".
- "title" at most 6 words; "text" exactly one sentence of at most 20 words; "headline", "brands.text", "substack.text" and "next_test" one sentence each. At most 4 patterns, the most important first.
- Write every text in English. Keep the JSON keys and the values of "kind", "strength" and "lean" exactly as shown.

Answer with exactly one JSON object and nothing else:
{"headline": "one sentence: what matters most", "patterns": [{"kind": "content"|"audience"|"brand"|"substack", "title": "short", "text": "one sentence", "facts": ["F1"], "counter": "counter-evidence or null", "counter_facts": [], "strength": "weak"|"medium"|"strong"}], "brands": {"text": "what this means for brand partnerships", "facts": ["F1"]}, "substack": {"text": "what this means for the two Substack ideas", "facts": ["F1"], "lean": "H1"|"H4"|null}, "next_test": "the one next test that clarifies the most", "limits": ["what the data does not say"]}`;

const BRIEF_PROMPT_IT = `Sei un analista per Ana, una content creator di viaggi su Instagram. Il team (Ana, Ben, Vince) vuole capire cosa significano i numeri per il business: (1) un Substack con una di due idee — «Newsletter delle opportunità» (lavori e opportunità selezionati per chi lavora come creator e in viaggio) oppure «Modelli e file di lavoro» (modelli pratici dal lavoro di Ana) — e (2) collaborazioni con marchi che comprano copertura, community e pubblico (i paesi con alto potere d'acquisto, Tier 1, contano di più dei Tier 3).

Ricevi fatti numerati (F1, F2, …). Sono gli unici dati. Regole:
- Ogni affermazione si basa su fatti e ne indica i numeri in "facts". Numeri solo in cifre e solo se compaiono alla lettera nei fatti citati; altrimenti formula senza numero. Nessuna quantità in parole (metà, doppio, dieci …); percentuali sempre con il simbolo %, mai «per cento». Non inventare nulla.
- Distingui ciò che è misurato da ciò che è interpretato. Se dei fatti contraddicono un'affermazione, dillo in "counter" con "counter_facts".
- "strength": weak con n piccoli (sotto 8) o un solo fatto, medium con più fatti coerenti, strong solo con n grandi e nessuna prova contraria.
- Non affermare un legame tra un tipo di post e un pubblico: Meta fornisce il pubblico solo per l'intero account; al massimo come ipotesi da verificare.
- Scrivi per Ana, che non ha niente a che fare con la statistica: linguaggio quotidiano, breve, senza frasi fatte. Niente sigle e niente gergo: mai "H1", "H4", "Tier", "indice", "mediana", "n", "tasso", "KPI". Di' invece "mercati top" (i paesi per cui i marchi pagano di più), "idea Substack Newsletter delle opportunità", "idea Substack Modelli e file di lavoro", "reazioni", "salvato e condiviso".
- "title" al massimo 6 parole; "text" esattamente una frase di al massimo 20 parole; "headline", "brands.text", "substack.text" e "next_test" una frase ciascuno. Al massimo 4 pattern, i più importanti prima.
- Scrivi ogni testo in italiano. Lascia le chiavi JSON e i valori di "kind", "strength" e "lean" esattamente come indicato.

Rispondi con esattamente un oggetto JSON e nient'altro:
{"headline": "una frase: la cosa più importante", "patterns": [{"kind": "content"|"audience"|"brand"|"substack", "title": "breve", "text": "una frase", "facts": ["F1"], "counter": "prova contraria o null", "counter_facts": [], "strength": "weak"|"medium"|"strong"}], "brands": {"text": "cosa significa per le collaborazioni con i marchi", "facts": ["F1"]}, "substack": {"text": "cosa significa per le due idee Substack", "facts": ["F1"], "lean": "H1"|"H4"|null}, "next_test": "il prossimo test che chiarisce di più", "limits": ["cosa i dati non dicono"]}`;

/** the prompt per dashboard language; the German one is the original */
export const BRIEF_PROMPTS: Readonly<Record<Locale, string>> = { de: BRIEF_PROMPT, en: BRIEF_PROMPT_EN, it: BRIEF_PROMPT_IT };
const FACTS_LABEL: Readonly<Record<Locale, string>> = { de: "Fakten:", en: "Facts:", it: "Fatti:" };
/** the weekly brief: German first (it goes into the Brain), then the others */
const WEEKLY_ORDER: readonly Locale[] = ["de", ...LOCALES.filter((l) => l !== "de")];
/** records written before the brief had languages are German */
export const localeOf = (r: Pick<BriefRecord, "locale">): Locale => r.locale ?? "de";

export const BRIEF_MIN_GAP_MS = 10 * 60_000;
export const FAIL_COOLDOWN_MS = 2 * 60_000;
const KEEP_WEEKS = 12;
const KEEP_WEEKLY = KEEP_WEEKS * LOCALES.length;
const WEEKLY_RETRY_MS = 60 * 60_000;

interface StoreFile {
  version: 1;
  /** the newest brief in any language (files from before the languages: the only one, German) */
  latest: BriefRecord | null;
  /** the newest brief per language */
  latest_by?: Partial<Record<Locale, BriefRecord>>;
  /** weekly briefs, one per ISO week and language */
  weeks: BriefRecord[];
  /** weeks whose brief is in the Brain (a failed Brain write is tried again, the brief is not written twice) */
  in_brain?: string[];
}

export function briefFile(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return path.join(path.dirname(historyFile(env)), "world-brief.json");
}

async function readStore(file: string): Promise<StoreFile> {
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as StoreFile;
    if (raw && raw.version === 1 && Array.isArray(raw.weeks)) {
      // a file from before the languages: its one brief is the German one
      if (!raw.latest_by) raw.latest_by = raw.latest ? { [localeOf(raw.latest)]: raw.latest } : {};
      return raw;
    }
  } catch {
    // missing or broken: start empty
  }
  return { version: 1, latest: null, latest_by: {}, weeks: [] };
}

async function writeStore(file: string, s: StoreFile): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(s), { mode: 0o600 });
  await fs.rename(tmp, file);
}

/** The model's text as a brief, checked against the facts; null when unusable. */
export function parseBriefAnswer(text: string, facts: readonly Fact[]) {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return null;
  try {
    const b = parseBrief(JSON.parse(m[0]), facts);
    return b && (b.patterns.length > 0 || b.brands || b.substack) ? b : null;
  } catch {
    return null;
  }
}

/** The brief as Markdown for its Brain note: the patterns with the facts they rest on, spelled out. */
export function briefMarkdown(r: BriefRecord): string {
  const fact = new Map(r.facts.map((f) => [f.id, f.text]));
  const cite = (ids: string[]) => ids.map((id) => `  - ${id}: ${fact.get(id) ?? "?"}`).join("\n");
  const lines = [
    `Wochenbrief ${r.week}, geschrieben ${r.at} von ${r.model} aus ${r.facts.length} gemessenen Fakten des Dashboards. CANDIDATE: Deutung, nicht Messung — bestätigen oder verwerfen.`,
    "",
    `**${r.brief.headline || "Muster der Woche"}**`,
    "",
  ];
  for (const p of r.brief.patterns) {
    lines.push(`- [${p.kind} · ${p.strength}] **${p.title}**: ${p.text}`, cite(p.facts));
    if (p.counter) lines.push(`  - Dagegen: ${p.counter}`, ...(p.counter_facts.length ? [cite(p.counter_facts)] : []));
  }
  if (r.brief.brands) lines.push("", `**Für Marken:** ${r.brief.brands.text}`, cite(r.brief.brands.facts));
  if (r.brief.substack) lines.push("", `**Für Substack${r.brief.substack.lean ? ` (Tendenz ${r.brief.substack.lean})` : ""}:** ${r.brief.substack.text}`, cite(r.brief.substack.facts));
  if (r.brief.next_test) lines.push("", `**Nächster Test:** ${r.brief.next_test}`);
  if (r.brief.limits.length) lines.push("", "**Grenzen:**", ...r.brief.limits.map((l) => `- ${l}`));
  const text = lines.join("\n");
  return text.length <= 19_000 ? text : `${text.slice(0, 18_997)}…`;
}

export interface BriefDeps {
  config: VisionConfig;
  readHistory: () => Promise<HistoryDay[]>;
  /** Brain tool call of the agent key (brainWriter.ts); null without a Brain */
  brain: BrainCall | null;
  file?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

export type GenerateResult = { ok: true; record: BriefRecord; fresh: boolean } | { ok: false; reason: string };

export interface BriefService {
  state(): WorldBriefState;
  /** the button: a brief of the current numbers in `locale` (or the last one in it, if it is younger than 10 minutes) */
  generate(world: WorldPayload, locale: Locale): Promise<GenerateResult>;
  /** the first read of an ISO week writes the weekly brief (every language) in the background; never throws, never waits */
  scheduleWeekly(world: WorldPayload): void;
  /** test hook */
  idle(): Promise<void>;
}

export function createBriefService(deps: BriefDeps): BriefService {
  const file = deps.file ?? briefFile();
  const fetchImpl = deps.fetchImpl ?? fetch;
  const now = deps.now ?? Date.now;
  // a brief is long: give the model more time than a category read
  const config: VisionConfig = { ...deps.config, timeoutMs: Math.max(deps.config.timeoutMs, 60_000) };
  let store: StoreFile | null = null;
  let loading: Promise<StoreFile> | null = null;
  // every run in flight (button and weekly), so idle() waits for all of them, not only the newest
  const inflight = new Set<Promise<unknown>>();
  const track = (p: Promise<unknown>) => {
    inflight.add(p);
    void p.then(
      () => inflight.delete(p),
      () => inflight.delete(p),
    );
  };
  const nowPending = new Map<Locale, Promise<GenerateResult>>();
  let nowFailedAt = -Infinity;
  let weeklyBusy = false;
  let weeklyFailedAt = -Infinity;
  let lastError: string | null = null;

  const load = async () => (store ??= await (loading ??= readStore(file)));

  async function write(world: WorldPayload, kind: BriefRecord["kind"], locale: Locale, weekOf?: string): Promise<BriefRecord> {
    const t = now();
    const history = await deps.readHistory().catch(() => [] as HistoryDay[]);
    const facts = briefFacts(world, history, t, locale);
    const list = facts.map((f) => `${f.id} [${f.kind}] ${f.text}`).join("\n");
    const text = await askModel(config, [{ type: "text", text: `${BRIEF_PROMPTS[locale]}\n\n${FACTS_LABEL[locale]}\n${list}` }], fetchImpl, 2_500);
    if (text === undefined) throw new Error("model-unavailable");
    const brief = parseBriefAnswer(text, facts);
    if (!brief) throw new Error("model-answer-unusable");
    const record: BriefRecord = { locale, at: new Date(t).toISOString(), week: weekOf ?? isoWeek(berlinDayOf(t)), kind, model: config.model, facts, brief };
    const s = await load();
    s.latest = record;
    s.latest_by = { ...s.latest_by, [locale]: record };
    if (kind === "weekly") s.weeks = [...s.weeks.filter((w) => !(w.week === record.week && localeOf(w) === locale)), record].slice(-KEEP_WEEKLY);
    await writeStore(file, s).catch(() => undefined);
    return record;
  }

  async function toBrain(r: BriefRecord) {
    const call = deps.brain;
    if (!call) return;
    const id = `kn-world-brief-${r.week}`;
    await call(
      "brain_create_note",
      {
        id,
        title: `Wochenbrief ${r.week}: ${r.brief.headline || "Muster der Woche"}`.slice(0, 300),
        type: "concept",
        // a reading of the numbers: CANDIDATE until a person confirms it
        status: "CANDIDATE",
        body: briefMarkdown(r),
        topics: [TOPICS.substack, TOPICS.brands],
        source_refs: [{ source: SOURCE_ID, locator: `Wochenbrief ${r.week} (${r.facts.length} Fakten)` }],
        provenance_note: `brief by ${r.model} from dashboard facts`,
      },
      true,
    );
    // the week's pulse note is written by brainWriter (daily); until it exists the link fails and the hourly retry
    // tries again (the note itself counts as done: "exists")
    await call("brain_add_relation", { from: id, type: "derived_from", to: `kn-world-pulse-${r.week}` });
  }

  return {
    state() {
      const s = store;
      const weekly: Partial<Record<Locale, BriefRecord>> = {};
      for (const w of s?.weeks ?? []) weekly[localeOf(w)] = w;
      const newestWeek = s?.weeks.at(-1)?.week ?? null;
      return {
        state: lastError ? "error" : "on",
        busy: nowPending.size > 0 || weeklyBusy,
        latest: { ...(s?.latest_by ?? {}) },
        weekly,
        in_brain: newestWeek ? (s?.in_brain ?? []).includes(newestWeek) : false,
        brain: deps.brain !== null,
        reason: lastError,
      };
    },
    generate(world, locale) {
      // one button brief per language at a time: every caller while it runs gets the same answer (no second model call)
      let pending = nowPending.get(locale);
      if (!pending) {
        pending = (async (): Promise<GenerateResult> => {
          const s = await load();
          const last = s.latest_by?.[locale];
          if (last && now() - Date.parse(last.at) < BRIEF_MIN_GAP_MS) return { ok: true, record: last, fresh: false };
          // after a failed brief the next model call waits a little (no loop of paid calls on a broken answer)
          if (now() - nowFailedAt < FAIL_COOLDOWN_MS) return { ok: false, reason: lastError ?? "cooldown" };
          try {
            const record = await write(world, "now", locale);
            lastError = null;
            return { ok: true, record, fresh: true };
          } catch (e) {
            nowFailedAt = now();
            lastError = e instanceof Error ? e.message : "error";
            return { ok: false, reason: lastError };
          }
        })().finally(() => {
          nowPending.delete(locale);
        });
        nowPending.set(locale, pending);
        track(pending);
      }
      return pending;
    },
    scheduleWeekly(world) {
      if (weeklyBusy || now() - weeklyFailedAt < WEEKLY_RETRY_MS) return;
      // the week is fixed when the run starts: a run across Sunday midnight files under the week it began in
      const week = isoWeek(berlinDayOf(now()));
      weeklyBusy = true;
      const run = load()
        .then(async (s) => {
          // every language that has no brief for this week yet; one that fails is tried again in an hour, the others stay
          let failed: unknown = null;
          for (const locale of WEEKLY_ORDER) {
            if (s.weeks.some((w) => w.week === week && localeOf(w) === locale)) continue;
            try {
              await write(world, "weekly", locale, week);
            } catch (e) {
              failed ??= e;
            }
          }
          // the German brief goes into the Brain (one note per week)
          const de = s.weeks.find((w) => w.week === week && localeOf(w) === "de");
          if (de && deps.brain && !(s.in_brain ?? []).includes(week)) {
            await toBrain(de);
            s.in_brain = [...(s.in_brain ?? []), week].slice(-KEEP_WEEKS);
            await writeStore(file, s).catch(() => undefined);
          }
          if (failed) throw failed;
          lastError = null;
        })
        .catch((e: unknown) => {
          weeklyFailedAt = now();
          lastError = e instanceof BrainCallError ? e.message : e instanceof Error ? e.message : "error";
        })
        .finally(() => {
          weeklyBusy = false;
        });
      track(run);
    },
    idle: async () => {
      while (inflight.size) await Promise.allSettled([...inflight]);
    },
  };
}
