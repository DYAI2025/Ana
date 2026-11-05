import "server-only";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { MAX_UPLOAD_BYTES, processImage } from "./images";
import type { OfficePerson } from "./people";
import { publicAttachment, type Outcome } from "./service";
import { officeUploadsDir, type OfficeStore } from "./store";

const no = (status: number, reason: string): Outcome => ({ status, body: { ok: false, reason } });

async function writeAtomic(file: string, data: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true, mode: 0o700 });
  const tmp = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(tmp, data, { mode: 0o600 });
  await fs.rename(tmp, file);
}

/** Anyone on the board may add pictures: Ana shows what she means, Ben and Vince show what they built. */
export async function uploadAttachment(
  store: OfficeStore,
  actor: OfficePerson,
  ticketId: string,
  entryId: string | null,
  bytes: Buffer,
  dir: string = officeUploadsDir(),
): Promise<Outcome> {
  if (bytes.length === 0) return no(400, "the file is empty");
  if (bytes.length > MAX_UPLOAD_BYTES) return no(413, "pictures can be at most 10 MB");
  const found = store.getTicket(ticketId);
  if (!found || found.ticket.archived) return no(404, "ticket not found");
  if (entryId !== null && !found.entries.some((e) => e.id === entryId)) return no(400, "the entry does not belong to this ticket");
  const image = await processImage(bytes);
  if (!image) return no(415, "only PNG, JPEG or WebP pictures are accepted");
  const id = randomUUID();
  const rel = path.join(ticketId, `${id}.webp`);
  const full = path.join(dir, rel);
  const thumb = path.join(dir, ticketId, `${id}.thumb.webp`);
  await writeAtomic(full, image.full);
  await writeAtomic(thumb, image.thumb);
  try {
    const saved = store.addAttachment({
      id,
      ticketId,
      entryId,
      uploadedBy: actor,
      filePath: rel,
      mimeType: "image/webp",
      width: image.width,
      height: image.height,
      sizeBytes: image.full.length,
    });
    return { status: 201, body: { ok: true, attachment: publicAttachment(saved) } };
  } catch (e) {
    await Promise.all([fs.rm(full, { force: true }), fs.rm(thumb, { force: true })]);
    throw e;
  }
}

/** Reads a stored picture (full or thumbnail); null when it is unknown or its ticket was archived. */
export async function readAttachment(store: OfficeStore, id: string, size: "full" | "thumb", dir: string = officeUploadsDir()): Promise<Buffer | null> {
  const a = store.getAttachment(id);
  if (!a) return null;
  const t = store.getTicket(a.ticketId);
  if (!t || t.ticket.archived) return null;
  const rel = size === "thumb" ? a.filePath.replace(/\.webp$/, ".thumb.webp") : a.filePath;
  const file = path.resolve(dir, rel);
  if (!file.startsWith(path.resolve(dir) + path.sep)) return null;
  try {
    return await fs.readFile(file);
  } catch {
    return null;
  }
}
