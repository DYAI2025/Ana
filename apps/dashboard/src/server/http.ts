import "server-only";
import type { SnapshotResult, WriteResult } from "@/features/work/types";
import { createJiraClient, type JiraClient } from "./jira/client";
import { readJiraConfig } from "./jira/config";
import { checkAccess } from "./access";
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

/**
 * Time budgets for all Jira calls of one dashboard request. They stay below the browser's deadlines
 * (src/features/work/api.ts), so the server always answers with an outcome before the browser gives up.
 */
export const READ_BUDGET_MS = 40_000;
export const WRITE_BUDGET_MS = 80_000;

/** The Jira client built from server-side environment variables, or null when the connection is not configured. */
export function jiraClientFromEnv(budgetMs: number): JiraClient | null {
  const config = readJiraConfig();
  return config ? createJiraClient(config, fetch, { budgetMs }) : null;
}

export function notConfigured(): Response {
  return json({ ok: false, failure: failure("not-configured", { detail: "JIRA_BASE_URL, JIRA_EMAIL and JIRA_API_TOKEN must be set on the dashboard server" }) });
}

/**
 * The work and social APIs act with the server's credentials, so every call passes the access check first
 * (src/server/access.ts): loopback-only on the localhost prototype, a verified Cloudflare Access identity from the
 * invite list when deployed. This also defeats DNS rebinding: a page on another domain sends its own Host header.
 */
export async function refuseUnauthorized(request: Request): Promise<Response | null> {
  const decision = await checkAccess(request.headers);
  return decision.ok ? null : invalid(decision.reason, decision.status);
}

/**
 * Writes act with the server's Jira credential, so they accept only same-origin JSON requests from the dashboard
 * itself: a cross-site page cannot submit a form or a "simple" request that creates or moves Jira work.
 */
/** Refuses a write that comes from another site (a form or script on a foreign page). */
export function refuseCrossSite(request: Request): Response | null {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite && fetchSite !== "same-origin") return invalid("cross-site request refused", 403);
  const origin = request.headers.get("origin");
  if (origin) {
    let originHost: string | null = null;
    try {
      originHost = new URL(origin).host;
    } catch {
      /* unparsable origin */
    }
    if (originHost !== request.headers.get("host")) return invalid("cross-origin request refused", 403);
  }
  return null;
}

export async function readWriteRequest(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const refused = await refuseUnauthorized(request);
  if (refused) return { ok: false, response: refused };
  const crossSite = refuseCrossSite(request);
  if (crossSite) return { ok: false, response: crossSite };
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("application/json")) {
    return { ok: false, response: invalid("expected application/json", 415) };
  }
  try {
    return { ok: true, body: await request.json() };
  } catch {
    return { ok: false, response: invalid("request body is not valid JSON") };
  }
}
