import "server-only";
import type { MoveRequest, SnapshotResult, WorkColumn, WorkFailure, WorkIssue, WorkSource, WriteResult } from "@/features/work/types";
import { columnForStatus } from "@/features/work/model";
import type { JiraCallError, JiraClient } from "./client";
import { CANONICAL_SOURCE } from "./config";
import { failure, isAmbiguous, readFailure } from "./failures";
import { boardJql, ISSUE_FIELDS, mapColumns, mapIssue, statusIndex, type RawBoardConfig, type RawIssue, type RawProjectStatuses, type RawTransition } from "./mapping";

/** Hard cap on one board read; above it the snapshot says `truncated` instead of silently dropping work. */
export const MAX_ISSUES = 500;
const PAGE_SIZE = 100;

export const ISSUE_KEY_RE = new RegExp(`^${CANONICAL_SOURCE.projectKey}-\\d{1,7}$`);
const STATUS_ID_RE = /^\d{1,12}$/;

export interface BoardContext {
  board: RawBoardConfig;
  columns: WorkColumn[];
  source: WorkSource;
}

type Outcome<T> = { ok: true; value: T } | { ok: false; failure: WorkFailure };

/** Reads Board 734's configuration and verifies it still is the pinned source (filter 10733, project ANA). */
export async function readBoardContext(client: JiraClient): Promise<Outcome<BoardContext>> {
  const [board, statuses] = await Promise.all([
    client.get<RawBoardConfig>(`/rest/agile/1.0/board/${CANONICAL_SOURCE.boardId}/configuration`),
    client.get<RawProjectStatuses>(`/rest/api/3/project/${CANONICAL_SOURCE.projectKey}/statuses`),
  ]);
  // a 404 here means the board or project is gone or hidden from the integration account — not a missing issue
  const sourceFailure = (error: JiraCallError) =>
    error.kind === "http" && error.status === 404 ? failure("source-missing", { detail: error.detail }) : readFailure(error);
  if (!board.ok) return { ok: false, failure: sourceFailure(board.error) };
  if (!statuses.ok) return { ok: false, failure: sourceFailure(statuses.error) };
  const filterId = String(board.data.filter?.id ?? "");
  const projectKey = board.data.location?.key ?? board.data.location?.projectKey;
  if (filterId !== CANONICAL_SOURCE.filterId || (projectKey !== undefined && projectKey !== CANONICAL_SOURCE.projectKey)) {
    return {
      ok: false,
      failure: failure("board-drift", {
        detail: `Board ${CANONICAL_SOURCE.boardId} uses filter ${filterId || "none"} in project ${projectKey ?? "unknown"}; expected filter ${CANONICAL_SOURCE.filterId} in ${CANONICAL_SOURCE.projectKey}`,
      }),
    };
  }
  const columns = mapColumns(board.data, statusIndex(statuses.data));
  if (columns.length === 0) {
    return { ok: false, failure: failure("board-drift", { detail: `Board ${CANONICAL_SOURCE.boardId} has no column with a mapped status` }) };
  }
  return {
    ok: true,
    value: {
      board: board.data,
      columns,
      source: {
        boardId: CANONICAL_SOURCE.boardId,
        boardName: board.data.name ?? "",
        filterId,
        projectKey: CANONICAL_SOURCE.projectKey,
        site: new URL(client.siteOrigin).host,
      },
    },
  };
}

interface RawSearch {
  issues?: RawIssue[];
  isLast?: boolean;
  nextPageToken?: string | null;
}

export async function readSnapshot(client: JiraClient, options: { reconcileIssueIds?: readonly string[]; now?: () => Date } = {}): Promise<SnapshotResult> {
  const context = await readBoardContext(client);
  if (!context.ok) return context;
  const { board, columns, source } = context.value;
  const jql = boardJql(source.filterId, board.subQuery?.query);
  const reconcile = (options.reconcileIssueIds ?? []).slice(0, 50).map(Number);
  const seen = new Set<string>();
  const all: WorkIssue[] = [];
  let truncated = false;
  let nextPageToken: string | undefined;
  for (;;) {
    const page = await client.post<RawSearch>("/rest/api/3/search/jql", {
      jql,
      fields: ISSUE_FIELDS,
      maxResults: PAGE_SIZE,
      ...(nextPageToken ? { nextPageToken } : {}),
      ...(reconcile.length > 0 ? { reconcileIssues: reconcile } : {}),
    });
    if (!page.ok) return { ok: false, failure: readFailure(page.error) };
    for (const raw of page.data.issues ?? []) {
      const issue = mapIssue(raw, client.siteOrigin);
      if (issue.key && !seen.has(issue.key)) {
        seen.add(issue.key);
        all.push(issue);
      }
    }
    if (page.data.isLast === true || !page.data.nextPageToken) break;
    if (all.length >= MAX_ISSUES) {
      truncated = true;
      break;
    }
    nextPageToken = page.data.nextPageToken;
  }
  const issues = all.filter((issue) => columnForStatus(columns, issue.status.id));
  const unmapped = all.filter((issue) => !columnForStatus(columns, issue.status.id));
  return { ok: true, snapshot: { source, fetchedAt: (options.now?.() ?? new Date()).toISOString(), columns, issues, unmapped, truncated } };
}

/** Strongly consistent single-issue read (GET issue), used for every write readback. */
export async function readIssue(client: JiraClient, key: string, properties: readonly string[] = []): Promise<Outcome<{ issue: WorkIssue; raw: RawIssue }>> {
  const query = `fields=${ISSUE_FIELDS.join(",")}${properties.length > 0 ? `&properties=${properties.map(encodeURIComponent).join(",")}` : ""}`;
  const response = await client.get<RawIssue>(`/rest/api/3/issue/${encodeURIComponent(key)}?${query}`);
  if (!response.ok) return { ok: false, failure: readFailure(response.error) };
  return { ok: true, value: { issue: mapIssue(response.data, client.siteOrigin), raw: response.data } };
}

export function validateMove(key: string, request: unknown): MoveRequest | null {
  if (!ISSUE_KEY_RE.test(key) || typeof request !== "object" || request === null) return null;
  const { fromStatusId, toStatusIds } = request as Record<string, unknown>;
  if (typeof fromStatusId !== "string" || !STATUS_ID_RE.test(fromStatusId)) return null;
  if (!Array.isArray(toStatusIds) || toStatusIds.length === 0 || toStatusIds.length > 10) return null;
  if (!toStatusIds.every((id) => typeof id === "string" && STATUS_ID_RE.test(id))) return null;
  return { fromStatusId, toStatusIds: toStatusIds as string[] };
}

/**
 * Moves one issue with a Jira workflow transition and reports success only after a Jira readback shows the
 * requested status. Transition ids are discovered from Jira for this issue, never assumed.
 */
export async function moveIssue(client: JiraClient, key: string, request: MoveRequest, now: () => Date = () => new Date()): Promise<WriteResult> {
  const context = await readBoardContext(client);
  if (!context.ok) return context;
  const onBoard = new Set(context.value.columns.flatMap((column) => column.statuses.map((status) => status.id)));
  const targets = request.toStatusIds;
  if (!targets.every((id) => onBoard.has(id))) {
    return { ok: false, failure: failure("unsupported-transition", { detail: `The target is not a column of Board ${CANONICAL_SOURCE.boardId}` }) };
  }

  const before = await readIssue(client, key);
  if (!before.ok) return before;
  const current = before.value.issue;
  if (current.key !== key) return { ok: false, failure: failure("not-found", { detail: `${key} now resolves to ${current.key}` }) };
  if (targets.includes(current.status.id)) return { ok: true, issue: current, verifiedAt: now().toISOString() };
  if (current.status.id !== request.fromStatusId) {
    return { ok: false, failure: failure("stale", { issue: current, detail: `Jira shows ${current.status.name}` }) };
  }

  const offered = await client.get<{ transitions?: RawTransition[] }>(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`);
  if (!offered.ok) return { ok: false, failure: readFailure(offered.error, current) };
  const available = (offered.data.transitions ?? []).filter((transition) => transition.isAvailable !== false && transition.id);
  const transition = targets.map((id) => available.find((candidate) => String(candidate.to?.id) === id)).find(Boolean);
  if (!transition?.id) {
    const names = context.value.columns.flatMap((column) => column.statuses).filter((status) => targets.includes(status.id)).map((status) => status.name);
    return {
      ok: false,
      failure: failure("unsupported-transition", { issue: current, detail: `Jira offers no transition from ${current.status.name} to ${names.join(" / ")}` }),
    };
  }

  const write = await client.post(`/rest/api/3/issue/${encodeURIComponent(key)}/transitions`, { transition: { id: transition.id } });
  if (!write.ok && write.error.kind === "http" && (write.error.status === 401 || write.error.status === 403)) {
    return { ok: false, failure: readFailure(write.error, current) };
  }

  const after = await readIssue(client, key);
  if (!after.ok) {
    return { ok: false, failure: failure("write-unconfirmed", { detail: `Readback after the transition failed: ${after.failure.code}` }) };
  }
  const truth = after.value.issue;
  if (targets.includes(truth.status.id)) return { ok: true, issue: truth, verifiedAt: now().toISOString() };
  if (write.ok) {
    return { ok: false, failure: failure("readback-mismatch", { issue: truth, detail: `Jira reports ${truth.status.name} after the transition` }) };
  }
  if (isAmbiguous(write.error)) {
    return { ok: false, failure: failure("write-unconfirmed", { issue: truth, detail: `No clear answer from Jira; it currently shows ${truth.status.name}` }) };
  }
  return { ok: false, failure: failure("write-failed", { issue: truth, detail: write.error.kind === "http" ? `HTTP ${write.error.status}: ${write.error.detail}` : write.error.kind }) };
}
