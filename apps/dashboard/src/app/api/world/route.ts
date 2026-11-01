import { refuseUnauthorized } from "@/server/http";
import { writeManual } from "@/server/world/lookStore";
import { resetWorldService, worldServiceFromEnv } from "@/server/world/shared";

// always answered by the server process: never a build-time copy
export const dynamic = "force-dynamic";

/**
 * GET /api/world — one read for the 3D world: the Instagram snapshot (shared cache with the Social cockpit), the
 * counter pulse, aggregated audience geography, Jira work and Ana's operator-set region. Read-only. Same access gate
 * as every data route, and like the Instagram route only the dashboard's own pages may ask (it can start worker reads).
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
    return Response.json({ ok: false, reason: "cross-site request refused" }, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  // test control for the Playwright suite only: never enabled outside e2e (playwright.config.ts sets it)
  if (process.env.SOCIAL_IG_E2E_CONTROLS === "1" && new URL(request.url).searchParams.has("__reset")) {
    resetWorldService();
    await writeManual(null);
    return new Response(null, { status: 204 });
  }
  const world = await worldServiceFromEnv().read();
  return Response.json({ ok: true, world }, { headers: { "Cache-Control": "no-store" } });
}
