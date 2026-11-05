import { guarded, writeActor } from "@/server/office/http";
import { resolveQuestion } from "@/server/office/service";
import { officeStore } from "@/server/office/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** PATCH /api/office/entries/:id/resolve `{}`: Ben and Vince mark one of Ana's questions as answered. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const req = await writeActor(request);
  if (!req.ok) return req.response;
  return guarded(() => resolveQuestion(officeStore(), req.actor, id));
}
