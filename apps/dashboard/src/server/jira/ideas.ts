import "server-only";
import { normalizeSummary, REQUEST_ID_RE, validateIdeaSummary } from "@/features/work/model";
import type { IdeaRequest, WriteResult } from "@/features/work/types";
import type { JiraClient } from "./client";
import { CANONICAL_SOURCE, IDEA_ISSUE_TYPE, IDEA_LABELS, REQUEST_PROPERTY } from "./config";
import { failure, isAmbiguous, readFailure } from "./failures";
import type { RawIssue } from "./mapping";
import { readBoardContext, readIssue } from "./work";

/**
 * Duplicate protection for Add idea.
 *
 * Every submission carries a client-generated request id. Jira gets that id as an issue property, and before any
 * create the server searches recent dashboard ideas for it — so a retry after a timeout finds the issue Jira did
 * create instead of creating a second one. The ledger below is only a disposable, process-local memory of
 * outcomes (no work state): it answers repeats quickly and holds back a second create while Jira's search index
 * may still lag behind an unanswered first attempt.
 */
type LedgerEntry = { status: "pending"; at: number } | { status: "unconfirmed"; at: number } | { status: "settled"; at: number; result: WriteResult };
export type IdeaLedger = Map<string, LedgerEntry>;

const SHARED_LEDGER: IdeaLedger = new Map();
const LEDGER_TTL_MS = 60 * 60_000;
/** After a create got no answer, do not create again for this long; search-and-reconcile settles first. */
export const UNCONFIRMED_HOLD_MS = 60_000;
const SEARCH_ATTEMPTS = 3;
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
  const { requestId, summary } = body as Record<string, unknown>;
  if (typeof requestId !== "string" || !REQUEST_ID_RE.test(requestId)) return null;
  if (typeof summary !== "string" || validateIdeaSummary(summary)) return null;
  return { requestId, summary: normalizeSummary(summary) };
}

function requestIdOf(raw: RawIssue): string | undefined {
  const value = raw.properties?.[REQUEST_PROPERTY];
  return value && typeof value === "object" && "requestId" in value ? String((value as { requestId: unknown }).requestId) : undefined;
}

/** Finds a dashboard idea created for this request id in the last day (search + property match). */
async function findByRequestId(client: JiraClient, requestId: string): Promise<{ ok: true; key: string | null } | { ok: false; result: WriteResult }> {
  let nextPageToken: string | undefined;
  for (let page = 0; page < 20; page += 1) {
    const response = await client.post<RawSearch>("/rest/api/3/search/jql", {
      jql: `project = ${CANONICAL_SOURCE.projectKey} AND labels = "${IDEA_LABELS[0]}" AND created >= -1d ORDER BY created DESC`,
      fields: ["summary"],
      properties: [REQUEST_PROPERTY],
      maxResults: 100,
      ...(nextPageToken ? { nextPageToken } : {}),
    });
    if (!response.ok) return { ok: false, result: { ok: false, failure: { ...readFailure(response.error), requestId } } };
    const match = (response.data.issues ?? []).find((raw) => requestIdOf(raw) === requestId);
    if (match?.key) return { ok: true, key: match.key };
    if (response.data.isLast === true || !response.data.nextPageToken) return { ok: true, key: null };
    nextPageToken = response.data.nextPageToken;
  }
  return { ok: true, key: null };
}

/** Independent readback: the created issue must exist, carry this request and summary, and sit in the Backlog. */
async function verifyCreated(client: JiraClient, key: string, request: IdeaRequest, backlogStatusIds: ReadonlySet<string>, now: () => number): Promise<WriteResult> {
  const readback = await readIssue(client, key, [REQUEST_PROPERTY]);
  if (!readback.ok) {
    return { ok: false, failure: failure("write-unconfirmed", { requestId: request.requestId, detail: `Jira answered with ${key}, but reading it back failed (${readback.failure.code})` }) };
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

async function createOnce(client: JiraClient, request: IdeaRequest, previous: LedgerEntry | undefined, options: Required<IdeaOptions>): Promise<WriteResult> {
  const { requestId } = request;
  const context = await readBoardContext(client);
  if (!context.ok) return { ok: false, failure: { ...context.failure, requestId } };
  const backlog = context.value.columns.find((column) => column.isBacklog);
  if (!backlog) return { ok: false, failure: failure("board-drift", { requestId, detail: `Board ${CANONICAL_SOURCE.boardId} has no Backlog column` }) };
  const backlogStatusIds = new Set(backlog.statuses.map((status) => status.id));

  // a create that already happened (earlier timeout, restarted server) is found and verified, never repeated
  const existing = await findByRequestId(client, requestId);
  if (!existing.ok) return existing.result;
  if (existing.key) {
    const verified = await verifyCreated(client, existing.key, request, backlogStatusIds, options.now);
    return verified.ok ? { ...verified, replayed: true } : verified;
  }
  if (previous?.status === "unconfirmed" && options.now() - previous.at < UNCONFIRMED_HOLD_MS) {
    return {
      ok: false,
      failure: failure("write-unconfirmed", { requestId, detail: "An earlier attempt got no answer from Jira and is not visible in Jira's search yet; not creating again before that settles" }),
    };
  }

  const created = await client.post<{ id?: string; key?: string }>("/rest/api/3/issue", createBody(request, new Date(options.now()).toISOString()));
  if (!created.ok) {
    if (!isAmbiguous(created.error)) return { ok: false, failure: { ...readFailure(created.error), requestId } };
    for (let attempt = 0; attempt < SEARCH_ATTEMPTS; attempt += 1) {
      await options.sleep(SEARCH_INTERVAL_MS);
      const found = await findByRequestId(client, requestId);
      if (found.ok && found.key) return verifyCreated(client, found.key, request, backlogStatusIds, options.now);
    }
    return { ok: false, failure: failure("write-unconfirmed", { requestId, detail: "Jira gave no answer to the create request and the idea is not visible in Jira yet" }) };
  }
  if (!created.data?.key) return { ok: false, failure: failure("write-unconfirmed", { requestId, detail: "Jira accepted the request but returned no issue key" }) };
  return verifyCreated(client, created.data.key, request, backlogStatusIds, options.now);
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

  const previous = ledger.get(request.requestId);
  if (previous?.status === "settled") return previous.result.ok ? { ...previous.result, replayed: true } : previous.result;
  if (previous?.status === "pending") return { ok: false, failure: failure("duplicate-in-flight", { requestId: request.requestId }) };

  ledger.set(request.requestId, { status: "pending", at: started });
  try {
    const result = await createOnce(client, request, previous, resolved);
    const issueExists = result.ok || result.failure.code === "readback-mismatch";
    if (issueExists) ledger.set(request.requestId, { status: "settled", at: started, result });
    else if (result.failure.code === "write-unconfirmed") ledger.set(request.requestId, { status: "unconfirmed", at: previous?.status === "unconfirmed" ? previous.at : started });
    // an earlier unanswered create may still appear in Jira: keep holding back until the hold expires
    else if (previous?.status === "unconfirmed") ledger.set(request.requestId, previous);
    else ledger.delete(request.requestId);
    return result;
  } catch (error) {
    if (previous?.status === "unconfirmed") ledger.set(request.requestId, previous);
    else ledger.delete(request.requestId);
    throw error;
  }
}

