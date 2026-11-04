import "server-only";
import { checkAccess } from "../access";
import { readWriteRequest } from "../http";
import { personOf, type OfficePerson } from "./people";
import type { Outcome } from "./service";

/**
 * HTTP edge of Office Berlin. Every call passes the same access check as the rest of the dashboard, then the verified
 * login is mapped to a person (src/server/office/people.ts). Writes additionally pass the same-origin JSON gate.
 */

const HEADERS = { "Cache-Control": "no-store" };

export function respond(o: Outcome): Response {
  return Response.json(o.body, { status: o.status, headers: HEADERS });
}

function refuse(status: number, reason: string): Response {
  return Response.json({ ok: false, reason }, { status, headers: HEADERS });
}

export async function readActor(request: Request): Promise<{ ok: true; actor: OfficePerson } | { ok: false; response: Response }> {
  const decision = await checkAccess(request.headers);
  if (!decision.ok) return { ok: false, response: refuse(decision.status, decision.reason) };
  const actor = personOf(decision.email);
  if (!actor) return { ok: false, response: refuse(403, "this login is not linked to Ana, Ben or Vince") };
  return { ok: true, actor };
}

export async function writeActor(request: Request): Promise<{ ok: true; actor: OfficePerson; body: unknown } | { ok: false; response: Response }> {
  const req = await readWriteRequest(request);
  if (!req.ok) return req;
  const who = await readActor(request);
  if (!who.ok) return who;
  return { ok: true, actor: who.actor, body: req.body };
}

/** A storage failure is reported honestly; the board never pretends a save worked. */
export function guarded(run: () => Outcome): Response {
  try {
    return respond(run());
  } catch {
    return refuse(500, "the board could not be read or saved on the server");
  }
}
