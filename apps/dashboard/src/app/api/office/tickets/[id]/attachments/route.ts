import { uploadActor } from "@/server/office/http";
import { uploadAttachment } from "@/server/office/uploads";
import { officeStore } from "@/server/office/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** POST /api/office/tickets/:id/attachments (multipart: file, entryId?): anyone on the board adds a picture. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const req = await uploadActor(request);
  if (!req.ok) return req.response;
  try {
    const o = await uploadAttachment(officeStore(), req.actor, id, req.entryId, req.file);
    return Response.json(o.body, { status: o.status, headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ ok: false, reason: "the picture could not be saved on the server" }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}
