// @vitest-environment node
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MAX_EDGE, THUMB_EDGE } from "./images";
import { addEntry, createTicket, getTicket, updateTicket } from "./service";
import { openOfficeStore, type OfficeStore } from "./store";
import { readAttachment, uploadAttachment } from "./uploads";

let dir: string;
let uploads: string;
let store: OfficeStore;
let ticketId: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "office-up-"));
  uploads = path.join(dir, "uploads");
  store = openOfficeStore(path.join(dir, "office.sqlite"));
  ticketId = (createTicket(store, "ben", { title: "Website" }).body.ticket as { id: string }).id;
});

afterEach(() => {
  store.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

/** An ~8.7 MB PNG of random pixels (nothing compresses noise), 1700 x 1700. */
async function bigPng(): Promise<Buffer> {
  const w = 1700;
  return sharp(randomBytes(w * w * 3), { raw: { width: w, height: w, channels: 3 } }).png({ compressionLevel: 0 }).toBuffer();
}

describe("picture uploads", () => {
  it("shrink a large PNG to WebP within 2000 px and add a 400 px thumbnail", async () => {
    const wide = await sharp({ create: { width: 3200, height: 1600, channels: 3, background: "#e8a598" } }).png().toBuffer();
    const r = await uploadAttachment(store, "ana", ticketId, null, wide, uploads);
    expect(r.status).toBe(201);
    const a = r.body.attachment as { id: string; width: number; height: number };
    expect([a.width, a.height]).toEqual([MAX_EDGE, 1000]);
    expect(JSON.stringify(r.body)).not.toContain(uploads);
    const full = await readAttachment(store, a.id, "full", uploads);
    const thumb = await readAttachment(store, a.id, "thumb", uploads);
    expect((await sharp(full!).metadata()).format).toBe("webp");
    expect((await sharp(thumb!).metadata()).width).toBe(THUMB_EDGE);
  });

  it("accept an 8 MB PNG and store it much smaller", async () => {
    const png = await bigPng();
    expect(png.length).toBeGreaterThan(8 * 1024 * 1024);
    const r = await uploadAttachment(store, "ben", ticketId, null, png, uploads);
    expect(r.status).toBe(201);
    const id = (r.body.attachment as { id: string }).id;
    expect((await readAttachment(store, id, "full", uploads))!.length).toBeLessThan(png.length);
  });

  it("refuse a text file renamed to .png, and files over 10 MB", async () => {
    expect((await uploadAttachment(store, "ana", ticketId, null, Buffer.from("hello, I am not a picture"), uploads)).status).toBe(415);
    expect((await uploadAttachment(store, "ana", ticketId, null, Buffer.alloc(10 * 1024 * 1024 + 1), uploads)).status).toBe(413);
  });

  it("remove the GPS position and other metadata of a phone photo", async () => {
    const photo = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#3d63b8" } })
      .jpeg()
      .withExif({ IFD0: { Make: "Phone", Model: "Test" }, IFD3: { GPSLatitudeRef: "N", GPSLatitude: "52/1 31/1 0/1" } })
      .toBuffer();
    expect((await sharp(photo).metadata()).exif).toBeDefined();
    const r = await uploadAttachment(store, "ana", ticketId, null, photo, uploads);
    const id = (r.body.attachment as { id: string }).id;
    expect((await sharp((await readAttachment(store, id, "full", uploads))!).metadata()).exif).toBeUndefined();
  });

  it("attach to an entry of the same ticket only, and show up in the ticket", async () => {
    const entryId = (addEntry(store, "ana", ticketId, { body: "Like this?" }).body.entry as { id: string }).id;
    const other = (createTicket(store, "ben", { title: "Other" }).body.ticket as { id: string }).id;
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();
    expect((await uploadAttachment(store, "ana", other, entryId, png, uploads)).status).toBe(400);
    expect((await uploadAttachment(store, "ana", ticketId, entryId, png, uploads)).status).toBe(201);
    const t = getTicket(store, ticketId).body as { attachments: Array<{ entryId: string }> };
    expect(t.attachments.map((a) => a.entryId)).toEqual([entryId]);
    expect(JSON.stringify(t)).not.toContain("filePath");
  });

  it("stop serving pictures of an archived ticket", async () => {
    const png = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).png().toBuffer();
    const id = ((await uploadAttachment(store, "ana", ticketId, null, png, uploads)).body.attachment as { id: string }).id;
    updateTicket(store, "ben", ticketId, { archived: true });
    expect(await readAttachment(store, id, "full", uploads)).toBeNull();
  });
});
