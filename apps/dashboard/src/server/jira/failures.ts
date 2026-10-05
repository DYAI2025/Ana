import "server-only";
import { FAILURE_STATE } from "@/features/work/model";
import type { FailureCode, WorkFailure, WorkIssue } from "@/features/work/types";
import type { JiraCallError } from "./client";

export function failure(code: FailureCode, extra: Omit<WorkFailure, "state" | "code"> = {}): WorkFailure {
  return { state: FAILURE_STATE[code], code, ...extra };
}

/** A failed read (or a write that Jira explicitly refused) mapped to what the person needs to know. */
export function readFailure(error: JiraCallError, issue?: WorkIssue): WorkFailure {
  switch (error.kind) {
    case "timeout":
      return failure("unavailable", { detail: "Jira did not answer in time", issue });
    case "network":
      return failure("unavailable", { detail: error.detail, issue });
    case "invalid-json":
      return failure("upstream", { detail: "Jira returned an unreadable response", issue });
    case "http":
      if (error.status === 401) return failure("auth", { detail: error.detail, issue });
      if (error.status === 403) return failure("forbidden", { detail: error.detail, issue });
      if (error.status === 404) return failure("not-found", { detail: error.detail, issue });
      if (error.status >= 500 || error.status === 429) return failure("upstream", { detail: `HTTP ${error.status}: ${error.detail}`, issue });
      return failure("rejected", { detail: `HTTP ${error.status}: ${error.detail}`, issue });
  }
}

/**
 * True when a write may or may not have reached Jira: no answer, or an answer that does not prove the write
 * was refused. Such outcomes are resolved by reading Jira back, never by assuming.
 */
export function isAmbiguous(error: JiraCallError): boolean {
  if (error.kind !== "http") return true;
  return error.status >= 500 || error.status === 429;
}
