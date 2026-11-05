import { guarded, readActor, writeActor } from "@/server/office/http";
import { createTicket, listTickets } from "@/server/office/service";
import { officeStore } from "@/server/office/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/office/tickets: every open ticket with counts of entries, pictures and unanswered questions. */
export async function GET(request: Request) {
  const who = await readActor(request);
  if (!who.ok) return who.response;
  return guarded(() => listTickets(officeStore(), who.actor));
}

/** POST /api/office/tickets `{ title, description?, column?, assignee? }`: Ben and Vince only. */
export async function POST(request: Request) {
  const req = await writeActor(request);
  if (!req.ok) return req.response;
  return guarded(() => createTicket(officeStore(), req.actor, req.body));
}
