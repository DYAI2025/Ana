/** Browser side of the work API. The browser never talks to Jira and never holds a Jira credential. */
import { FAILURE_STATE } from "./model";
import type { IdeaRequest, MoveRequest, SnapshotResult, WorkFailure, WriteResult } from "./types";

const unreachable = (code: "unavailable" | "write-unconfirmed", detail: string): WorkFailure => ({ state: FAILURE_STATE[code], code, detail });

function isResult(body: unknown): body is SnapshotResult | WriteResult {
  if (typeof body !== "object" || body === null || typeof (body as { ok?: unknown }).ok !== "boolean") return false;
  return (body as { ok: boolean }).ok || typeof (body as { failure?: { code?: unknown } }).failure?.code === "string";
}

async function call<T extends SnapshotResult | WriteResult>(input: string, init: RequestInit, onUnreachable: WorkFailure): Promise<T> {
  try {
    const response = await fetch(input, { ...init, cache: "no-store" });
    const body: unknown = await response.json();
    return isResult(body) ? (body as T) : ({ ok: false, failure: onUnreachable } as T);
  } catch {
    return { ok: false, failure: onUnreachable } as T;
  }
}

export function fetchSnapshot(reconcileIssueIds: readonly string[] = []): Promise<SnapshotResult> {
  const query = reconcileIssueIds.length > 0 ? `?reconcile=${reconcileIssueIds.map(encodeURIComponent).join(",")}` : "";
  return call(`/api/work${query}`, { method: "GET" }, unreachable("unavailable", "The dashboard server did not answer"));
}

const post = (body: unknown): RequestInit => ({ method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

/** If the dashboard server itself does not answer, a write may still have reached Jira: the outcome is UNKNOWN. */
export function postMove(key: string, move: MoveRequest): Promise<WriteResult> {
  return call(`/api/work/issues/${encodeURIComponent(key)}/transition`, post(move), unreachable("write-unconfirmed", "The dashboard server did not answer"));
}

export function postIdea(idea: IdeaRequest): Promise<WriteResult> {
  return call("/api/work/ideas", post(idea), { ...unreachable("write-unconfirmed", "The dashboard server did not answer"), requestId: idea.requestId });
}
