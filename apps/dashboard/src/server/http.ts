import "server-only";
import type { SnapshotResult, WriteResult } from "@/features/work/types";
import { createJiraClient, type JiraClient } from "./jira/client";
import { readJiraConfig } from "./jira/config";
import { failure } from "./jira/failures";

/**
 * Outcomes of the work API are always JSON bodies with `ok`. A Jira failure is a valid answer about Jira's state
 * (status 200 with `ok: false`); 4xx is kept for requests the dashboard itself must refuse.
 */
export function json(body: SnapshotResult | WriteResult, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function invalid(detail: string, status = 400): Response {
  return json({ ok: false, failure: failure("invalid-request", { detail }) }, status);
}

/** The Jira client built from server-side environment variables, or null when the connection is not configured. */
export function jiraClientFromEnv(): JiraClient | null {
  const config = readJiraConfig();
  return config ? createJiraClient(config) : null;
}

export function notConfigured(): Response {
  return json({ ok: false, failure: failure("not-configured", { detail: "JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN must be set on the dashboard server" }) });
}

/**
 * Writes act with the server's Jira credential, so they accept only same-origin JSON requests from the dashboard
 * itself: a cross-site page cannot submit a form or a "simple" request that creates or moves Jira work.
 */
export async function readWriteRequest(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return { ok: false, response: invalid("cross-site request refused", 403) };
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      /* unparsable origin */
    }
    if (originHost !== request.headers.get("host")) return { ok: false, response: invalid("cross-origin request refused", 403) };
  }
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return { ok: false, response: invalid("expected application/json", 415) };
  }
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: invalid("request body is not valid JSON") };
  }
}
