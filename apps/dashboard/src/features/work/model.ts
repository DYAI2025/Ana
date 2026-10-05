/** Pure, client-safe helpers over one Jira work snapshot. Nothing here persists or invents work state. */
import type { MessageKey } from "@/i18n/translate";
import type { FailureCode, FailureState, WorkColumn, WorkIssue, WorkPerson, WorkSnapshot } from "./types";

/** One place decides how each failure is labelled: BLOCKED needs a person to act, UNKNOWN means Jira's truth is not known. */
export const FAILURE_STATE: Readonly<Record<FailureCode, FailureState>> = {
  "not-configured": "BLOCKED",
  auth: "BLOCKED",
  forbidden: "BLOCKED",
  "board-drift": "BLOCKED",
  "source-missing": "BLOCKED",
  "unsupported-transition": "BLOCKED",
  unavailable: "UNKNOWN",
  stale: "UNKNOWN",
  "write-unconfirmed": "UNKNOWN",
  "duplicate-in-flight": "UNKNOWN",
  upstream: "ERROR",
  rejected: "ERROR",
  "not-found": "ERROR",
  "readback-mismatch": "ERROR",
  "write-failed": "ERROR",
  "invalid-request": "ERROR",
};

/** Jira's summary field holds at most 255 characters. */
export const SUMMARY_MAX = 255;
export const REQUEST_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/** Attribute-selector value for a Jira key (keys look like `ANA-123`; quotes and backslashes are escaped anyway). */
export const attr = (value: string) => value.replace(/["\\]/g, "\\$&");

export function normalizeSummary(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

export function validateIdeaSummary(text: string): MessageKey | null {
  const summary = normalizeSummary(text);
  if (summary.length === 0) return "backlog.ideaRequired";
  if (summary.length > SUMMARY_MAX) return "backlog.ideaTooLong";
  return null;
}

export function columnIdFor(statusIds: readonly string[]): string {
  return `col-${statusIds.join("-")}`;
}

export function columnForStatus(columns: readonly WorkColumn[], statusId: string): WorkColumn | undefined {
  return columns.find((column) => column.statuses.some((status) => status.id === statusId));
}

export function issuesInColumn(snapshot: WorkSnapshot, column: WorkColumn): WorkIssue[] {
  const ids = new Set(column.statuses.map((status) => status.id));
  return snapshot.issues.filter((issue) => ids.has(issue.status.id));
}

export function backlogColumn(snapshot: WorkSnapshot): WorkColumn | undefined {
  return snapshot.columns.find((column) => column.isBacklog);
}

export function backlogIssues(snapshot: WorkSnapshot): WorkIssue[] {
  const column = backlogColumn(snapshot);
  return column ? issuesInColumn(snapshot, column) : [];
}

/** The Review column of the target workflow (Backlog → … → In Arbeit → Review → Erledigt). */
export function isReviewColumn(column: WorkColumn): boolean {
  return column.statuses.some((status) => status.name.trim().toLowerCase() === "review");
}

export interface WorkCounts {
  backlog: number;
  active: number;
  review: number;
  done: number;
}

export function workCounts(snapshot: WorkSnapshot): WorkCounts {
  const counts: WorkCounts = { backlog: 0, active: 0, review: 0, done: 0 };
  for (const issue of snapshot.issues) {
    const column = columnForStatus(snapshot.columns, issue.status.id);
    if (!column) continue;
    if (column.isBacklog) counts.backlog += 1;
    else if (isReviewColumn(column)) counts.review += 1;
    else if (issue.status.category === "done") counts.done += 1;
    else counts.active += 1;
  }
  return counts;
}

export type OwnerFilter = "all" | "unassigned" | { accountId: string };

export function ownersOf(issues: readonly WorkIssue[]): { people: WorkPerson[]; hasUnassigned: boolean } {
  const byId = new Map<string, WorkPerson>();
  let hasUnassigned = false;
  for (const issue of issues) {
    if (issue.assignee) byId.set(issue.assignee.accountId, issue.assignee);
    else hasUnassigned = true;
  }
  const people = [...byId.values()].sort((a, b) => a.displayName.localeCompare(b.displayName));
  return { people, hasUnassigned };
}

export function filterByOwner(issues: readonly WorkIssue[], owner: OwnerFilter): WorkIssue[] {
  if (owner === "all") return [...issues];
  if (owner === "unassigned") return issues.filter((issue) => issue.assignee === null);
  return issues.filter((issue) => issue.assignee?.accountId === owner.accountId);
}

/**
 * Put Jira's confirmed state of one issue into the snapshot (after a verified write or a readback).
 * The issue lands in the column of its Jira status, or among the unmapped issues if no column holds it.
 */
export function withIssue(snapshot: WorkSnapshot, issue: WorkIssue): WorkSnapshot {
  const mapped = Boolean(columnForStatus(snapshot.columns, issue.status.id));
  const others = snapshot.issues.filter((existing) => existing.key !== issue.key);
  const unmapped = snapshot.unmapped.filter((existing) => existing.key !== issue.key);
  const position = snapshot.issues.findIndex((existing) => existing.key === issue.key);
  if (!mapped) return { ...snapshot, issues: others, unmapped: [...unmapped, issue] };
  // a new issue goes last, where Jira ranks newly created issues; a known one keeps its rank position
  const issues = position === -1 ? [...others, issue] : [...others.slice(0, position), issue, ...others.slice(position)];
  return { ...snapshot, issues, unmapped };
}
