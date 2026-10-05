import "server-only";

/**
 * The canonical Jira source of the dashboard work projection (ANA-5, Confluence 07 §13): Kanban Board 734
 * "ANA board" on filter 10733 in project ANA. Pinned here on purpose — Board 735 (sprint planning) shares the
 * filter and must never be substituted silently; a drift is reported as BLOCKED instead.
 */
export const CANONICAL_SOURCE = { boardId: 734, filterId: "10733", projectKey: "ANA" } as const;

/** Labels and the issue property that mark work created through the dashboard's Add idea action. */
export const IDEA_LABELS = ["ana-dashboard", "ana-idea"] as const;
export const IDEA_ISSUE_TYPE = "Task";
export const REQUEST_PROPERTY = "ana.dashboard.request";

export interface JiraConfig {
  /** Origin of the Jira site, e.g. https://example.atlassian.net */
  baseUrl: string;
  email: string;
  token: string;
  timeoutMs: number;
}

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Reads the server-side Jira credentials. Returns null when anything is missing or the URL is unusable, so
 * the UI shows BLOCKED (not configured) instead of guessing. Plain http is accepted only for a local test
 * double; the token is never sent unencrypted to a remote host.
 */
export function readJiraConfig(env: Readonly<Record<string, string | undefined>> = process.env): JiraConfig | null {
  const raw = env.JIRA_BASE_URL?.trim();
  const email = env.JIRA_EMAIL?.trim();
  const token = env.JIRA_API_TOKEN?.trim();
  if (!raw || !email || !token) return null;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  const secure = url.protocol === "https:" || (url.protocol === "http:" && LOCAL_HOSTS.has(url.hostname));
  if (!secure) return null;
  const timeout = Number(env.JIRA_TIMEOUT_MS);
  return { baseUrl: url.origin, email, token, timeoutMs: Number.isFinite(timeout) && timeout > 0 ? timeout : 10_000 };
}
