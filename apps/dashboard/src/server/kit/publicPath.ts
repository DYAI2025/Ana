/**
 * The only paths a request may reach without the dashboard's access check (media kit, public brand links):
 *
 * - `/kit/b/<token>`: one brand link. The token is 32 random bytes in base64url (43 characters); the page itself checks
 *   it against kit-links.json and answers 404 for an unknown or revoked one, so the path alone opens nothing.
 * - `/_next/static/…`: the build's hashed CSS, JS, fonts and images the brand page needs. They hold no data and no
 *   secret (the repository is public and scripts/scan-client-bundle.mjs checks the bundle in CI).
 *
 * Everything else, every API route included, still needs a valid Cloudflare Access assertion. Pure (no fs, no
 * server-only), so the proxy, the page and the tests share one definition.
 */
export const KIT_TOKEN = /^[A-Za-z0-9_-]{43}$/;

const BRAND_LINK = /^\/kit\/b\/([A-Za-z0-9_-]{43})$/;

/** the token of a brand-link path, or null for any other path */
export function brandLinkToken(pathname: string): string | null {
  const m = BRAND_LINK.exec(pathname);
  return m ? m[1]! : null;
}

export function isPublicPath(pathname: string): boolean {
  if (brandLinkToken(pathname)) return true;
  // hashed build output only; no "..", no encoded separators (Next has decoded and normalised the path already)
  return pathname.startsWith("/_next/static/") && !pathname.includes("..") && !pathname.includes("%");
}
