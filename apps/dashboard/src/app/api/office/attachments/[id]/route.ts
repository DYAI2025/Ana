import { readActor } from "@/server/office/http";
import { readAttachment } from "@/server/office/uploads";
import { officeStore } from "@/server/office/store";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** GET /api/office/attachments/:id[?size=thumb]: the picture itself, only behind the login, never cached publicly. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const who = await readActor(request);
  if (!who.ok) return who.response;
  const size = new URL(request.url).searchParams.get("size") === "thumb" ? "thumb" : "full";
  const bytes = await readAttachment(officeStore(), id, size);
  if (!bytes) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  return new Response(new Uint8Array(bytes), {
    headers: { "Content-Type": "image/webp", "Cache-Control": "private, max-age=86400, immutable", "X-Content-Type-Options": "nosniff" },
  });
}
