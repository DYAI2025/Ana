import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Response } from "express";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidGrantError, InvalidTokenError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import type { Human } from "../contract/schema.js";
import { sha256hex, writeJsonAtomic, type KeyStore } from "./keys.js";

const ACCESS_TTL = 3600;
const REFRESH_TTL = 30 * 24 * 3600;
const CODE_TTL = 300;

interface TokenRec { kind: "access" | "refresh"; actor: Human; client_id: string; scopes: string[]; expires_at: number; resource?: string }
interface OAuthState { clients: Record<string, OAuthClientInformationFull>; tokens: Record<string, TokenRec> }
interface CodeRec { actor: Human; client_id: string; challenge: string; redirect_uri: string; scopes: string[]; expires_at: number; resource?: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const nowS = () => Math.floor(Date.now() / 1000);

export class BrainOAuthProvider implements OAuthServerProvider {
  private readonly file: string;
  private readonly codes = new Map<string, CodeRec>();

  constructor(stateDir: string, private readonly keys: KeyStore) {
    this.file = path.join(stateDir, "oauth.json");
  }

  private load(): OAuthState {
    return existsSync(this.file) ? (JSON.parse(readFileSync(this.file, "utf8")) as OAuthState) : { clients: {}, tokens: {} };
  }
  private save(s: OAuthState): void {
    const t = nowS();
    for (const [k, v] of Object.entries(s.tokens)) if (v.expires_at < t) delete s.tokens[k];
    writeJsonAtomic(this.file, s);
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (id) => this.load().clients[id],
      registerClient: (client) => {
        const s = this.load();
        const full = { ...client, client_id: randomUUID(), client_id_issued_at: nowS() } as OAuthClientInformationFull;
        s.clients[full.client_id] = full;
        this.save(s);
        return full;
      },
    };
  }

  async authorize(client: OAuthClientInformationFull, params: AuthorizationParams, res: Response): Promise<void> {
    const req = res.req;
    const body = (req.method === "POST" ? req.body : {}) as Record<string, unknown>;
    let error = "";
    if (typeof body.access_key === "string") {
      const actor = this.keys.verify(body.access_key.trim());
      if (actor) {
        const code = randomBytes(32).toString("base64url");
        this.codes.set(sha256hex(code), {
          actor, client_id: client.client_id, challenge: params.codeChallenge, redirect_uri: params.redirectUri,
          scopes: params.scopes ?? [], expires_at: nowS() + CODE_TTL, resource: params.resource?.href,
        });
        const url = new URL(params.redirectUri);
        url.searchParams.set("code", code);
        if (params.state !== undefined) url.searchParams.set("state", params.state);
        res.redirect(302, url.href);
        return;
      }
      error = "Unknown access key.";
    }
    const hidden: Record<string, string | undefined> = {
      client_id: client.client_id, redirect_uri: params.redirectUri, response_type: "code",
      code_challenge: params.codeChallenge, code_challenge_method: "S256", state: params.state,
      scope: params.scopes?.join(" "), resource: params.resource?.href,
    };
    const fields = Object.entries(hidden)
      .filter(([, v]) => v !== undefined && v !== "")
      .map(([k, v]) => `<input type="hidden" name="${k}" value="${esc(v as string)}">`)
      .join("");
    res.status(error ? 401 : 200).set({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'" })
      .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ANA Brain — connect</title><meta name="viewport" content="width=device-width"></head>
<body style="font-family:system-ui;max-width:28rem;margin:4rem auto;padding:0 1rem">
<h1>ANA Brain</h1><p>Connect <strong>${esc(client.client_name ?? client.client_id)}</strong> with your personal access key.</p>
${error ? `<p role="alert" style="color:#b00">${esc(error)}</p>` : ""}
<form method="post" action="authorize">${fields}<label for="k">Personal access key</label><br>
<input id="k" name="access_key" type="password" autocomplete="off" required style="width:100%;margin:.5rem 0"><br>
<button type="submit">Connect</button></form></body></html>`);
  }

  async challengeForAuthorizationCode(_client: OAuthClientInformationFull, code: string): Promise<string> {
    const rec = this.codes.get(sha256hex(code));
    if (!rec) throw new InvalidGrantError("invalid authorization code");
    return rec.challenge;
  }

  async exchangeAuthorizationCode(client: OAuthClientInformationFull, code: string, _verifier?: string, redirectUri?: string): Promise<OAuthTokens> {
    const h = sha256hex(code);
    const rec = this.codes.get(h);
    this.codes.delete(h);
    if (!rec || rec.client_id !== client.client_id || rec.expires_at < nowS()) throw new InvalidGrantError("invalid authorization code");
    if (redirectUri !== undefined && redirectUri !== rec.redirect_uri) throw new InvalidGrantError("redirect_uri mismatch");
    return this.issue(rec.actor, client.client_id, rec.scopes, rec.resource);
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[]): Promise<OAuthTokens> {
    const s = this.load();
    const h = sha256hex(refreshToken);
    const rec = s.tokens[h];
    if (!rec || rec.kind !== "refresh" || rec.client_id !== client.client_id || rec.expires_at < nowS()) throw new InvalidGrantError("invalid refresh token");
    delete s.tokens[h];
    this.save(s);
    return this.issue(rec.actor, client.client_id, scopes ?? rec.scopes, rec.resource);
  }

  private issue(actor: Human, clientId: string, scopes: string[], resource?: string): OAuthTokens {
    const access = randomBytes(32).toString("base64url");
    const refresh = randomBytes(32).toString("base64url");
    const s = this.load();
    s.tokens[sha256hex(access)] = { kind: "access", actor, client_id: clientId, scopes, expires_at: nowS() + ACCESS_TTL, resource };
    s.tokens[sha256hex(refresh)] = { kind: "refresh", actor, client_id: clientId, scopes, expires_at: nowS() + REFRESH_TTL, resource };
    this.save(s);
    return { access_token: access, token_type: "bearer", expires_in: ACCESS_TTL, refresh_token: refresh, scope: scopes.join(" ") || undefined };
  }

  /** Accepts OAuth access tokens and, for CLI clients, personal access keys. */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const actor = this.keys.verify(token);
    if (actor) return { token, clientId: `key:${actor}`, scopes: [], expiresAt: nowS() + ACCESS_TTL, extra: { actor } };
    const rec = this.load().tokens[sha256hex(token)];
    if (!rec || rec.kind !== "access" || rec.expires_at < nowS()) throw new InvalidTokenError("invalid or expired token");
    return { token, clientId: rec.client_id, scopes: rec.scopes, expiresAt: rec.expires_at, extra: { actor: rec.actor } };
  }
}
