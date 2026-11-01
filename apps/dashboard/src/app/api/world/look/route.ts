import { readWriteRequest } from "@/server/http";
import { parseManual, writeManual } from "@/server/world/lookStore";

export const dynamic = "force-dynamic";

/**
 * POST /api/world/look — the team picks Ana's look and outfit colour by hand: `{ "look": "auto" | "everyday" |
 * "scooter" | "mermaid", "color": "auto" | "#rrggbb", "activity"?: "auto" | "scooter" | "eating" | "selfie" | "dancing" | "reading" }`. All
 * "auto" removes the pick. Same gate as every write:
 * an invited identity, same-origin JSON only. The pick holds until Ana publishes a newer post.
 */
export async function POST(request: Request) {
  const req = await readWriteRequest(request);
  if (!req.ok) return req.response;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const pick = parseManual({ look: body.look, color: body.color, activity: body.activity, set_at: new Date().toISOString() });
  if (!pick) return Response.json({ ok: false, reason: "look must be auto|everyday|scooter|mermaid, color auto|#rrggbb, activity auto|scooter|eating|selfie|dancing|reading" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  try {
    await writeManual(pick.look === "auto" && pick.color === "auto" && pick.activity === "auto" ? null : pick);
  } catch {
    return Response.json({ ok: false, reason: "the pick could not be stored on the server" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
  return Response.json({ ok: true, manual: pick.look === "auto" && pick.color === "auto" && pick.activity === "auto" ? null : pick, at: pick.set_at }, { headers: { "Cache-Control": "no-store" } });
}
