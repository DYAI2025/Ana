import { jiraClientFromEnv, json, notConfigured } from "@/server/http";
import { readSnapshot } from "@/server/jira/work";

// always a live Jira read: the projection is never served from a build-time or cached copy
export const dynamic = "force-dynamic";

/** GET /api/work — Board 734 / filter 10733 as one snapshot. `?reconcile=<issue ids>` asks Jira for read-after-write consistency. */
export async function GET(request: Request) {
  const client = jiraClientFromEnv();
  if (!client) return notConfigured();
  const reconcile = (new URL(request.url).searchParams.get("reconcile") ?? "")
    .split(",")
    .filter((id) => /^\d{1,12}$/.test(id))
    .slice(0, 50);
  return json(await readSnapshot(client, { reconcileIssueIds: reconcile }));
}
