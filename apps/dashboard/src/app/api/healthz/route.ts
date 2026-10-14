// liveness for the container health check: a fixed body, no data, no credentials, no upstream calls
export const dynamic = "force-dynamic";

export function GET() {
  return new Response("ok", { headers: { "Cache-Control": "no-store", "Content-Type": "text/plain; charset=utf-8" } });
}
