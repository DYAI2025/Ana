import { NextResponse, type NextRequest } from "next/server";
import { checkAccess } from "@/server/access";
import { isPublicPath } from "@/server/kit/publicPath";

/**
 * Every page, asset and API request passes the access check before Next.js serves it (LIVE-01). The API routes check
 * again themselves (src/server/http.ts), so a bypass of this layer still reaches no Jira or Instagram data.
 * Exempt: /api/healthz (matcher; a fixed body for the container health check) and the media kit's public brand links
 * with the static build files they need (src/server/kit/publicPath.ts). A brand-link page checks its token itself and
 * answers 404 for an unknown or revoked one.
 */
export async function proxy(request: NextRequest) {
  if (isPublicPath(request.nextUrl.pathname)) return NextResponse.next();
  const decision = await checkAccess(request.headers);
  if (decision.ok) return NextResponse.next();
  return new NextResponse(decision.status === 503 ? "Access is not configured." : "Not authorized.", {
    status: decision.status,
    headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" },
  });
}

export const config = {
  matcher: "/((?!api/healthz$).*)",
};
