import { randomBytes, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { Response } from "express";
import type { OAuthRegisteredClientsStore } from "@modelcontextprotocol/sdk/server/auth/clients.js";
import type { AuthorizationParams, OAuthServerProvider } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { InvalidClientMetadataError, InvalidGrantError, InvalidTokenError, TooManyRequestsError } from "@modelcontextprotocol/sdk/server/auth/errors.js";
import type { OAuthClientInformationFull, OAuthTokens } from "@modelcontextprotocol/sdk/shared/auth.js";
import { isHuman, type Human } from "../contract/schema.js";
import { actorError, isKeyActor, KeyStore, sha256hex, writeJsonAtomic } from "./keys.js";

const ACCESS_TTL = 3600;
const REFRESH_TTL = 30 * 24 * 3600;
const CODE_TTL = 300;
const MAX_CLIENT_BYTES = 8192;
const MAX_CLIENT_DEPTH = 8;
const MAX_CLIENTS = 100;

/** key_sha256: the personal key that authorized the grant; the token dies with that key (B-7). */
interface TokenRec { kind: "access" | "refresh"; actor: Human; key_sha256?: string; client_id: string; scopes: string[]; expires_at: number; resource?: string }
interface OAuthState { clients: Record<string, OAuthClientInformationFull>; tokens: Record<string, TokenRec> }
interface CodeRec { actor: Human; key_sha256: string; client_id: string; challenge: string; redirect_uri: string; scopes: string[]; expires_at: number; resource?: string }

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const nowS = () => Math.floor(Date.now() / 1000);

/** Stops at `max`, so a hostile nesting depth costs at most `max` stack frames. */
function nestedDeeperThan(v: unknown, max: number): boolean {
  if (v === null || typeof v !== "object") return false;
  if (max === 0) return true;
  return Object.values(v).some((x) => nestedDeeperThan(x, max - 1));
}

/**
 * CSP source for the client's redirect: its origin, or the bare scheme where no host-source can name it: a custom-scheme
 * (native app) redirect, or an IPv6 literal such as the RFC 8252 loopback `http://[::1]:<port>` (CSP host-source has no
 * IPv6 syntax; Chromium drops `http://[::1]:8123` as an invalid source and blocks the redirect).
 */
function redirectSource(redirectUri: string): string {
  const u = new URL(redirectUri);
  return u.origin === "null" || u.hostname.startsWith("[") ? u.protocol : u.origin;
}

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
    for (const [k, v] of Object.entries(s.tokens)) if (v.expires_at < t || !this.bound(v)) delete s.tokens[k];
    writeJsonAtomic(this.file, s);
  }

  /** A token is valid only while the key that authorized it is still issued; unbound (pre-B-7) tokens never are. */
  private bound(rec: { key_sha256?: string }): boolean {
    return typeof rec.key_sha256 === "string" && this.keys.has(rec.key_sha256);
  }

  /** Delete every OAuth token of a person; returns how many were deleted. */
  revokeTokensOf(actor: Human): number {
    const s = this.load();
    const before = Object.keys(s.tokens).length;
    for (const [k, v] of Object.entries(s.tokens)) if (v.actor === actor) delete s.tokens[k];
    const removed = before - Object.keys(s.tokens).length;
    writeJsonAtomic(this.file, s);
    return removed;
  }

  get clientsStore(): OAuthRegisteredClientsStore {
    return {
      getClient: (id) => this.load().clients[id],
      // /register is public and needs no credential: bound the size of each client and the size of the registry
      registerClient: (client) => {
        // measured as stored: oauth.json is indented, and indentation grows with nesting depth, so depth is capped first
        if (nestedDeeperThan(client, MAX_CLIENT_DEPTH)) throw new InvalidClientMetadataError(`client metadata is nested deeper than ${MAX_CLIENT_DEPTH} levels`);
        if (JSON.stringify(client, null, 2).length > MAX_CLIENT_BYTES) throw new InvalidClientMetadataError(`client metadata exceeds ${MAX_CLIENT_BYTES} bytes`);
        const s = this.load();
        const t = nowS();
        const live = new Set([...Object.values(s.tokens).filter((v) => v.expires_at >= t).map((v) => v.client_id), ...[...this.codes.values()].map((c) => c.client_id)]);
        // oldest first; ties keep registration order (stable sort over insertion-ordered keys)
        const idle = Object.values(s.clients).filter((c) => !live.has(c.client_id)).sort((a, b) => (a.client_id_issued_at ?? 0) - (b.client_id_issued_at ?? 0));
        while (Object.keys(s.clients).length >= MAX_CLIENTS && idle.length > 0) delete s.clients[idle.shift()!.client_id];
        if (Object.keys(s.clients).length >= MAX_CLIENTS) throw new TooManyRequestsError("client registry is full");
        const full = { ...client, client_id: randomUUID(), client_id_issued_at: t } as OAuthClientInformationFull;
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
      const key = body.access_key.trim();
      const keyActor = this.keys.verify(key);
      // the browser login hands out tokens for people only; an agent key is a bearer key on /mcp and nothing else
      const actor = keyActor && isHuman(keyActor) ? keyActor : undefined;
      if (actor) {
        const code = randomBytes(32).toString("base64url");
        this.codes.set(sha256hex(code), {
          actor, key_sha256: sha256hex(key), client_id: client.client_id, challenge: params.codeChallenge, redirect_uri: params.redirectUri,
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
    // form-action also governs the redirect that answers the POST: without the client's origin the browser blocks the
    // 302 to redirect_uri and the code never reaches the client
    const target = redirectSource(params.redirectUri);
    const csp = `default-src 'none'; style-src 'unsafe-inline'; form-action 'self' ${target}`;
    const destination = new URL(params.redirectUri).host || target;
    res.status(error ? 401 : 200).set({ "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-frame-options": "DENY", "content-security-policy": csp })
      .send(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>ANA Brain — connect</title><meta name="viewport" content="width=device-width"></head>
<body style="font-family:system-ui;max-width:28rem;margin:4rem auto;padding:0 1rem">
<h1>ANA Brain</h1><p>Connect <strong>${esc(client.client_name ?? client.client_id)}</strong> with your personal access key.</p>
<p>After you connect, access is handed to <strong>${esc(destination)}</strong>. Only continue if that is the app you are connecting.</p>
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
    if (!rec || rec.client_id !== client.client_id || rec.expires_at < nowS() || !this.bound(rec)) throw new InvalidGrantError("invalid authorization code");
    if (redirectUri !== undefined && redirectUri !== rec.redirect_uri) throw new InvalidGrantError("redirect_uri mismatch");
    return this.issue(rec.actor, rec.key_sha256, client.client_id, rec.scopes, rec.resource);
  }

  async exchangeRefreshToken(client: OAuthClientInformationFull, refreshToken: string, scopes?: string[]): Promise<OAuthTokens> {
    const s = this.load();
    const h = sha256hex(refreshToken);
    const rec = s.tokens[h];
    if (!rec || rec.kind !== "refresh" || rec.client_id !== client.client_id || rec.expires_at < nowS() || !this.bound(rec))
      throw new InvalidGrantError("invalid refresh token");
    delete s.tokens[h];
    this.save(s);
    return this.issue(rec.actor, rec.key_sha256!, client.client_id, scopes ?? rec.scopes, rec.resource);
  }

  private issue(actor: Human, keySha256: string, clientId: string, scopes: string[], resource?: string): OAuthTokens {
    const access = randomBytes(32).toString("base64url");
    const refresh = randomBytes(32).toString("base64url");
    const s = this.load();
    s.tokens[sha256hex(access)] = { kind: "access", actor, key_sha256: keySha256, client_id: clientId, scopes, expires_at: nowS() + ACCESS_TTL, resource };
    s.tokens[sha256hex(refresh)] = { kind: "refresh", actor, key_sha256: keySha256, client_id: clientId, scopes, expires_at: nowS() + REFRESH_TTL, resource };
    this.save(s);
    return { access_token: access, token_type: "bearer", expires_in: ACCESS_TTL, refresh_token: refresh, scope: scopes.join(" ") || undefined };
  }

  /** Accepts OAuth access tokens and, for CLI clients, personal access keys. */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    const actor = this.keys.verify(token);
    if (actor) return { token, clientId: `key:${actor}`, scopes: [], expiresAt: nowS() + ACCESS_TTL, extra: { actor } };
    const rec = this.load().tokens[sha256hex(token)];
    if (!rec || rec.kind !== "access" || rec.expires_at < nowS() || !this.bound(rec)) throw new InvalidTokenError("invalid or expired token");
    return { token, clientId: rec.client_id, scopes: rec.scopes, expiresAt: rec.expires_at, extra: { actor: rec.actor } };
  }
}

/** `revoke-key <actor>`: every key and OAuth token of one person; effective at their next request, no restart. */
export function revokeActor(stateDir: string, actor: string): { keys: number; tokens: number } {
  if (!isKeyActor(actor)) throw actorError();
  const ks = new KeyStore(stateDir);
  const keys = ks.revoke(actor);
  // agents never hold OAuth tokens
  return { keys, tokens: isHuman(actor) ? new BrainOAuthProvider(stateDir, ks).revokeTokensOf(actor) : 0 };
}
