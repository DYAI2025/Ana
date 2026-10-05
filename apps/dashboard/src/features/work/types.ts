/**
 * Client-safe shapes of the Jira work projection (ANA-5). Jira is the only source of truth for work:
 * these objects are disposable views of one Jira read and never hold credentials or raw Jira payloads.
 */

export type StatusCategory = "new" | "indeterminate" | "done" | "unknown";

export interface WorkStatus {
  id: string;
  name: string;
  category: StatusCategory;
}

export interface WorkPerson {
  accountId: string;
  displayName: string;
}

export interface WorkIssue {
  id: string;
  key: string;
  summary: string;
  status: WorkStatus;
  assignee: WorkPerson | null;
  issueType: string;
  /** Jira label `ana-idea` — ideas stay visually distinct from committed work (REQ-F-014). */
  isIdea: boolean;
  /** Link to the issue in Jira (provenance). */
  url: string;
}

/** A Board 734 column as configured in Jira. Columns without statuses are never part of the projection. */
export interface WorkColumn {
  id: string;
  name: string;
  statuses: WorkStatus[];
  /** Every status of the column is in Jira's "new" category: the Backlog. */
  isBacklog: boolean;
}

export interface WorkSource {
  boardId: number;
  boardName: string;
  filterId: string;
  projectKey: string;
  /** Host of the Jira site, for display only. */
  site: string;
}

export interface WorkSnapshot {
  source: WorkSource;
  fetchedAt: string;
  columns: WorkColumn[];
  /** Issues of the board's issue set, in Jira rank order, each placed in exactly one column. */
  issues: WorkIssue[];
  /** Issues whose status is not mapped to any column of the board; Jira hides them on the board too. */
  unmapped: WorkIssue[];
  /** True when the board holds more issues than one read returns; the UI must say so. */
  truncated: boolean;
}

/** How a failure is shown. A failure is never rendered as success. */
export type FailureState = "ERROR" | "BLOCKED" | "UNKNOWN";

export const FAILURE_CODES = [
  "not-configured",
  "auth",
  "forbidden",
  "board-drift",
  "unavailable",
  "upstream",
  "rejected",
  "not-found",
  "unsupported-transition",
  "stale",
  "readback-mismatch",
  "write-failed",
  "write-unconfirmed",
  "duplicate-in-flight",
  "invalid-request",
] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

export interface WorkFailure {
  state: FailureState;
  code: FailureCode;
  /** Short, non-secret technical detail (e.g. Jira's own error message), for the expandable detail line. */
  detail?: string;
  /** Jira's current truth for the affected issue, when a readback produced it. */
  issue?: WorkIssue;
  /** Echoed for Add idea, so an UNKNOWN outcome can be checked again without creating a duplicate. */
  requestId?: string;
}

export type SnapshotResult = { ok: true; snapshot: WorkSnapshot } | { ok: false; failure: WorkFailure };

/** A write is `ok` only after Jira readback confirmed it. */
export type WriteResult =
  | { ok: true; issue: WorkIssue; verifiedAt: string; replayed?: boolean }
  | { ok: false; failure: WorkFailure };

export interface MoveRequest {
  fromStatusId: string;
  /** The statuses of the target column; the server picks the Jira transition that leads to one of them. */
  toStatusIds: string[];
}

export interface IdeaRequest {
  requestId: string;
  summary: string;
}
