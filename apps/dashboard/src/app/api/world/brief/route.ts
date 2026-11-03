import { readWriteRequest } from "@/server/http";
import { worldBriefFromEnv, worldServiceFromEnv } from "@/server/world/shared";

export const dynamic = "force-dynamic";

/**
 * POST /api/world/brief — the button "Zusammenfassen": a brief of the current numbers (features/world/brief.ts), written
 * by the model from numbered, aggregated facts. At most one new brief per 10 minutes; a younger one is returned as it
 * is. Same gate as every write: an invited identity, same-origin JSON only.
 */
export async function POST(request: Request) {
  const req = await readWriteRequest(request);
  if (!req.ok) return req.response;
  const brief = worldBriefFromEnv();
  if (!brief) return Response.json({ ok: false, reason: "off" }, { status: 409, headers: { "Cache-Control": "no-store" } });
  const world = await worldServiceFromEnv().read();
  const r = await brief.generate(world);
  if (!r.ok) return Response.json({ ok: false, reason: r.reason }, { status: 502, headers: { "Cache-Control": "no-store" } });
  return Response.json({ ok: true, fresh: r.fresh, brief: r.record }, { headers: { "Cache-Control": "no-store" } });
}
