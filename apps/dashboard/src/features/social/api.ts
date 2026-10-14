/** Browser side of the Social API. The browser never talks to the Instagram worker and never holds its key. */
import type { SocialResult } from "./types";

/** Above the server's worker timeout (45 s default), so the server always answers first. */
export const SOCIAL_DEADLINE_MS = 60_000;

function isResult(body: unknown): body is SocialResult {
  if (typeof body !== "object" || body === null) return false;
  const b = body as { ok?: unknown; snapshot?: unknown; failure?: { code?: unknown } };
  return b.ok === true ? typeof b.snapshot === "object" && b.snapshot !== null : b.ok === false && typeof b.failure?.code === "string";
}

export async function fetchInstagram(refresh = false): Promise<SocialResult> {
  try {
    const response = await fetch(`/api/social/instagram${refresh ? "?refresh=1" : ""}`, { cache: "no-store", signal: AbortSignal.timeout(SOCIAL_DEADLINE_MS) });
    const body: unknown = await response.json();
    return isResult(body) ? body : { ok: false, failure: { state: "ERROR", code: "invalid-response" } };
  } catch {
    return { ok: false, failure: { state: "ERROR", code: "unavailable", detail: "The dashboard server did not answer" } };
  }
}
