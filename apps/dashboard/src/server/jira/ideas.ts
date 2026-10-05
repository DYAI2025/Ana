import "server-only";
import { normalizeSummary, REQUEST_ID_RE, validateIdeaSummary } from "@/features/work/model";
import type { IdeaRequest, WriteResult } from "@/features/work/types";
import type { JiraClient } from "./client";
import { CANONICAL_SOURCE, IDEA_ISSUE_TYPE, IDEA_LABELS, REQUEST_PROPERTY } from "./config";
import { failure, isAmbiguous, readFailure } from "./failures";
import type { RawIssue } from "./mapping";
import { readBoardContext, readIssue } from "./work";

/**
 * Duplicate protection for Add idea. The guarantees, scenario by scenario, are the matrix in ideas.test.ts and
 * docs/evidence/ANA-5/CHECKLIST.md.
 *
 * Every submission carries a client-generated request id. Jira gets that id as an issue property, and before any
 * create the server searches Jira for it and for a dashboard idea with the same text added within the last hour —
 * so a retry, a reload or a second tab finds the item instead of creating a second one. Jira's search is
 * eventually consistent, so the ledger below — a disposable, process-local memory of outcomes, no work state —
 * covers the seconds before an item shows up there:
 * - it answers repeats quickly;
 * - after a create that got no answer it never creates again implicitly: retries only check, and only an explicit
 *   request (`confirmRecreate`) after UNCONFIRMED_HOLD_MS may send it again;
 * - when Jira did return a key but the readback failed, it keeps that key and re-reads the issue directly
 *   (strongly consistent) instead of ever creating again;
 * - the same idea text under a new request id joins an earlier request that is unresolved, or answers with the item
 *   an earlier request created (read directly by its key).
 * The browser repeats what it knows (`knownUnconfirmed`), so a hold survives a server restart or the ledger's expiry.
 */
type LedgerEntry =
  | { status: "pending"; at: number; summary: string }
  | { status: "unconfirmed"; at: number; summary: string; key?: string }
  | { status: "settled"; at: number; summary: string; result: WriteResult };
export type IdeaLedger = Map<string, LedgerEntry>;

const SHARED_LEDGER: IdeaLedger = new Map();
const LEDGER_TTL_MS = 60 * 60_000;
/** After a create got no answer, do not create again for this long; search-and-reconcile settles first. */
export const UNCONFIRMED_HOLD_MS = 60_000;
const SEARCH_ATTEMPTS = 3;
/** A dashboard idea with exactly the same text added this recently counts as the same idea (reload, second tab, restart). */
export const SAME_TEXT_WINDOW_MS = 60 * 60_000;
const SEARCH_INTERVAL_MS = 1_000;

export interface IdeaOptions {
  ledger?: IdeaLedger;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

interface RawSearch {
  issues?: RawIssue[];
  isLast?: boolean;
  nextPageToken?: string | null;
}

export function validateIdeaRequest(body: unknown): IdeaRequest | null {
  if (typeof body !== "object" || body === null) return null;
  const { requestId, summary, confirmRecreate, knownUnconfirmed } = body as Record<string, unknown>;
  if (typeof requestId !== "string" || !REQUEST_ID_RE.test(requestId)) return null;
  if (typeof summary !== "string" || validateIdeaSummary(summary)) return null;
  if (confirmRecreate !== undefined && typeof confirmRecreate !== "boolean") return null;
  if (knownUnconfirmed !== undefined && typeof knownUnconfirmed !== "boolean") return null;
  return {
    requestId,
    summary: normalizeSummary(summary),
    ...(confirmRecreate ? { confirmRecreate: true } : {}),
    ...(knownUnconfirmed ? { knownUnconfirmed: true } : {}),
  };
}

function requestIdOf(raw: RawIssue): string | undefined {
  const value = raw.properties?.[REQUEST_PROPERTY];
  return value && typeof value === "object" && "requestId" in value ? String((value as { requestId: unknown }).requestId) : undefined;
}

/**
 * Looks in Jira — the only durable record — for this request's item, and for a dashboard idea with exactly the same
 * text added within the last hour. Jira's search is eventually consistent: a create of the last seconds may not be
 * visible yet, which the in-process ledger covers.
 */
async function findExisting(
  client: JiraClient,
  request: IdeaRequest,
  now: () => number,
): Promise<{ ok: true; byRequest: string | null; byText: string | null } | { ok: false; result: WriteResult }> {
  const { requestId } = request;
  let byText: string | null = null;
  let nextPageToken: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const response = await client.post<RawSearch>("/rest/api/3/search/jql", {
      jql: `project = ${CANONICAL_SOURCE.projectKey} AND labels = "${IDEA_LABELS[0]}" AND created >= -1d ORDER BY created DESC`,
      fields: ["summary", "created"],
      properties: [REQUEST_PROPERTY],
      maxResults: 100,
      ...(nextPageToken ? { nextPageToken } : {}),
    });
    if (!response.ok) return { ok: false, result: { ok: false, failure: { ...readFailure(response.error), requestId } } };
    // a 2xx answer without a body cannot prove that nothing exists
    if (!response.data) return { ok: false, result: { ok: false, failure: failure("upstream", { requestId, detail: "Jira returned an empty search result" }) } };
    const issues = response.data.issues ?? [];
    const byRequest = issues.find((raw) => requestIdOf(raw) === requestId)?.key;
    if (byRequest) return { ok: true, byRequest, byText: null };
    if (!byText) {
      const cutoff = now() - SAME_TEXT_WINDOW_MS;
      const twin = issues.find((raw) => {
        // only an item whose creation time Jira states, inside the window, counts as the same idea
        const created = Date.parse(String((raw.fields as { created?: string } | undefined)?.created ?? ""));
        return normalizeSummary(raw.fields?.summary ?? "") === request.summary && !Number.isNaN(created) && created >= cutoff;
      });
      byText = twin?.key ?? null;
    }
    if (response.data.isLast === true || !response.data.nextPageToken) return { ok: true, byRequest: null, byText };
    nextPageToken = response.data.nextPageToken;
  }
  return { ok: true, byRequest: null, byText };
}

/** Independent readback: the created issue must exist, carry this request and summary, and sit in the Backlog. */
async function verifyCreated(client: JiraClient, key: string, request: IdeaRequest, backlogStatusIds: ReadonlySet<string>, now: () => number): Promise<WriteResult> {
  const readback = await readIssue(client, key, [REQUEST_PROPERTY]);
  if (!readback.ok && readback.failure.code === "not-found") {
    // Jira named this issue for the request, but it is gone (deleted or moved away): settled, never re-created
    return { ok: false, failure: failure("readback-mismatch", { requestId: request.requestId, detail: `Jira named ${key} for this request, but it no longer exists` }) };
  }
  if (!readback.ok) {
    return { ok: false, failure: failure("write-unconfirmed", { requestId: request.requestId, recreatable: false, detail: `Jira answered with ${key}, but reading it back failed (${readback.failure.code})` }) };
  }
  const { issue, raw } = readback.value;
  const problems: string[] = [];
  if (raw.fields?.project?.key !== undefined && raw.fields.project.key !== CANONICAL_SOURCE.projectKey) problems.push(`project ${raw.fields.project.key}`);
  if (issue.summary !== request.summary) problems.push("summary differs");
  if (requestIdOf(raw) !== request.requestId) problems.push("request marker missing");
  if (!backlogStatusIds.has(issue.status.id)) problems.push(`status ${issue.status.name} is not Backlog`);
  if (problems.length > 0) {
    return { ok: false, failure: failure("readback-mismatch", { issue, requestId: request.requestId, detail: `${issue.key}: ${problems.join("; ")}` }) };
  }
  return { ok: true, issue, verifiedAt: new Date(now()).toISOString() };
}

function createBody(request: IdeaRequest, submittedAt: string) {
  return {
    fields: {
      project: { key: CANONICAL_SOURCE.projectKey },
      issuetype: { name: IDEA_ISSUE_TYPE },
      summary: request.summary,
      labels: [...IDEA_LABELS],
      description: {
        type: "doc",
        version: 1,
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: `Added from the ANA dashboard (Add idea) through its Jira integration account. Request ${request.requestId}.` }],
          },
        ],
      },
    },
    properties: [{ key: REQUEST_PROPERTY, value: { requestId: request.requestId, source: "ana-dashboard", action: "add-idea", submittedAt } }],
  };
}

interface Attempt {
  result: WriteResult;
  /** A create request was sent in this attempt and its outcome is not known (no answer, or no readable result). */
  unansweredCreate: boolean;
  /** Key Jira returned for this request although the readback failed. */
  key?: string;
}

async function createOnce(client: JiraClient, request: IdeaRequest, previous: LedgerEntry | undefined, options: Required<IdeaOptions>): Promise<Attempt> {
  const { requestId } = request;
  const done = (result: WriteResult, extra: Partial<Attempt> = {}): Attempt => ({ result, unansweredCreate: false, ...extra });
  const context = await readBoardContext(client);
  if (!context.ok) return done({ ok: false, failure: { ...context.failure, requestId } });
  const backlog = context.value.columns.find((column) => column.isBacklog);
  if (!backlog) return done({ ok: false, failure: failure("board-drift", { requestId, detail: `Board ${CANONICAL_SOURCE.boardId} has no Backlog column` }) });
  const backlogStatusIds = new Set(backlog.statuses.map((status) => status.id));

  // Jira already named the issue for this request: re-read it directly, never create again
  if (previous?.status === "unconfirmed" && previous.key) {
    const verified = await verifyCreated(client, previous.key, request, backlogStatusIds, options.now);
    if (!verified.ok && verified.failure.code === "write-unconfirmed") return done(verified, { key: previous.key });
    return done(verified.ok ? { ...verified, replayed: true } : verified);
  }

  // a create that already happened (earlier timeout, restarted server) is found and verified, never repeated
  const existing = await findExisting(client, request, options.now);
  if (!existing.ok) return done(existing.result);
  if (existing.byRequest) {
    const verified = await verifyCreated(client, existing.byRequest, request, backlogStatusIds, options.now);
    if (!verified.ok && verified.failure.code === "write-unconfirmed") return done(verified, { key: existing.byRequest });
    return done(verified.ok ? { ...verified, replayed: true, matchedBy: "request" } : verified);
  }
  if (existing.byText) {
    // the same idea is already in Jira (added from another tab, before a reload or before a restart): that is the item
    const twin = await readIssue(client, existing.byText);
    if (twin.ok) return done({ ok: true, issue: twin.value.issue, verifiedAt: new Date(options.now()).toISOString(), replayed: true, matchedBy: "same-text" });
    // reading it failed: that failure is the answer — nothing was sent, so nothing is held
    if (twin.failure.code !== "not-found") return done({ ok: false, failure: { ...twin.failure, requestId } });
    // gone from Jira meanwhile: it is not the same idea any more
  }
  // an unanswered earlier create is never sent again implicitly; after the hold only an explicit request may
  if (previous?.status === "unconfirmed") {
    const held = options.now() - previous.at < UNCONFIRMED_HOLD_MS;
    if (held || !request.confirmRecreate) {
      return done({
        ok: false,
        failure: failure("write-unconfirmed", {
          requestId,
          recreatable: !held,
          detail: held
            ? "An earlier attempt got no answer from Jira and is not visible in Jira's search yet"
            : "An earlier attempt got no answer from Jira and Jira's search still does not show it",
        }),
      });
    }
  }

  const created = await client.post<{ id?: string; key?: string }>("/rest/api/3/issue", createBody(request, new Date(options.now()).toISOString()));
  if (!created.ok) {
    if (!isAmbiguous(created.error)) return done({ ok: false, failure: { ...readFailure(created.error), requestId } });
    for (let attempt = 0; attempt < SEARCH_ATTEMPTS; attempt += 1) {
      await options.sleep(SEARCH_INTERVAL_MS);
      const found = await findExisting(client, request, options.now);
      if (found.ok && found.byRequest) {
        const verified = await verifyCreated(client, found.byRequest, request, backlogStatusIds, options.now);
        if (!verified.ok && verified.failure.code === "write-unconfirmed") return { result: verified, unansweredCreate: true, key: found.byRequest };
        return done(verified);
      }
    }
    return {
      result: { ok: false, failure: failure("write-unconfirmed", { requestId, recreatable: false, detail: "Jira gave no answer to the create request and the idea is not visible in Jira yet" }) },
      unansweredCreate: true,
    };
  }
  if (!created.data?.key) {
    return { result: { ok: false, failure: failure("write-unconfirmed", { requestId, recreatable: false, detail: "Jira accepted the request but returned no issue key" }) }, unansweredCreate: true };
  }
  const verified = await verifyCreated(client, created.data.key, request, backlogStatusIds, options.now);
  if (!verified.ok && verified.failure.code === "write-unconfirmed") return { result: verified, unansweredCreate: true, key: created.data.key };
  return done(verified);
}

/** The issue a settled request ended with, if any (created, or created but not exactly as asked). */
function settledKey(result: WriteResult): string | undefined {
  if (result.ok) return result.issue.key;
  return result.failure.code === "readback-mismatch" ? result.failure.issue?.key : undefined;
}

export async function createIdea(client: JiraClient, request: IdeaRequest, options: IdeaOptions = {}): Promise<WriteResult> {
  const resolved: Required<IdeaOptions> = {
    ledger: options.ledger ?? SHARED_LEDGER,
    now: options.now ?? Date.now,
    sleep: options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms))),
  };
  const { ledger } = resolved;
  const started = resolved.now();
  for (const [id, entry] of ledger) if (started - entry.at > LEDGER_TTL_MS) ledger.delete(id);

  let previous = ledger.get(request.requestId);
  if (previous?.status === "settled") return previous.result.ok ? { ...previous.result, replayed: true } : previous.result;
  if (previous?.status === "pending") return { ok: false, failure: failure("duplicate-in-flight", { requestId: request.requestId }) };
  if (!previous) {
    for (const [otherId, entry] of ledger) {
      if (entry.summary !== request.summary) continue;
      if (entry.status === "settled") {
        // an earlier request created this idea; Jira's search may not show it yet, so read it directly by its key
        const key = settledKey(entry.result);
        if (!key || started - entry.at > SAME_TEXT_WINDOW_MS) continue;
        const twin = await readIssue(client, key);
        if (!twin.ok && twin.failure.code === "not-found") continue; // gone from Jira: not the same item any more
        if (!twin.ok) return { ok: false, failure: { ...twin.failure, requestId: request.requestId } };
        const result: WriteResult = { ok: true, issue: twin.value.issue, verifiedAt: new Date(started).toISOString(), replayed: true, matchedBy: "same-text" };
        ledger.set(request.requestId, { status: "settled", at: started, summary: request.summary, result });
        return result;
      }
      // the same idea is still unresolved under an earlier request (page reloaded and retyped, second tab): join it
      return {
        ok: false,
        failure: failure(entry.status === "pending" ? "duplicate-in-flight" : "write-unconfirmed", {
          requestId: otherId,
          recreatable: false,
          detail: "The same idea is already waiting for Jira's confirmation under an earlier request",
        }),
      };
    }
    // the browser knows an attempt of this request went unanswered, but this server has no record of it (restart,
    // expiry): hold it as if it had just gone unanswered — checking again must never send it implicitly
    if (request.knownUnconfirmed) previous = { status: "unconfirmed", at: started, summary: request.summary };
  }

  ledger.set(request.requestId, { status: "pending", at: started, summary: request.summary });
  try {
    const { result, unansweredCreate, key } = await createOnce(client, request, previous, resolved);
    const issueExists = result.ok || result.failure.code === "readback-mismatch";
    const earlier = previous?.status === "unconfirmed" ? previous : undefined;
    if (issueExists) ledger.set(request.requestId, { status: "settled", at: resolved.now(), summary: request.summary, result });
    else if (result.failure.code === "write-unconfirmed") {
      // the hold restarts whenever a create went unanswered — counted from now, the end of that attempt
      ledger.set(request.requestId, { status: "unconfirmed", at: unansweredCreate ? resolved.now() : (earlier?.at ?? resolved.now()), summary: request.summary, key: key ?? earlier?.key });
    }
    // an earlier unanswered create may still appear in Jira: keep holding back until the hold expires
    else if (earlier) ledger.set(request.requestId, earlier);
    else ledger.delete(request.requestId);
    return result;
  } catch (error) {
    // something unexpected after the request started: a create may have been sent — hold it, never forget it
    ledger.set(request.requestId, { status: "unconfirmed", at: resolved.now(), summary: request.summary, key: previous?.status === "unconfirmed" ? previous.key : undefined });
    return {
      ok: false,
      failure: failure("write-unconfirmed", { requestId: request.requestId, recreatable: false, detail: `Unexpected error while creating: ${error instanceof Error ? error.message.slice(0, 200) : "unknown"}` }),
    };
  }
}
