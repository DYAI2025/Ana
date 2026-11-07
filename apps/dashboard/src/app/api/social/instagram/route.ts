import type { SocialResult } from "@/features/social/types";
import { refuseUnauthorized } from "@/server/http";
import { CATEGORIES_OFF, cockpitCategories, e2eCategories } from "@/server/social/categories";
import { NOT_CONFIGURED, socialServiceFromEnv } from "@/server/social/service";
import { postTaggerFromEnv } from "@/server/world/shared";

// always answered by the server process: never a build-time copy
export const dynamic = "force-dynamic";

// e2e only (SOCIAL_IG_E2E_CONTROLS=1): "?__categories=off" plays a server without a model key until the next reset
let e2eCategoriesOff = false;

const json = (body: SocialResult) => Response.json(body, { headers: { "Cache-Control": "no-store" } });

/**
 * GET /api/social/instagram — the Instagram snapshot for the Social cockpit (ANA-38). Read-only; `?refresh=1` asks for a
 * new worker read (rate-limited server-side). Loopback only, or a verified invited identity when deployed (LIVE-01).
 */
export async function GET(request: Request) {
  const refused = await refuseUnauthorized(request);
  if (refused) return refused;
  // a read can start a costly worker call with the stored Instagram token: only the dashboard's own pages may ask
  const site = request.headers.get("sec-fetch-site");
  const origin = request.headers.get("origin");
  let originHost: string | null = null;
  try {
    originHost = origin ? new URL(origin).host : null;
  } catch {
    originHost = "invalid";
  }
  if ((site && site !== "same-origin" && site !== "none") || (origin && originHost !== request.headers.get("host"))) {
    return Response.json({ ok: false, failure: { state: "ERROR", code: "invalid-request", detail: "cross-site request refused" } } satisfies SocialResult, { status: 403, headers: { "Cache-Control": "no-store" } });
  }
  const service = socialServiceFromEnv();
  if (!service) return json({ ok: false, failure: NOT_CONFIGURED });
  const params = new URL(request.url).searchParams;
  // test control for the Playwright suite only: never enabled outside e2e (playwright.config.ts sets it)
  const e2e = process.env.SOCIAL_IG_E2E_CONTROLS === "1";
  if (e2e && params.has("__reset")) {
    service.reset();
    e2eCategoriesOff = false;
    return new Response(null, { status: 204 });
  }
  if (e2e && (params.get("__categories") === "off" || params.get("__categories") === "on")) {
    e2eCategoriesOff = params.get("__categories") === "off";
    return new Response(null, { status: 204 });
  }
  const refresh = params.get("refresh") === "1";
  const result = await service.read({ refresh });
  if (!result.ok) return json(result);
  // the Haiku categories of the world (ANA-60); in e2e a synthetic stored file stands in for the model
  const tagsFile = e2e ? process.env.SOCIAL_IG_E2E_TAGS_FILE : undefined;
  const categories = tagsFile ? (e2eCategoriesOff ? CATEGORIES_OFF : await e2eCategories(result.snapshot.posts, tagsFile)) : await cockpitCategories(result.snapshot.posts, postTaggerFromEnv());
  return json({ ...result, categories });
}
