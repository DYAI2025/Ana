import "server-only";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { COLOR_RE, isAnaLook, type ManualLook } from "@/features/world/looks";

/**
 * The team's manual look pick for Ana: one small JSON file. On the VPS it lives in the unit's CacheDirectory
 * (systemd sets CACHE_DIRECTORY), the only writable place of the release; WORLD_STATE_DIR overrides it (e2e), and
 * a development server falls back to the system temp directory. Losing the file only means "automatic" again.
 * Nothing about who picked is stored.
 */
export function lookFile(env: Readonly<Record<string, string | undefined>> = process.env): string {
  const dir = env.WORLD_STATE_DIR || env.CACHE_DIRECTORY?.split(":")[0] || os.tmpdir();
  return path.join(dir, "world-ana-look.json");
}

export function parseManual(raw: unknown): ManualLook | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const look = o.look === "auto" || isAnaLook(o.look) ? o.look : null;
  const color = o.color === "auto" || (typeof o.color === "string" && COLOR_RE.test(o.color)) ? o.color : null;
  const setAt = typeof o.set_at === "string" && Number.isFinite(Date.parse(o.set_at)) ? o.set_at : null;
  if (look === null || color === null || setAt === null) return null;
  return { look, color, set_at: setAt };
}

export async function readManual(file: string = lookFile()): Promise<ManualLook | null> {
  try {
    return parseManual(JSON.parse(await fs.readFile(file, "utf8")));
  } catch {
    return null;
  }
}

export async function writeManual(value: ManualLook | null, file: string = lookFile()): Promise<void> {
  if (value === null) {
    await fs.rm(file, { force: true });
    return;
  }
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value), { mode: 0o600 });
  await fs.rename(tmp, file);
}
