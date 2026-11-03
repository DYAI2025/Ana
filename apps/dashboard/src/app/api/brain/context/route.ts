import { refuseUnauthorized } from "@/server/http";
import { createBrainMcp } from "@/server/brain/mcpClient";
import { retrieveContext } from "@/server/brain/retrieval";
import { brainWriterConfigFromEnv } from "@/server/world/brainWriter";

export const dynamic = "force-dynamic";

const MAX_QUERY = 500;
const headers = { "Cache-Control": "no-store" };

/**
 * GET /api/brain/context?q=...&limit=... — what the Brain knows about a question: semantic hits with their sources,
 * status and correction history. Same access gate as every data route; only the dashboard's own pages may ask. The key
 * stays on the server. No model is called here.
 */
export async function GET(request: Request) {
  const refused = await refuseUnauthorized(request);
  if (refused) return refused;
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = "invalid";
  }
  if ((site && site !== "same-origin" && site !== "none") || (origin && originHost !== request.headers.get("host"))) {
    return Response.json({ ok: false, reason: "cross-site request refused" }, { status: 403, headers });
  }
  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  if (query.length === 0 || query.length > MAX_QUERY) return Response.json({ ok: false, reason: "invalid-query" }, { status: 400, headers });
  const limit = Math.min(10, Math.max(1, Math.floor(Number(params.get("limit"))) || 5));
  const config = brainWriterConfigFromEnv();
  if (!config) return Response.json({ ok: false, reason: "not-configured" }, { headers });
  return Response.json(await retrieveContext(createBrainMcp(config), query, limit), { headers });
}
