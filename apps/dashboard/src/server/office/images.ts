import "server-only";
import sharp from "sharp";

/**
 * Pictures on Office Berlin tickets. The file's real content decides what it is (sharp reads the bytes), never its
 * name or the browser's claim. Only PNG, JPEG and WebP pass. Every picture is re-encoded: turned upright, shrunk to at
 * most 2000 px on the long edge and saved as WebP, plus a 400 px thumbnail. Re-encoding also drops all metadata
 * (EXIF, GPS position of a phone photo), so no location leaves Ana's phone through a screenshot or photo.
 */

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const MAX_EDGE = 2000;
export const THUMB_EDGE = 400;
const ALLOWED = new Set(["png", "jpeg", "webp"]);
const PIXEL_LIMIT = 60_000_000;

export interface ProcessedImage {
  full: Buffer;
  thumb: Buffer;
  width: number;
  height: number;
}

export async function processImage(bytes: Buffer): Promise<ProcessedImage | null> {
  const open = () => sharp(bytes, { failOn: "error", limitInputPixels: PIXEL_LIMIT });
  try {
    const meta = await open().metadata();
    if (!meta.format || !ALLOWED.has(meta.format)) return null;
    const fit = (edge: number) => ({ width: edge, height: edge, fit: "inside" as const, withoutEnlargement: true });
    const full = await open().rotate().resize(fit(MAX_EDGE)).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
    const thumb = await open().rotate().resize(fit(THUMB_EDGE)).webp({ quality: 75 }).toBuffer();
    return { full: full.data, thumb, width: full.info.width, height: full.info.height };
  } catch {
    return null;
  }
}
