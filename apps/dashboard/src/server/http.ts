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

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

function hostnameOf(host: string | null): string | null {
  if (!host) return null;
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}

/**
 * The work API acts with the server's Jira credential and there is no sign-in yet, so it answers only requests
 * addressed to this machine (loopback host names; extend with DASHBOARD_ALLOWED_HOSTS only together with the
 * authentication slice). This also defeats DNS rebinding: a page on another domain sends its own Host header.
 * The npm scripts bind the server to 127.0.0.1, so other machines cannot connect in the first place.
 */
export function refuseNonLocal(request: Request): Response | null {
  // configured entries are normalised the same way as the Host header (port and case dropped)
  const extra = (process.env.DASHBOARD_ALLOWED_HOSTS ?? "").split(",").map((h) => hostnameOf(h.trim())).filter((h): h is string => Boolean(h));
  const allowed = new Set([...LOOPBACK, ...extra]);
  const hostname = hostnameOf(request.headers.get("host"));
  if (!hostname || !allowed.has(hostname)) return invalid("the work API answers only requests addressed to this machine", 403);
  return null;
}

/**
 * Writes act with the server's Jira credential, so they accept only same-origin JSON requests from the dashboard
 * itself: a cross-site page cannot submit a form or a "simple" request that creates or moves Jira work.
 */
export async function readWriteRequest(request: Request): Promise<{ ok: true; body: unknown } | { ok: false; response: Response }> {
  const nonLocal = refuseNonLocal(request);
  if (nonLocal) return { ok: false, response: nonLocal };
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
