import type { AnalystFailure } from "@/features/world/analystTypes";
import { readWriteRequest, refuseUnauthorized } from "@/server/http";
import { analystDepsFromEnv, analystState, askAnalyst } from "@/server/analyst/service";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "no-store" };

const STATUS: Record<AnalystFailure, number> = {
  off: 409,
  misconfigured: 503,
  invalid_question: 400,
  busy: 429,
  daily_cap: 429,
  instagram_unavailable: 502,
  no_evidence: 422,
  invalid_answer: 502,
  provider_timeout: 504,
  provider_rate_limited: 429,
  provider_refused: 502,
  provider_failed: 502,
};

/** GET /api/world/analyst — only whether the panel can ask. It names no provider and no reason. */
export async function GET(request: Request) {
  const refused = await refuseUnauthorized(request);
  if (refused) return refused;
  return Response.json({ state: analystState() }, { headers: NO_STORE });
}

/**
 * POST /api/world/analyst `{ "question": "…" }` — one question to the World analyst (Jira ANAK-3). Same gate as every
 * write: an invited identity, same-origin JSON only. Disabled (WORLD_ANALYST_PROVIDER unset) it calls nobody.
 */
export async function POST(request: Request) {
  const req = await readWriteRequest(request);
  if (!req.ok) return req.response;
  const result = await askAnalyst((req.body as { question?: unknown } | null)?.question, analystDepsFromEnv());
  return Response.json(result, { status: result.ok ? 200 : STATUS[result.reason], headers: NO_STORE });
}
