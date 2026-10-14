import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT, type JWK } from "jose";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkAccess, readAccessConfig, setAccessKeysForTest } from "./access";

const ISSUER = "https://ana-test.cloudflareaccess.com";
const AUD = "a".repeat(64);
const env = (extra: Record<string, string> = {}) => ({ ANA_ACCESS_MODE: "cloudflare", CF_ACCESS_TEAM_DOMAIN: ISSUER, CF_ACCESS_AUD: AUD, ANA_ALLOWED_EMAILS: "a@example.test, B@Example.test", ...extra });

let sign: (claims: Record<string, unknown>, opts?: { iss?: string; aud?: string; exp?: string | number; key?: "good" | "foreign" }) => Promise<string>;

beforeAll(async () => {
  const good = await generateKeyPair("RS256");
  const foreign = await generateKeyPair("RS256");
  const jwk: JWK = { ...(await exportJWK(good.publicKey)), kid: "k1", alg: "RS256" };
  setAccessKeysForTest(ISSUER, createLocalJWKSet({ keys: [jwk] }));
  sign = (claims, opts = {}) =>
    new SignJWT(claims)
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer(opts.iss ?? ISSUER)
      .setAudience(opts.aud ?? AUD)
      .setIssuedAt()
      .setExpirationTime(opts.exp ?? "5m")
      .sign(opts.key === "foreign" ? foreign.privateKey : good.privateKey);
});
afterAll(() => setAccessKeysForTest(ISSUER, null));

const headers = (h: Record<string, string>) => new Headers(h);

describe("cloudflare mode", () => {
  it("admits a verified assertion for an invited email (case-insensitive), whatever the Host", async () => {
    const token = await sign({ email: "b@example.test" });
    expect(await checkAccess(headers({ host: "203.0.113.9", "cf-access-jwt-assertion": token }), env())).toEqual({ ok: true, email: "b@example.test" });
  });

  it("refuses a missing assertion even for a loopback Host (no fallback to loopback trust)", async () => {
    expect(await checkAccess(headers({ host: "localhost:3000" }), env())).toMatchObject({ ok: false, status: 401 });
  });

  it("refuses an authenticated but uninvited identity", async () => {
    const token = await sign({ email: "stranger@example.test" });
    expect(await checkAccess(headers({ "cf-access-jwt-assertion": token }), env())).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses an assertion without an email claim (e.g. a service token)", async () => {
    const token = await sign({ common_name: "svc" });
    expect(await checkAccess(headers({ "cf-access-jwt-assertion": token }), env())).toMatchObject({ ok: false, status: 403 });
  });

  it.each([
    ["another application's audience", { aud: "b".repeat(64) }],
    ["another team's issuer", { iss: "https://evil.cloudflareaccess.com" }],
    ["an expired token", { exp: Math.floor(Date.now() / 1000) - 3600 }],
    ["a signature by a foreign key", { key: "foreign" as const }],
  ])("refuses %s", async (_name, opts) => {
    const token = await sign({ email: "a@example.test" }, opts);
    expect(await checkAccess(headers({ "cf-access-jwt-assertion": token }), env())).toMatchObject({ ok: false, status: 401 });
  });

  it("refuses an unsigned (alg none) or garbage assertion", async () => {
    const none = `${btoa(JSON.stringify({ alg: "none" }))}.${btoa(JSON.stringify({ email: "a@example.test", iss: ISSUER, aud: AUD }))}.`;
    for (const token of [none, "garbage"]) {
      expect(await checkAccess(headers({ "cf-access-jwt-assertion": token }), env())).toMatchObject({ ok: false, status: 401 });
    }
  });
});

describe("configuration fails closed", () => {
  it.each([
    ["unknown mode", { ANA_ACCESS_MODE: "open" }],
    ["team domain not cloudflareaccess.com", { CF_ACCESS_TEAM_DOMAIN: "https://evil.example" }],
    ["http team domain", { CF_ACCESS_TEAM_DOMAIN: "http://ana-test.cloudflareaccess.com" }],
    ["missing AUD", { CF_ACCESS_AUD: "" }],
    ["empty invite list", { ANA_ALLOWED_EMAILS: " , " }],
    ["wildcard invite entry", { ANA_ALLOWED_EMAILS: "*@example.test" }],
  ])("%s → 503 for every request", async (_name, extra) => {
    const token = await sign({ email: "a@example.test" });
    expect(await checkAccess(headers({ host: "localhost", "cf-access-jwt-assertion": token }), env(extra))).toMatchObject({ ok: false, status: 503 });
  });

  it("an unset mode is loopback mode", () => {
    expect(readAccessConfig({})).toEqual({ mode: "loopback" });
  });
});

describe("loopback mode (localhost prototype)", () => {
  it("answers loopback hosts and refuses others, pages included", async () => {
    expect(await checkAccess(headers({ host: "127.0.0.1:3000" }), {})).toEqual({ ok: true, email: null });
    expect(await checkAccess(headers({ host: "ana.dyai.cloud" }), {})).toMatchObject({ ok: false, status: 403 });
  });
});

describe("the proxy covers everything but the health check", () => {
  const proxy = readFileSync("src/proxy.ts", "utf8");
  it("matches all paths except /api/healthz", () => {
    expect(proxy).toContain('matcher: "/((?!api/healthz$).*)"');
    expect(proxy).toMatch(/await checkAccess\(request\.headers\)/);
  });
  it("the health route returns a fixed body and reads no environment", () => {
    const route = readFileSync("src/app/api/healthz/route.ts", "utf8");
    expect(route).not.toMatch(/process\.env|fetch\(/);
  });
});
