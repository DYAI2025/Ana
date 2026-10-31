import { refuseUnauthorized } from "@/server/http";
import { fetchProjection, readBrainConfig } from "@/server/brain/projection";

// always a live read of the Brain service: the projection is never served from a build-time or cached copy
export const dynamic = "force-dynamic";

/**
 * GET /api/brain — the Brain projection (docs/brain/CONTRACT.md §5) or an honest failure. Loopback only, or a verified
 * invited identity when deployed (LIVE-01).
 */
export async function GET(request: Request) {
  const refused = await refuseUnauthorized(request);
  if (refused) return refused;
  const result = await fetchProjection(readBrainConfig());
  return Response.json(result, { headers: { "Cache-Control": "no-store" } });
}
