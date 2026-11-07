import { checkAccess } from "@/server/access";
import { readWriteRequest, refuseUnauthorized } from "@/server/http";
import { readRateCard, saveRateCard } from "@/server/kit/rateCard";

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

const noStore = { "Cache-Control": "no-store" };

/**
 * PUT /api/rate-card — the team saves the card edited in the office: `{ "card": {...}, "base": "<updated_at it started
 * from>" | null }`. Same gate as every write (an invited identity, same-origin JSON only). 409 with the current card
 * when someone saved in between; 400 with the problems when the card is not valid (nothing is stored half).
 */
export async function PUT(request: Request) {
  const req = await readWriteRequest(request);
  if (!req.ok) return req.response;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const base = typeof body.base === "string" ? body.base : null;
  const who = await checkAccess(request.headers);
  try {
    const result = await saveRateCard(body.card, base, who.ok ? who.email : null);
    if (result.ok) return Response.json({ ok: true, card: result.card }, { headers: noStore });
    if (result.conflict) return Response.json({ ok: false, reason: "conflict", card: result.card }, { status: 409, headers: noStore });
    return Response.json({ ok: false, reason: "invalid", problems: result.problems }, { status: 400, headers: noStore });
  } catch {
    return Response.json({ ok: false, reason: "the rate card could not be stored on the server" }, { status: 500, headers: noStore });
  }
}
