import "server-only";
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

/**
 * Who may reach the dashboard (LIVE-01).
 *
 * - `ANA_ACCESS_MODE` unset: loopback mode. Only requests addressed to this machine are answered (loopback host names
 *   plus DASHBOARD_ALLOWED_HOSTS). This is the localhost prototype behaviour; DNS rebinding sends a foreign Host.
 * - `ANA_ACCESS_MODE=cloudflare`: the deployment sits behind Cloudflare Access. Every request must carry a
 *   `Cf-Access-Jwt-Assertion` whose RS256 signature verifies against the team's published keys, whose issuer is the
 *   team domain and whose audience is the Access application's AUD tag, and whose email is one of ANA_ALLOWED_EMAILS.
 *   The Host header plays no part, so a request that reaches the origin around Cloudflare is refused.
 * - any other value, or cloudflare mode with incomplete configuration: every request is refused (fail closed).
 */

export type AccessDecision = { ok: true; email: string | null } | { ok: false; status: 401 | 403 | 503; reason: string };

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

export function hostnameOf(host: string | null): string | null {
  if (!host) return null;
  try {
    return new URL(`http://${host}`).hostname;
  } catch {
    return null;
  }
}

interface CloudflareConfig {
  issuer: string;
  audience: string;
  allowedEmails: ReadonlySet<string>;
}

type Env = Readonly<Record<string, string | undefined>>;

type ModeConfig = { mode: "loopback" } | { mode: "cloudflare"; config: CloudflareConfig } | { mode: "misconfigured"; reason: string };

export function readAccessConfig(env: Env = process.env): ModeConfig {
  const mode = (env.ANA_ACCESS_MODE ?? "").trim();
  if (mode === "") return { mode: "loopback" };
  if (mode !== "cloudflare") return { mode: "misconfigured", reason: "ANA_ACCESS_MODE must be unset or 'cloudflare'" };
  let issuer: string;
  try {
    const team = new URL((env.CF_ACCESS_TEAM_DOMAIN ?? "").trim());
    if (team.protocol !== "https:" || !team.hostname.endsWith(".cloudflareaccess.com") || team.pathname !== "/") throw new Error();
    issuer = team.origin;
  } catch {
    return { mode: "misconfigured", reason: "CF_ACCESS_TEAM_DOMAIN must be https://<team>.cloudflareaccess.com" };
  }
  const audience = (env.CF_ACCESS_AUD ?? "").trim();
  if (!/^[0-9a-f]{64}$/.test(audience)) return { mode: "misconfigured", reason: "CF_ACCESS_AUD must be the Access application's AUD tag" };
  const emails = (env.ANA_ALLOWED_EMAILS ?? "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  if (emails.length === 0 || emails.some((e) => !/^[a-z0-9._%+-]+@[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/.test(e))) {
    return { mode: "misconfigured", reason: "ANA_ALLOWED_EMAILS must list the allowed email addresses" };
  }
  return { mode: "cloudflare", config: { issuer, audience, allowedEmails: new Set(emails) } };
}

const keySets = new Map<string, JWTVerifyGetKey>();

function keysFor(issuer: string): JWTVerifyGetKey {
  let keys = keySets.get(issuer);
  if (!keys) {
    keys = createRemoteJWKSet(new URL("/cdn-cgi/access/certs", issuer), { timeoutDuration: 5_000, cooldownDuration: 30_000 });
    keySets.set(issuer, keys);
  }
  return keys;
}

/** Test seam: the key source for an issuer (production fetches the team's certs). */
export function setAccessKeysForTest(issuer: string, keys: JWTVerifyGetKey | null): void {
  if (keys) keySets.set(issuer, keys);
  else keySets.delete(issuer);
}

export async function checkAccess(headers: Headers, env: Env = process.env): Promise<AccessDecision> {
  const access = readAccessConfig(env);
  if (access.mode === "misconfigured") return { ok: false, status: 503, reason: access.reason };
  if (access.mode === "loopback") {
    const extra = (env.DASHBOARD_ALLOWED_HOSTS ?? "").split(",").map((h) => hostnameOf(h.trim())).filter((h): h is string => Boolean(h));
    const hostname = hostnameOf(headers.get("host"));
    if (!hostname || !(LOOPBACK.has(hostname) || extra.includes(hostname))) {
      return { ok: false, status: 403, reason: "the dashboard answers only requests addressed to this machine" };
    }
    return { ok: true, email: null };
  }
  const { issuer, audience, allowedEmails } = access.config;
  const token = headers.get("cf-access-jwt-assertion");
  if (!token) return { ok: false, status: 401, reason: "Cloudflare Access assertion missing" };
  try {
    const { payload } = await jwtVerify(token, keysFor(issuer), { issuer, audience, algorithms: ["RS256"], clockTolerance: 30 });
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
    if (!email || !allowedEmails.has(email)) return { ok: false, status: 403, reason: "this identity is not invited" };
    return { ok: true, email };
  } catch {
    return { ok: false, status: 401, reason: "Cloudflare Access assertion invalid" };
  }
}
