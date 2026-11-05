import "server-only";
import type { SocialResult } from "@/features/social/types";
import type { WorldInsightSync } from "@/features/world/types";
import type { PostTags } from "@/features/world/postTags";
import { BrainToolError, type BrainMcp } from "./mcpClient";
import { berlinDay, DERIVATION_VERSION, deriveInsights, insightNote, measurementText, SOURCE_ID, TOPIC_ID } from "./instagramInsight";

/**
 * The Instagram insights of one day: a step of the daily Brain writer (server/world/brainWriter.ts), which decides when it
 * runs and when it retries. The Brain itself is the state: before an append the note is asked whether the day is there, so
 * a retry, a lost answer or a restart cannot add a block twice.
 */

/** the groups with the most posts are written; `dropped` says how many others were not */
const MAX_NOTES = 12;

export interface InsightStep {
  status(): WorldInsightSync;
  /** writes what today still lacks; rejects when the Brain failed, so the caller can back off */
  run(instagram: SocialResult, tags: Readonly<Record<string, PostTags>>, nowMs: number): Promise<void>;
}

const BLOCK = /\bIG-INSIGHT tag=(\d{4}-\d{2}-\d{2}) v=(\d+) .*\^(obs-[a-z0-9-]+)\s*$/;

/** the newest block of that day, if any */
export function blockOfDay(body: string, day: string): { version: number; block: string } | null {
  let found: { version: number; block: string } | null = null;
  for (const line of body.split("\n")) {
    const m = BLOCK.exec(line);
    if (m && m[1] === day) found = { version: Number(m[2]), block: m[3] as string };
  }
  return found;
}

export function createInsightStep(mcp: BrainMcp, options: { derivationVersion?: number } = {}): InsightStep {
  const version = options.derivationVersion ?? DERIVATION_VERSION;
  let ensured = false;
  let sync: WorldInsightSync = { state: "on", last_day: null, notes: 0, dropped: 0, reason: null };

  const tolerateExists = (e: unknown) => {
    if (!(e instanceof BrainToolError && e.kind === "exists")) throw e;
  };

  async function ensure() {
    if (ensured) return;
    await mcp
      .call("brain_register_source", {
        id: SOURCE_ID,
        title: "Instagram Insights (Meta, gelesen über den ANA-Worker)",
        description: "Kennzahlen der Posts des Kontos, autorisiert gelesen über den ANA-Instagram-Worker und im Dashboard normalisiert. Die Notizen nennen je Wert instagram:media/<id>, Zeitraum und Einheit. Keine Captions.",
        source: { kind: "url", locator: "https://ana.dyai.cloud/pulse/social/instagram", original_title: "Instagram Graph API Insights", access: "internal", data_class: "G1" },
        provenance_note: "dashboard insight writer",
      })
      .catch(tolerateExists);
    await mcp
      .call("brain_create_note", {
        id: TOPIC_ID,
        title: "Instagram-Resonanz je Thema und Format",
        type: "topic",
        status: "CANDIDATE",
        body: "Wofür: nachvollziehbar sehen, welche Themen im selben Format mehr gespeichert und geteilt werden. Grenzen: beschreibt Posts, nicht Menschen; kein Beleg für Bedürfnis, Kauf oder Umsatz.",
        source_refs: [{ source: SOURCE_ID, locator: "instagram:media-insights" }],
      })
      .catch(tolerateExists);
    ensured = true;
  }

  async function write(instagram: Extract<SocialResult, { ok: true }>, tags: Readonly<Record<string, PostTags>>, nowMs: number) {
    const day = berlinDay(nowMs);
    const { insights, unreadFormats } = deriveInsights(instagram.snapshot, tags, nowMs);
    if (insights.length === 0) {
      sync = { ...sync, state: "skipped", reason: unreadFormats.length > 0 ? "tags-incomplete" : "no-eligible-group" };
      return;
    }
    await ensure();
    const chosen = insights.slice(0, MAX_NOTES);
    // a note the Brain refuses does not stop the others; the day stays open and the retry finds what is already there
    let refused: BrainToolError | null = null;
    for (const insight of chosen) {
      try {
        const note = insightNote(insight);
        // the Brain's own word for a claim without a comparison is CANDIDATE; the block itself says status=UNKNOWN
        const status = insight.status === "DERIVED" ? "DERIVED" : "CANDIDATE";
        await mcp.call("brain_create_note", { ...note, type: "observation", status, topics: [TOPIC_ID] }).catch(tolerateExists);
        const current = JSON.parse(await mcp.call("brain_get", { id: insight.id })) as { body?: string };
        const earlier = blockOfDay(current.body ?? "", day);
        if (earlier && earlier.version >= version) continue;
        await mcp.call("brain_append_observation", { id: insight.id, text: measurementText(insight, version), status, ...(earlier ? { corrects: earlier.block } : {}) });
      } catch (e) {
        if (!(e instanceof BrainToolError) || e.kind === "unreachable") throw e;
        refused = e;
        console.error(`brain insight writer: ${insight.id}: ${e.message}`);
      }
    }
    if (refused) throw refused;
    sync = { state: "on", last_day: day, notes: chosen.length, dropped: insights.length - chosen.length, reason: null };
  }

  return {
    status: () => sync,
    async run(instagram, tags, nowMs) {
      if (!instagram.ok || sync.last_day === berlinDay(nowMs)) return;
      if (instagram.stale) {
        sync = { ...sync, state: "skipped", reason: "stale-snapshot" };
        return;
      }
      try {
        await write(instagram, tags, nowMs);
      } catch (e) {
        // the status reaches the browser: the failing step only, never the Brain's text or a key; the journal has the detail
        sync = { ...sync, state: "error", reason: e instanceof BrainToolError ? e.summary : "unexpected" };
        console.error(`brain insight writer: ${e instanceof BrainToolError ? e.message : "unexpected error"}`);
        throw e;
      }
    },
  };
}
