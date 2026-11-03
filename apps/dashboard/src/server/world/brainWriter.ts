import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { digestHasSignal, digestText, pulseDigest } from "@/features/world/pulse";
import type { WorldBrainSync, WorldPayload } from "@/features/world/types";
import { historyFile } from "./audienceHistory";

/**
 * Writes "Was läuft" into the ANA Brain once per Berlin day, as agent:lumen (a Brain agent key: CANDIDATE/DERIVED only,
 * never CONFIRMED, never superseding anything). One observation note per ISO week collects the daily digests; the two
 * topic notes say what the numbers are for: Substack (what people keep and pass on) and brand partnerships (reach,
 * countries, age and gender, brand posts). Only aggregated numbers and category values go to the Brain, never captions
 * or people. Background work: /api/world never waits for it, and a Brain outage never breaks the world.
 *
 * ANA_BRAIN_MCP_URL must be a loopback URL (the Brain listens on 127.0.0.1); ANA_BRAIN_WRITE_KEY is the agent key.
 */

export interface BrainWriterConfig {
  url: string;
  key: string;
}

export function brainWriterConfigFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): BrainWriterConfig | null {
  const url = env.ANA_BRAIN_MCP_URL?.trim();
  const key = env.ANA_BRAIN_WRITE_KEY?.trim();
  if (!url || !key || key.length < 16) return null;
  try {
    const u = new URL(url);
    // the key never leaves the host
    if (u.protocol !== "http:" || !["127.0.0.1", "localhost", "[::1]"].includes(u.hostname)) return null;
  } catch {
    return null;
  }
  return { url, key };
}

export const SOURCE_ID = "src-ana-world-pulse";
export const TOPICS = { substack: "top-substack-signals", brands: "top-brand-partnerships" } as const;
const RETRY_MS = 30 * 60_000;
const TIMEOUT_MS = 10_000;

/** ISO 8601 week of a calendar day (YYYY-MM-DD), e.g. 2026-w45 */
export function isoWeek(day: string): string {
  const d = new Date(`${day}T00:00:00Z`);
  const wd = (d.getUTCDay() + 6) % 7;
  d.setUTCDate(d.getUTCDate() - wd + 3);
  // d is now the Thursday of that week; its year is the ISO year
  const year = d.getUTCFullYear();
  const week = 1 + Math.floor((d.getTime() - Date.UTC(year, 0, 1)) / (7 * 86_400_000));
  return `${year}-w${String(week).padStart(2, "0")}`;
}
export const weekNoteId = (day: string) => `kn-world-pulse-${isoWeek(day)}`;

interface StateFile {
  version: 1;
  ensured: boolean;
  last_day: string | null;
  note: string | null;
}

export function brainSyncFile(env: Readonly<Record<string, string | undefined>> = process.env): string {
  return path.join(path.dirname(historyFile(env)), "world-brain-sync.json");
}

/** e2e only (/api/world?__reset): forget which day was written */
export async function resetBrainSync(): Promise<void> {
  await fs.rm(brainSyncFile(), { force: true });
}

async function readState(file: string): Promise<StateFile> {
  try {
    const raw = JSON.parse(await fs.readFile(file, "utf8")) as Partial<StateFile>;
    if (raw && raw.version === 1) return { version: 1, ensured: raw.ensured === true, last_day: typeof raw.last_day === "string" ? raw.last_day : null, note: typeof raw.note === "string" ? raw.note : null };
  } catch {
    // a missing or broken file starts over (creating notes again is harmless: "exists" counts as done)
  }
  return { version: 1, ensured: false, last_day: null, note: null };
}

async function writeState(file: string, s: StateFile): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(s), { mode: 0o600 });
  await fs.rename(tmp, file);
}

class BrainCallError extends Error {}

export interface BrainWriter {
  status(): WorldBrainSync;
  /** writes today's digest in the background, once per Berlin day; never throws, never waits */
  schedule(world: WorldPayload, nowMs: number): void;
  /** test hook */
  idle(): Promise<void>;
}

const TOPIC_BODY = {
  substack: `Wofür: Signale, ob und womit ein Substack (lange Texte, Newsletter) bei Anas Community tragen könnte.
Gemessen wird, was Menschen behalten und weitergeben (Save+Share-Rate = (Saves + Shares) ÷ Reichweite), je Thema, Format und Aufmacher, und aus welchen Ländern und Altersgruppen das Engagement kommt.
Grenzen: Instagram-Verhalten ist kein Beweis für Lese- oder Zahlungsbereitschaft; das prüft erst ein Substack-Test. Hypothesen dazu bleiben CANDIDATE, bis Ana, Ben oder Vince sie bestätigen.`,
  brands: `Wofür: Grundlage für Marken-Kooperationen. Marken kaufen Reichweite, Community und Zielgruppe: welche Länder, welches Alter und Geschlecht, welche Themen Resonanz haben, und wie Posts mit sichtbarer Marke im Vergleich zu den übrigen laufen.
Grenzen: Metas Zielgruppen-Daten sind kontoweit, verzögert (bis 48 h) und erst ab 100 Interaktionen; kein Wert sagt, welche Person auf welchen Post reagiert hat.`,
};

export function createBrainWriter(config: BrainWriterConfig, file: string = brainSyncFile(), fetchImpl: typeof fetch = fetch, nowFn: () => number = Date.now): BrainWriter {
  let state: StateFile | null = null;
  let running: Promise<void> = Promise.resolve();
  let busy = false;
  let failedAt = -Infinity;
  let lastError: string | null = null;
  let rpcId = 0;

  async function call(name: string, args: Record<string, unknown>, okIfExists = false): Promise<void> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await fetchImpl(config.url, {
        method: "POST",
        headers: { authorization: `Bearer ${config.key}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
        body: JSON.stringify({ jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } }),
        signal: ctrl.signal,
      });
      if (!r.ok) throw new BrainCallError(`${name}: HTTP ${r.status}`);
      const body = (await r.json()) as { result?: { isError?: boolean; content?: Array<{ text?: string }> }; error?: { message?: string } };
      if (body.error) throw new BrainCallError(`${name}: ${body.error.message ?? "rpc error"}`.slice(0, 200));
      if (body.result?.isError) {
        const text = body.result.content?.[0]?.text ?? "";
        if (okIfExists && text.startsWith("exists:")) return;
        throw new BrainCallError(`${name}: ${text}`.slice(0, 200));
      }
    } finally {
      clearTimeout(timer);
    }
  }

  async function ensure(s: StateFile) {
    if (s.ensured) return;
    await call("brain_register_source", {
      id: SOURCE_ID,
      title: "ANA World: Puls der Community (Dashboard)",
      description: "Tägliche aggregierte Messwerte aus dem ANA-Dashboard (/world): Engagement nach Land, Alter, Geschlecht (Meta, kontoweit), Post-Kennzahlen und Post-Kategorien (von Claude Haiku gelesen, mit Anas Zustimmung). Keine Captions, keine Personen.",
      source: { kind: "url", locator: "https://ana.dyai.cloud/world", original_title: "ANA World", access: "internal", data_class: "G1" },
      provenance_note: "dashboard brain writer (agent:lumen)",
    }, true);
    const ref = [{ source: SOURCE_ID, locator: "Was läuft (Dashboard)" }];
    await call("brain_create_note", { id: TOPICS.substack, title: "Substack-Signale", type: "topic", status: "DERIVED", body: TOPIC_BODY.substack, source_refs: ref }, true);
    await call("brain_create_note", { id: TOPICS.brands, title: "Marken-Kooperationen: Reichweite, Community, Zielgruppe", type: "topic", status: "DERIVED", body: TOPIC_BODY.brands, source_refs: ref }, true);
    s.ensured = true;
  }

  async function write(world: WorldPayload, nowMs: number) {
    state ??= await readState(file);
    const digest = pulseDigest(world, nowMs);
    if (state.last_day === digest.day || !digestHasSignal(digest)) return;
    await ensure(state);
    const note = weekNoteId(digest.day);
    if (state.note !== note) {
      await call("brain_create_note", {
        id: note,
        title: `Was läuft: Woche ${isoWeek(digest.day)}`,
        type: "observation",
        status: "DERIVED",
        body: `Tägliche Messwerte aus dem Dashboard („Was läuft“), eine Beobachtung pro Tag. Gemessen, nicht gedeutet: Deutungen und Hypothesen gehören als CANDIDATE in eigene Notizen mit Belegen und Gegenbelegen.\nKontext: [[${TOPICS.substack}]], [[${TOPICS.brands}]].`,
        topics: [TOPICS.substack, TOPICS.brands],
        source_refs: [{ source: SOURCE_ID, locator: `/world, Woche ${isoWeek(digest.day)}` }],
      }, true);
      state.note = note;
    }
    await call("brain_append_observation", { id: note, text: digestText(digest), status: "DERIVED" });
    state.last_day = digest.day;
    await writeState(file, state).catch(() => undefined);
  }

  return {
    status: () => ({ state: lastError ? "error" : "on", last_day: state?.last_day ?? null, note: state?.note ?? null, reason: lastError }),
    schedule(world, nowMs) {
      if (busy || nowFn() - failedAt < RETRY_MS) return;
      busy = true;
      running = write(world, nowMs)
        .then(() => {
          lastError = null;
        })
        .catch((e: unknown) => {
          failedAt = nowFn();
          // never the key: messages come from our own call() or the network layer
          lastError = e instanceof BrainCallError ? e.message : "unreachable";
        })
        .finally(() => {
          busy = false;
        });
    },
    idle: () => running,
  };
}
