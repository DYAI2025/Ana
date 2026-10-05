import { invalid, jiraClientFromEnv, json, notConfigured, readWriteRequest, WRITE_BUDGET_MS } from "@/server/http";
import { createIdea, validateIdeaRequest } from "@/server/jira/ideas";

export const dynamic = "force-dynamic";

/** POST /api/work/ideas — Add idea: one Jira item in Backlog, confirmed by readback, safe to retry with the same requestId. */
export async function POST(request: Request) {
  const read = await readWriteRequest(request);
  if (!read.ok) return read.response;
  const idea = validateIdeaRequest(read.body);
  if (!idea) return invalid("requestId (UUID v4) and a summary of 1–255 characters are required");
  const client = jiraClientFromEnv(WRITE_BUDGET_MS);
  if (!client) return notConfigured();
  return json(await createIdea(client, idea));
}
