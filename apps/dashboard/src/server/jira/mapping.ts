import "server-only";
import { columnIdFor } from "@/features/work/model";
import type { StatusCategory, WorkColumn, WorkIssue, WorkStatus } from "@/features/work/types";

/* ---------- raw Jira shapes (only the fields the projection reads) ---------- */

export interface RawBoardConfig {
  id?: number;
  name?: string;
  type?: string;
  location?: { type?: string; key?: string; projectKey?: string };
  filter?: { id?: string | number };
  subQuery?: { query?: string };
  columnConfig?: { columns?: { name?: string; statuses?: { id?: string | number }[] }[] };
}

export interface RawStatus {
  id?: string | number;
  name?: string;
  statusCategory?: { key?: string };
}

export type RawProjectStatuses = { name?: string; statuses?: RawStatus[] }[];

export interface RawIssue {
  id?: string | number;
  key?: string;
  fields?: {
    summary?: string;
    status?: RawStatus;
    assignee?: { accountId?: string; displayName?: string } | null;
    issuetype?: { name?: string };
    labels?: string[];
    project?: { key?: string };
  };
  properties?: Record<string, unknown>;
}

export interface RawTransition {
  id?: string;
  name?: string;
  isAvailable?: boolean;
  to?: RawStatus;
}

/* ---------- mapping ---------- */

const CATEGORIES: readonly StatusCategory[] = ["new", "indeterminate", "done"];

export function mapCategory(key: string | undefined): StatusCategory {
  return (CATEGORIES as readonly string[]).includes(key ?? "") ? (key as StatusCategory) : "unknown";
}

export function mapStatus(raw: RawStatus | undefined): WorkStatus {
  return { id: String(raw?.id ?? ""), name: raw?.name ?? "", category: mapCategory(raw?.statusCategory?.key) };
}

/** Every status used by any issue type of the project, by id. */
export function statusIndex(projectStatuses: RawProjectStatuses): Map<string, WorkStatus> {
  const index = new Map<string, WorkStatus>();
  for (const type of projectStatuses) for (const status of type.statuses ?? []) index.set(String(status.id), mapStatus(status));
  return index;
}

/**
 * Board columns in Jira's order. Columns without statuses — such as a disabled Kanban-backlog area — carry no
 * work and are dropped; they are not a state of the workflow.
 */
export function mapColumns(config: RawBoardConfig, statuses: ReadonlyMap<string, WorkStatus>): WorkColumn[] {
  const columns: WorkColumn[] = [];
  for (const column of config.columnConfig?.columns ?? []) {
    const ids = (column.statuses ?? []).map((status) => String(status.id ?? "")).filter(Boolean);
    if (ids.length === 0) continue;
    const resolved = ids.map((id) => statuses.get(id) ?? { id, name: `#${id}`, category: "unknown" as const });
    columns.push({
      id: columnIdFor(ids),
      name: column.name ?? "",
      statuses: resolved,
      isBacklog: resolved.every((status) => status.category === "new"),
    });
  }
  return columns;
}

export function mapIssue(raw: RawIssue, siteOrigin: string): WorkIssue {
  const fields = raw.fields ?? {};
  const key = raw.key ?? "";
  const assignee = fields.assignee?.accountId ? { accountId: fields.assignee.accountId, displayName: fields.assignee.displayName ?? fields.assignee.accountId } : null;
  return {
    id: String(raw.id ?? ""),
    key,
    summary: fields.summary ?? "",
    status: mapStatus(fields.status),
    assignee,
    issueType: fields.issuetype?.name ?? "",
    isIdea: (fields.labels ?? []).includes("ana-idea"),
    url: `${siteOrigin}/browse/${encodeURIComponent(key)}`,
  };
}

/** The issue set of the board: its saved filter plus the board's own sub-query (Kanban), in rank order. */
export function boardJql(filterId: string, subQuery: string | undefined): string {
  const sub = subQuery?.trim();
  return `filter = ${filterId}${sub ? ` AND (${sub})` : ""} ORDER BY Rank ASC`;
}

export const ISSUE_FIELDS = ["summary", "status", "assignee", "issuetype", "labels", "project"] as const;
