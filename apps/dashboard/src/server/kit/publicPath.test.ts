// @vitest-environment node
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { brandLinkToken, isPublicPath } from "./publicPath";

const TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCd"; // 42
const T43 = `${TOKEN}e`;

describe("public paths: only brand links and the static build files pass without the login", () => {
  it("a brand link is exactly /kit/b/<43 base64url characters>", () => {
    expect(T43).toHaveLength(43);
    expect(brandLinkToken(`/kit/b/${T43}`)).toBe(T43);
    expect(isPublicPath(`/kit/b/${T43}`)).toBe(true);
    for (const p of [
      `/kit/b/${TOKEN}`, // too short
      `/kit/b/${T43}x`, // too long
      `/kit/b/${T43}/`,
      `/kit/b/${T43}/extra`,
      `/kit/b/${T43.slice(0, 42)}%`,
      `/kit/b/${T43.slice(0, 42)}.`,
      `/kit/b`,
      `/kit/b/`,
      `/kit`,
      `/kit/c/${T43}`,
      `/x/kit/b/${T43}`,
      `/KIT/b/${T43}`,
    ]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });

  it("static build files pass, nothing else does: no API, no page, no traversal", () => {
    expect(isPublicPath("/_next/static/chunks/abc123.js")).toBe(true);
    expect(isPublicPath("/_next/static/media/ana-savu-banner.2pirhma85_7tu.png")).toBe(true);
    for (const p of [
      "/",
      "/world",
      "/kit",
      "/api/world",
      "/api/social/instagram",
      "/api/healthz",
      "/_next/image",
      "/_next/static",
      "/_next/data/x.json",
      "/_next/static/../../api/world",
      "/_next/static/%2e%2e/api/world",
      "/_next/staticx/a.js",
    ]) {
      expect(isPublicPath(p), p).toBe(false);
    }
  });

  it("the proxy asks isPublicPath before the access check and nothing else skips it", () => {
    const proxy = readFileSync("src/proxy.ts", "utf8");
    expect(proxy).toMatch(/if \(isPublicPath\(request\.nextUrl\.pathname\)\) return NextResponse\.next\(\);\s+const decision = await checkAccess\(request\.headers\);/);
    expect(proxy.match(/NextResponse\.next\(\)/g)).toHaveLength(2);
  });
});
