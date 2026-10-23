import { NextResponse, type NextRequest } from "next/server";
import { checkAccess } from "@/server/access";

/**
 * Every page, asset and API request passes the access check before Next.js serves it (LIVE-01). The API routes check
 * again themselves (src/server/http.ts), so a bypass of this layer still reaches no Jira or Instagram data.
 * Only /api/healthz is exempt: it answers a fixed body for the container health check.
 */
export async function proxy(request: NextRequest) {
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
