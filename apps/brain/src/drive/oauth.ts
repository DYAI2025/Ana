import { readFileSync } from "node:fs";

/** The only scope the Brain ever requests or uses. */
export const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";

export interface DriveCredentials { client_id: string; client_secret: string; refresh_token: string }

export class DriveAuthError extends Error {}

/** Load {client_id, client_secret, refresh_token}. Error messages never contain file content. */
export function loadDriveCredentials(file: string): DriveCredentials {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(file, "utf8"));
  } catch {
    throw new DriveAuthError(`cannot read Drive OAuth credentials file ${file}`);
  }
  const c = raw as Partial<Record<keyof DriveCredentials, unknown>>;
  for (const k of ["client_id", "client_secret", "refresh_token"] as const)
    if (typeof c[k] !== "string" || !c[k]) throw new DriveAuthError(`Drive OAuth credentials file ${file} is missing ${k}`);
  return { client_id: c.client_id as string, client_secret: c.client_secret as string, refresh_token: c.refresh_token as string };
}

/** Refresh-token based access token source, cached in memory until expiry - 60 s. */
export class DriveTokenProvider {
  private cached?: { token: string; until: number };
  private inflight?: Promise<string>;

  constructor(private readonly creds: DriveCredentials, private readonly tokenUrl = GOOGLE_TOKEN_URL, private readonly now: () => number = Date.now) {}

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

  private async refresh(): Promise<string> {
    const body = new URLSearchParams({
      grant_type: "refresh_token", client_id: this.creds.client_id, client_secret: this.creds.client_secret, refresh_token: this.creds.refresh_token,
    });
    let res: Response;
    try {
      res = await fetch(this.tokenUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body });
    } catch {
      throw new DriveAuthError("Drive token refresh failed: network error");
    }
    const data = (await res.json().catch(() => ({}))) as { access_token?: unknown; expires_in?: unknown; error?: unknown };
    if (!res.ok || typeof data.access_token !== "string") {
      const code = typeof data.error === "string" && /^[a-z_]{1,40}$/.test(data.error) ? ` (${data.error})` : "";
      throw new DriveAuthError(`Drive token refresh failed: HTTP ${res.status}${code}`);
    }
    const ttl = typeof data.expires_in === "number" ? data.expires_in : 3600;
    this.cached = { token: data.access_token, until: this.now() + Math.max(0, ttl - 60) * 1000 };
    return data.access_token;
  }
}
