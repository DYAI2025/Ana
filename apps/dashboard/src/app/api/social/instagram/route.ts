import type { SocialResult } from "@/features/social/types";
import { refuseNonLocal } from "@/server/http";
import { NOT_CONFIGURED, socialServiceFromEnv } from "@/server/social/service";

// always answered by the server process: never a build-time copy
export const dynamic = "force-dynamic";

const json = (body: SocialResult) => Response.json(body, { headers: { "Cache-Control": "no-store" } });

/**
 * GET /api/social/instagram — the Instagram snapshot for the Social cockpit (ANA-38). Read-only; `?refresh=1` asks for a
 * new worker read (rate-limited server-side). Loopback only until the dashboard authentication slice exists.
 */
export async function GET(request: Request) {
  const nonLocal = refuseNonLocal(request);
  if (nonLocal) return nonLocal;
  const service = socialServiceFromEnv();
  if (!service) return json({ ok: false, failure: NOT_CONFIGURED });
  const params = new URL(request.url).searchParams;
  // test control for the Playwright suite only: never enabled outside e2e (playwright.config.ts sets it)
  if (process.env.SOCIAL_IG_E2E_CONTROLS === "1" && params.has("__reset")) {
    service.reset();
    return new Response(null, { status: 204 });
  }
  const refresh = params.get("refresh") === "1";
  return json(await service.read({ refresh }));
}
