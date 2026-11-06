import { refuseUnauthorized } from "@/server/http";
import { readRateCard } from "@/server/kit/rateCard";

// read on every request: an edited rate-card.json shows at once, never a build-time copy
export const dynamic = "force-dynamic";

/**
 * GET /api/rate-card — Ana's internal prices for the register in her office. Same access gate as every data route
 * (the proxy checks first, this route again), and only the dashboard's own pages may ask: a page on another site gets
 * nothing. Never cached.
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
  const { card, error } = await readRateCard();
  return Response.json({ ok: true, card, error }, { headers: { "Cache-Control": "no-store" } });
}
