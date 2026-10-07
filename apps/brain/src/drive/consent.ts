import { createHash, randomBytes } from "node:crypto";
import { chmodSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { DRIVE_SCOPE, GOOGLE_TOKEN_URL } from "./oauth.js";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

export interface ConsentOptions {
  clientFile: string;
  outFile: string;
  force?: boolean;
  /** Called with the consent URL (contains no secret). */
  openUrl: (url: string) => void;
  authUrl?: string;
  tokenUrl?: string;
  timeoutMs?: number;
}

/** Read a Google "Desktop app" client_secret.json ({installed:{...}}) or a flat {client_id, client_secret}. */
export function loadClient(file: string): { client_id: string; client_secret: string } {
  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    throw new Error(`cannot read OAuth client file ${file}`);
  }
  const c = ((raw.installed ?? raw.web ?? raw) as Record<string, unknown>) ?? {};
  if (typeof c.client_id !== "string" || typeof c.client_secret !== "string") throw new Error(`OAuth client file ${file} has no client_id/client_secret`);
  return { client_id: c.client_id, client_secret: c.client_secret };
}

const b64url = (b: Buffer) => b.toString("base64url");

/**
 * Installed-app loopback consent (PKCE S256 + state). Writes {client_id, client_secret, refresh_token}
 * to outFile with mode 0600. Returns the granted scope. Never prints or returns tokens.
 */
export async function runConsent(o: ConsentOptions): Promise<{ scope: string }> {
  if (existsSync(o.outFile) && !o.force) throw new Error(`${o.outFile} exists; pass --force to overwrite`);
  const client = loadClient(o.clientFile);
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const state = b64url(randomBytes(24));

  const server = createServer();
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const redirectUri = `http://127.0.0.1:${(server.address() as AddressInfo).port}/callback`;
  try {
    const codePromise = new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timed out waiting for consent")), o.timeoutMs ?? 300_000);
      server.on("request", (req, res) => {
        const u = new URL(req.url ?? "/", redirectUri);
        if (u.pathname !== "/callback") return void res.writeHead(404).end();
        const done = (msg: string) => res.writeHead(200, { "content-type": "text/plain; charset=utf-8" }).end(msg);
        if (u.searchParams.get("state") !== state) {
          done("State mismatch. You can close this window.");
          return;
        }
        clearTimeout(timer);
        const code = u.searchParams.get("code");
        if (!code) {
          done("Consent was not granted. You can close this window.");
          reject(new Error(`consent failed: ${(u.searchParams.get("error") ?? "no code").slice(0, 60)}`));
          return;
        }
        done("ANA Brain: consent received. You can close this window.");
        resolve(code);
      });
    });
    const url = new URL(o.authUrl ?? GOOGLE_AUTH_URL);
    for (const [k, v] of Object.entries({
      client_id: client.client_id, redirect_uri: redirectUri, response_type: "code", scope: DRIVE_SCOPE,
      access_type: "offline", prompt: "consent", code_challenge: challenge, code_challenge_method: "S256", state,
    })) url.searchParams.set(k, v);
    o.openUrl(url.toString());
    const code = await codePromise;

    const res = await fetch(o.tokenUrl ?? GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri, client_id: client.client_id, client_secret: client.client_secret }),
    });
    const data = (await res.json().catch(() => ({}))) as { refresh_token?: unknown; scope?: unknown; error?: unknown };
    if (!res.ok) throw new Error(`token exchange failed: HTTP ${res.status}${typeof data.error === "string" && /^[a-z_]{1,40}$/.test(data.error) ? ` (${data.error})` : ""}`);
    if (typeof data.refresh_token !== "string") throw new Error("token exchange returned no refresh token (revoke the app grant and retry; prompt=consent is set)");
    const scope = typeof data.scope === "string" ? data.scope : DRIVE_SCOPE;
    if (scope.split(" ").some((s) => s !== DRIVE_SCOPE)) throw new Error(`unexpected scope granted: ${scope.slice(0, 200)}`);
    const payload = `${JSON.stringify({ client_id: client.client_id, client_secret: client.client_secret, refresh_token: data.refresh_token }, null, 2)}\n`;
    writeFileSync(o.outFile, payload, { mode: 0o600, flag: o.force ? "w" : "wx" });
    chmodSync(o.outFile, 0o600);
    return { scope };
  } finally {
    server.close();
  }
}
