import { guarded, readActor, writeActor } from "@/server/office/http";
import { getTicket, updateTicket } from "@/server/office/service";
import { officeStore } from "@/server/office/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/office/tickets/:id: the ticket with its whole history, oldest entry first. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await readActor(request);
  if (!who.ok) return who.response;
  return guarded(() => getTicket(officeStore(), id));
}

/** PATCH /api/office/tickets/:id `{ title?, description?, column?, assignee?, position?, archived? }`: Ben and Vince only. */
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const req = await writeActor(request);
  if (!req.ok) return req.response;
  return guarded(() => updateTicket(officeStore(), req.actor, id, req.body));
}
