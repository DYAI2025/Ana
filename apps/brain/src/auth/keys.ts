import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { HUMANS, type Human } from "../contract/schema.js";

export interface KeyRecord { actor: Human; sha256: string; created_at: string }

export const sha256hex = (s: string) => createHash("sha256").update(s, "utf8").digest("hex");

/** Constant-time comparison of two hex digests. */
export function hashEquals(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, "hex");
  const b = Buffer.from(bHex, "hex");
  return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
}

export function writeJsonAtomic(file: string, data: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  writeFileSync(`${file}.tmp`, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  renameSync(`${file}.tmp`, file);
}

export class KeyStore {
  readonly file: string;
  constructor(stateDir: string) {
    this.file = path.join(stateDir, "keys.json");
  }

  list(): KeyRecord[] {
    return existsSync(this.file) ? (JSON.parse(readFileSync(this.file, "utf8")) as KeyRecord[]) : [];
  }

  /** Generate a new key for a person; returns the raw key (shown once), stores only its hash. */
  issue(actor: string): string {
    if (!(HUMANS as readonly string[]).includes(actor)) throw new Error(`actor must be one of ${HUMANS.join(", ")}`);
    const key = `anab_${randomBytes(32).toString("base64url")}`;
    const rec: KeyRecord = { actor: actor as Human, sha256: sha256hex(key), created_at: new Date().toISOString() };
    writeJsonAtomic(this.file, [...this.list(), rec]);
    return key;
  }

  verify(key: string): Human | undefined {
    if (typeof key !== "string" || key.length < 16 || key.length > 200) return undefined;
    const h = sha256hex(key);
    let found: Human | undefined;
    for (const r of this.list()) if (hashEquals(h, r.sha256) && !found) found = r.actor;
    return found;
  }
}

export class DashboardToken {
  constructor(private readonly stateDir: string, private readonly envHash?: string) {}
  private get file() {
    return path.join(this.stateDir, "dashboard-token.json");
  }
  issue(): string {
    const token = `anad_${randomBytes(32).toString("base64url")}`;
    writeJsonAtomic(this.file, { sha256: sha256hex(token), created_at: new Date().toISOString() });
    return token;
  }
  private hash(): string | undefined {
    if (this.envHash) return this.envHash.toLowerCase();
    return existsSync(this.file) ? (JSON.parse(readFileSync(this.file, "utf8")) as { sha256: string }).sha256 : undefined;
  }
  verify(token: string): boolean {
    const h = this.hash();
    return !!h && typeof token === "string" && token.length >= 16 && hashEquals(sha256hex(token), h);
  }
}
