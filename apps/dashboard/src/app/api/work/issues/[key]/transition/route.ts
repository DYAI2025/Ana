import { invalid, jiraClientFromEnv, json, notConfigured, readWriteRequest, WRITE_BUDGET_MS } from "@/server/http";
import { moveIssue, validateMove } from "@/server/jira/work";

export const dynamic = "force-dynamic";

/** POST /api/work/issues/:key/transition — move one issue through a Jira transition, confirmed by readback. */
export async function POST(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const read = await readWriteRequest(request);
  if (!read.ok) return read.response;
  const move = validateMove(key, read.body);
  if (!move) return invalid("an ANA issue key, fromStatusId and toStatusIds are required");
  const client = jiraClientFromEnv(WRITE_BUDGET_MS);
  if (!client) return notConfigured();
  return json(await moveIssue(client, key, move));
}
