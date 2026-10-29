import { sign } from "node:crypto";
import { readFileSync } from "node:fs";

/** The only scope the Brain ever requests or uses. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const JWT_BEARER = "urn:ietf:params:oauth:grant-type:jwt-bearer";
/** Longest assertion lifetime Google accepts. */
const ASSERTION_TTL_S = 3600;

/**
 * The ANA Brain service account (PO decision 2): it sees only what is shared with it (the ANA Evidence Root).
 * No personal Google identity and no long-lived refresh token is involved.
 */
export interface ServiceAccountKey { client_email: string; private_key: string; private_key_id?: string }

export class DriveAuthError extends Error {}

/** Load a Google service-account JSON key. Error messages never contain file content. */
export function loadServiceAccountKey(file: string): ServiceAccountKey {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new DriveAuthError(`cannot read Drive service-account key file ${file}`);
  }
  const k = raw as Record<string, unknown>;
  if (k.type !== "service_account") throw new DriveAuthError(`${file} is not a service-account key (personal OAuth credentials are not accepted)`);
  for (const f of ["client_email", "private_key"] as const)
    if (typeof k[f] !== "string" || !k[f]) throw new DriveAuthError(`Drive service-account key file ${file} is missing ${f}`);
  const key: ServiceAccountKey = { client_email: k.client_email as string, private_key: k.private_key as string };
  if (typeof k.private_key_id === "string" && k.private_key_id) key.private_key_id = k.private_key_id;
  return key;
}

const b64url = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");

/** Service-account access token source (OAuth 2.0 JWT-bearer grant, RFC 7523), cached in memory until expiry - 60 s. */
export class DriveTokenProvider {
  private cached?: { token: string; until: number };
  private inflight?: Promise<string>;

  constructor(private readonly key: ServiceAccountKey, private readonly tokenUrl = GOOGLE_TOKEN_URL, private readonly now: () => number = Date.now) {}

  async accessToken(): Promise<string> {
    if (this.cached && this.now() < this.cached.until) return this.cached.token;
    this.inflight ??= this.refresh().finally(() => {
      this.inflight = undefined;
    });
    return this.inflight;
  }

  /** Drop the cached token (e.g. after a 401). */
  invalidate(): void {
    this.cached = undefined;
  }

  /** RS256 assertion as the service account itself: no `sub`, so no user is impersonated. */
  private assertion(): string {
    const iat = Math.floor(this.now() / 1000);
    const header = { alg: "RS256", typ: "JWT", ...(this.key.private_key_id ? { kid: this.key.private_key_id } : {}) };
    const claims = { iss: this.key.client_email, scope: DRIVE_SCOPE, aud: this.tokenUrl, iat, exp: iat + ASSERTION_TTL_S };
    const input = `${b64url(header)}.${b64url(claims)}`;
    let signature: Buffer;
    try {
      signature = sign("sha256", Buffer.from(input), this.key.private_key);
    } catch {
      throw new DriveAuthError("Drive service-account key cannot sign (malformed private_key)");
    }
    return `${input}.${signature.toString("base64url")}`;
  }

  private async refresh(): Promise<string> {
    const body = new URLSearchParams({ grant_type: JWT_BEARER, assertion: this.assertion() });
    let res: Response;
    try {
      res = await fetch(this.tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    } catch {
      throw new DriveAuthError("Drive token request failed: network error");
    }
    const data = (await res.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown; error?: unknown };
    if (!res.ok || typeof data.access_token !== "string") {
      const code = typeof data.error === "string" && /^[a-z_]{1,40}$/.test(data.error) ? ` (${data.error})` : "";
      throw new DriveAuthError(`Drive token request failed: HTTP ${res.status}${code}`);
    }
    const ttl = typeof data.expires_in === "number" ? data.expires_in : 3600;
    this.cached = { token: data.access_token, until: this.now() + Math.max(0, ttl - 60) * 1000 };
    return data.access_token;
  }
}
