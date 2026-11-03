import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { briefFacts, parseBrief, type BriefRecord, type Fact, type HistoryDay } from "@/features/world/brief";
import { berlinDayOf } from "@/features/world/pulse";
import type { WorldBriefState, WorldPayload } from "@/features/world/types";
import { historyFile } from "./audienceHistory";
import { BrainCallError, isoWeek, SOURCE_ID, TOPICS, weekNoteId, type BrainCall } from "./brainWriter";
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
 * Both are kept in world-brief.json next to the audience history (the StateDirectory on the VPS).
 */

export const BRIEF_PROMPT = `Du bist Analyst für Ana, eine Reise-Content-Creatorin auf Instagram. Das Team (Ana, Ben, Vince) will verstehen, was die Zahlen fürs Geschäft bedeuten: (1) ein Substack mit einer von zwei Hypothesen — H1 Opportunity Drop oder H4 Working File — und (2) Kooperationen mit Marken, die Reichweite, Community und Zielgruppe einkaufen (Länder mit hoher Kaufkraft, Tier 1, zählen dafür mehr als Tier 3).

Du bekommst nummerierte Fakten (F1, F2, …). Es sind die einzigen Daten. Regeln:
- Jede Aussage stützt sich auf Fakten und nennt deren Nummern in "facts". Zahlen nur, wenn sie wörtlich in den genannten Fakten stehen; sonst ohne Zahl formulieren. Erfinde nichts.
- Unterscheide gemessen und gedeutet. Wenn Fakten einer Aussage widersprechen, nenne das in "counter" mit "counter_facts".
- "strength": weak bei kleinen n (unter 8) oder nur einem Fakt, medium bei mehreren stimmigen Fakten, strong nur bei großen n und keinem Gegenbeleg.
- Kein Zusammenhang zwischen einer Post-Art und einer Zielgruppe behaupten: Meta liefert Zielgruppen nur kontoweit; höchstens als zu prüfende Vermutung.
- Deutsch, klar, kurz, ohne Floskeln. Höchstens 5 Muster, die wichtigsten zuerst.

Antworte mit genau einem JSON-Objekt und sonst nichts:
{"headline": "ein Satz: das Wichtigste", "patterns": [{"kind": "content"|"audience"|"brand"|"substack", "title": "kurz", "text": "1–2 Sätze", "facts": ["F1"], "counter": "Gegenbeleg oder null", "counter_facts": [], "strength": "weak"|"medium"|"strong"}], "brands": {"text": "was das für Marken-Kooperationen heißt", "facts": ["F1"]}, "substack": {"text": "was das für H1 gegen H4 heißt", "facts": ["F1"], "lean": "H1"|"H4"|null}, "next_test": "der eine nächste Test, der am meisten klärt", "limits": ["was die Daten nicht sagen"]}`;

export const BRIEF_MIN_GAP_MS = 10 * 60_000;
const KEEP_WEEKS = 12;
const WEEKLY_RETRY_MS = 60 * 60_000;

interface StoreFile {
  version: 1;
  latest: BriefRecord | null;
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
    if (raw && raw.version === 1 && Array.isArray(raw.weeks)) return raw;
  } catch {
    // missing or broken: start empty
  }
  return { version: 1, latest: null, weeks: [] };
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

export interface BriefService {
  state(): WorldBriefState;
  /** the button: a brief of the current numbers (or the last one, if it is younger than 10 minutes) */
  generate(world: WorldPayload): Promise<{ ok: true; record: BriefRecord; fresh: boolean } | { ok: false; reason: string }>;
  /** the first read of an ISO week writes the weekly brief in the background; never throws, never waits */
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
  let running: Promise<unknown> = Promise.resolve();
  let busy = false;
  let weeklyFailedAt = -Infinity;
  let lastError: string | null = null;

  const load = async () => (store ??= await (loading ??= readStore(file)));

  async function write(world: WorldPayload, kind: BriefRecord["kind"]): Promise<BriefRecord> {
    const t = now();
    const history = await deps.readHistory().catch(() => [] as HistoryDay[]);
    const facts = briefFacts(world, history, t);
    const list = facts.map((f) => `${f.id} [${f.kind}] ${f.text}`).join("\n");
    const text = await askModel(config, [{ type: "text", text: `${BRIEF_PROMPT}\n\nFakten:\n${list}` }], fetchImpl, 2_500);
    if (text === undefined) throw new Error("model-unavailable");
    const brief = parseBriefAnswer(text, facts);
    if (!brief) throw new Error("model-answer-unusable");
    const record: BriefRecord = { at: new Date(t).toISOString(), week: isoWeek(berlinDayOf(t)), kind, model: config.model, facts, brief };
    const s = await load();
    s.latest = record;
    if (kind === "weekly") s.weeks = [...s.weeks.filter((w) => w.week !== record.week), record].slice(-KEEP_WEEKS);
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
    // the week's pulse note is written by brainWriter; without it the brief stands on its own
    await call("brain_add_relation", { from: id, type: "derived_from", to: weekNoteId(berlinDayOf(Date.parse(r.at))) }).catch(() => undefined);
  }

  return {
    state() {
      const s = store;
      const weekly = s?.weeks.at(-1) ?? null;
      return { state: lastError ? "error" : "on", busy, latest: s?.latest ?? null, weekly, reason: lastError };
    },
    async generate(world) {
      const s = await load();
      const last = s.latest;
      if (last && now() - Date.parse(last.at) < BRIEF_MIN_GAP_MS) return { ok: true, record: last, fresh: false };
      if (busy) {
        await running.catch(() => undefined);
        const again = store?.latest;
        if (again && now() - Date.parse(again.at) < BRIEF_MIN_GAP_MS) return { ok: true, record: again, fresh: false };
      }
      busy = true;
      const p = write(world, "now");
      running = p;
      try {
        const record = await p;
        lastError = null;
        return { ok: true, record, fresh: true };
      } catch (e) {
        lastError = e instanceof Error ? e.message : "error";
        return { ok: false, reason: lastError };
      } finally {
        busy = false;
      }
    },
    scheduleWeekly(world) {
      if (busy || now() - weeklyFailedAt < WEEKLY_RETRY_MS) return;
      const week = isoWeek(berlinDayOf(now()));
      busy = true;
      running = load()
        .then(async (s) => {
          const record = s.weeks.find((w) => w.week === week) ?? (await write(world, "weekly"));
          if (deps.brain && !(s.in_brain ?? []).includes(week)) {
            await toBrain(record);
            s.in_brain = [...(s.in_brain ?? []), week].slice(-KEEP_WEEKS);
            await writeStore(file, s).catch(() => undefined);
          }
          lastError = null;
        })
        .catch((e: unknown) => {
          weeklyFailedAt = now();
          lastError = e instanceof BrainCallError ? e.message : e instanceof Error ? e.message : "error";
        })
        .finally(() => {
          busy = false;
        });
    },
    idle: () => running.then(() => undefined, () => undefined),
  };
}
