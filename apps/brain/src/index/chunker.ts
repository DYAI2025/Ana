import { createHash } from "node:crypto";

export const MAX_CHUNK = 1500;

/** Split a Markdown body into heading sections, each at most ~maxChars (long sections split on paragraphs/hard cut). */
export function chunk(title: string, body: string, maxChars = MAX_CHUNK): string[] {
  const sections: string[] = [];
  let cur: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    if (/^#{1,6}\s/.test(line) && cur.join("").trim()) {
      sections.push(cur.join("\n").trim());
      cur = [];
    }
    cur.push(line);
  }
  if (cur.join("").trim()) sections.push(cur.join("\n").trim());
  if (!sections.length) sections.push(title);
  const out: string[] = [];
  for (const s of sections) {
    if (s.length <= maxChars) {
      out.push(s);
      continue;
    }
    let buf = "";
    for (const para of s.split(/\n\s*\n/)) {
      const pieces = para.length > maxChars ? (para.match(new RegExp(`[\\s\\S]{1,${maxChars}}`, "g")) ?? []) : [para];
      for (const p of pieces) {
        if (buf && buf.length + p.length + 2 > maxChars) {
          out.push(buf);
          buf = "";
        }
        buf = buf ? `${buf}\n\n${p}` : p;
      }
    }
    if (buf) out.push(buf);
  }
  return out.map((c) => `${title}\n\n${c}`);
}

/** Fixed namespace for ANA Brain point ids (UUIDv5). */
export const POINT_NAMESPACE = "6f1d3c1e-35a1-5b2e-9c4d-a7e0b2f35a35";

export function uuidv5(name: string, namespace = POINT_NAMESPACE): string {
  const ns = Buffer.from(namespace.replace(/-/g, ""), "hex");
  const h = createHash("sha1").update(ns).update(name, "utf8").digest();
  h[6] = ((h[6] ?? 0) & 0x0f) | 0x50;
  h[8] = ((h[8] ?? 0) & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export const pointId = (noteId: string, i: number) => uuidv5(`${noteId}#${i}`);
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
