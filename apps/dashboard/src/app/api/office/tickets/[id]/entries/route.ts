import { guarded, writeActor } from "@/server/office/http";
import { addEntry } from "@/server/office/service";
import { officeStore } from "@/server/office/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/office/tickets/:id/entries `{ body, isQuestion? }`: anyone; the author is the logged-in person. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const req = await writeActor(request);
  if (!req.ok) return req.response;
  return guarded(() => addEntry(officeStore(), req.actor, id, req.body));
}
