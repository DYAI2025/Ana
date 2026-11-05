import "server-only";
import { checkAccess } from "../access";
import { readWriteRequest, refuseCrossSite } from "../http";
import { MAX_UPLOAD_BYTES } from "./images";
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

/** Picture uploads: same login and same-origin gate as every write, but multipart instead of JSON. */
export async function uploadActor(
  request: Request,
): Promise<{ ok: true; actor: OfficePerson; file: Buffer; entryId: string | null } | { ok: false; response: Response }> {
  const who = await readActor(request);
  if (!who.ok) return who;
  const crossSite = refuseCrossSite(request);
  if (crossSite) return { ok: false, response: crossSite };
  if (!(request.headers.get("content-type") ?? "").toLowerCase().startsWith("multipart/form-data")) return { ok: false, response: refuse(415, "expected multipart/form-data") };
  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return { ok: false, response: refuse(413, "pictures can be at most 10 MB") };
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return { ok: false, response: refuse(400, "the upload could not be read") };
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) return { ok: false, response: refuse(400, "no file in the upload") };
  if (file.size > MAX_UPLOAD_BYTES) return { ok: false, response: refuse(413, "pictures can be at most 10 MB") };
  const entry = form.get("entryId");
  return { ok: true, actor: who.actor, file: Buffer.from(await file.arrayBuffer()), entryId: typeof entry === "string" && entry ? entry : null };
}

/** A storage failure is reported honestly; the board never pretends a save worked. */
export function guarded(run: () => Outcome): Response {
  try {
    return respond(run());
  } catch {
    return refuse(500, "the board could not be read or saved on the server");
  }
}
