import "server-only";
import { randomBytes } from "node:crypto";
import { promises as fs } from "node:fs";
import type { AnalystResponse, AnalystStatus, BrainBlock, HypothesisBlock } from "@/features/world/analystTypes";
import { QUESTION_MAX } from "@/features/world/analystTypes";
import { TAG_VERSION } from "@/features/world/postTags";
import { fetchProjection, readBrainConfig } from "@/server/brain/projection";
import { socialServiceFromEnv, type SnapshotService } from "@/server/social/service";
import { brainWriterConfigFromEnv } from "@/server/world/brainWriter";
import { readTags, tagsFile } from "@/server/world/tagger";
import { callProvider } from "./adapters";
import { createBrainReader, retrieveBrainContext, verifyBeforeOutput, type BrainContext, type BrainReader, type ReleasedItem } from "./brainContext";
import { analystConfigFromEnv, type AnalystOn } from "./config";
import { buildFacts, parseAnswer, renderPrompt } from "./facts";

/**
 * One question: refuse early, read the snapshot and the stored categories, take the released Brain context, one call to
 * the one selected provider, check what came back, read the Brain again, answer. Nothing is stored or logged, neither
 * question nor answer. The world read is not used: it would start the tagger, the look reader, the brief and the digest.
 *
 * One question at a time and a small daily cap protect the provider budget. Both are per server process: a restart
 * resets the count. The real budget stays with the provider account (PO decision before egress).
 */
export interface AnalystDeps {
  env: Readonly<Record<string, string | undefined>>;
  fetchImpl: typeof fetch;
  social: SnapshotService | null;
  now: () => number;
}

interface Guard {
  busy: boolean;
  day: string;
  calls: number;
}

const guard: Guard = { busy: false, day: "", calls: 0 };

/** test hook */
export function resetAnalystGuard() {
  guard.busy = false;
  guard.day = "";
  guard.calls = 0;
}

export type AnalystStateForUi = "on" | "off" | "misconfigured";

export function analystState(env: Readonly<Record<string, string | undefined>> = process.env): AnalystStateForUi {
  return analystConfigFromEnv(env).state;
}

/** Absent and unreadable differ (readTags answers {} for both): an unreadable store is not "no categories yet". */
async function categoriesState(file: string): Promise<"present" | "none" | "unreadable"> {
  let raw: string;
  try {
    raw = await fs.readFile(file, "utf8");
  } catch (e) {
    return (e as NodeJS.ErrnoException).code === "ENOENT" ? "none" : "unreadable";
  }
  try {
    const parsed = JSON.parse(raw) as { version?: unknown; tags?: unknown };
    return parsed && parsed.version === TAG_VERSION && typeof parsed.tags === "object" && parsed.tags !== null ? "present" : "unreadable";
  } catch {
    return "unreadable";
  }
}

function brainDeps(config: AnalystOn, deps: AnalystDeps): { reader: BrainReader | null; retrieve: (question: string) => Promise<BrainContext> } {
  const mcp = brainWriterConfigFromEnv(deps.env);
  const reader = mcp ? createBrainReader(mcp, deps.fetchImpl) : null;
  return {
    reader,
    retrieve: (question) =>
      retrieveBrainContext(question, {
        reader,
        sources: config.brainSources,
        projection: () => fetchProjection(readBrainConfig(deps.env), deps.fetchImpl),
        ref: () => `b_${randomBytes(4).toString("hex")}`,
      }),
  };
}

const PROVIDER_REASON = { timeout: "provider_timeout", rate_limited: "provider_rate_limited", refused: "provider_refused", truncated: "provider_failed", invalid: "provider_failed", failed: "provider_failed" } as const;

export function cleanQuestion(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const question = raw.trim();
  return question.length > 0 && question.length <= QUESTION_MAX ? question : null;
}

function toBrainBlock(item: ReleasedItem): BrainBlock {
  return { note_id: item.note_id, source_ids: item.source_ids, status: item.status, origin: item.origin, at: item.at, uncertainty: "derived_unconfirmed", index_state: "not_proven", text: item.text };
}

export async function askAnalyst(rawQuestion: unknown, deps: AnalystDeps): Promise<AnalystResponse> {
  const config = analystConfigFromEnv(deps.env);
  if (config.state === "off") return { ok: false, reason: "off" };
  if (config.state === "misconfigured") return { ok: false, reason: "misconfigured" };
  const question = cleanQuestion(rawQuestion);
  if (!question) return { ok: false, reason: "invalid_question" };
  const day = new Date(deps.now()).toISOString().slice(0, 10);
  if (guard.day !== day) {
    guard.day = day;
    guard.calls = 0;
  }
  if (guard.busy) return { ok: false, reason: "busy" };
  if (guard.calls >= config.dailyCap) return { ok: false, reason: "daily_cap" };
  guard.busy = true;
  try {
    const social = deps.social ? await deps.social.read() : null;
    if (!social?.ok) return { ok: false, reason: "instagram_unavailable" };
    const file = tagsFile(deps.env);
    const stored = await categoriesState(file);
    const tags = stored === "present" ? await readTags(file) : {};
    const catalog = buildFacts(social.snapshot, tags);

    const brain = brainDeps(config, deps);
    const context = await brain.retrieve(question);
    const byRef = new Map(context.items.map((i) => [i.ref, i]));

    guard.calls++;
    const answer = await callProvider(config, renderPrompt(question, catalog, context.items), deps.fetchImpl);
    if (!answer.ok) return { ok: false, reason: PROVIDER_REASON[answer.reason] };

    const parsed = parseAnswer(answer.text, catalog, byRef);
    if (!parsed.ok) return { ok: false, reason: parsed.reason };

    // Every released note went to the provider, so every one is shown with its provenance, whether the model named it or
    // not. Each is read again now: one that changed or was retired in between is no hit.
    const checked = brain.reader && context.items.length ? await verifyBeforeOutput(brain.reader, context.items, config.brainSources) : { items: [] as ReleasedItem[], dropped: 0, failure: null };
    const stillThere = new Set(checked.items.map((i) => i.note_id));
    const hypotheses: HypothesisBlock[] = parsed.hypotheses.filter((h) => h.refs.every((r) => r.type !== "brain" || stillThere.has(r.note_id)));
    const rejected = parsed.rejected + (parsed.hypotheses.length - hypotheses.length);
    // the post reference may have hung on a hypothesis that just went
    if (parsed.measured.length === 0 && parsed.categories.length === 0 && !hypotheses.some((h) => h.refs.some((r) => r.type === "post"))) return { ok: false, reason: "no_evidence" };

    const status: AnalystStatus = {
      fetched_at: catalog.fetched_at,
      stale: social.stale,
      categories: stored === "unreadable" ? "unreadable" : Object.keys(tags).length > 0 ? "ok" : "none",
      window: catalog.window,
      // from the last read, not the first: "found" next to nothing shown would be false
      brain: {
        state: checked.failure ? "unknown" : checked.items.length > 0 ? "ok" : context.state === "ok" ? "none" : context.state,
        reason: checked.failure ?? context.reason,
        withheld: context.withheld + checked.dropped,
      },
    };
    return { ok: true, answer: { measured: parsed.measured, categories: parsed.categories, groups: parsed.groups, brain: checked.items.map(toBrainBlock), hypotheses, rejected }, status };
  } finally {
    guard.busy = false;
  }
}

export function analystDepsFromEnv(): AnalystDeps {
  return { env: process.env, fetchImpl: fetch, social: socialServiceFromEnv(), now: Date.now };
}
