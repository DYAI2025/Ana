import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import "@fontsource-variable/playfair-display";
import { MediaKit } from "@/features/kit/MediaKit";
import { buildKit } from "@/features/kit/model";
import { checkAccess } from "@/server/access";
import { kitGeo, readKitConfigOnce } from "@/server/kit/config";
import { readKitLinks, readOpens } from "@/server/kit/links";
import { worldServiceFromEnv } from "@/server/world/shared";

// live numbers on every view: never a build-time copy
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { config } = await readKitConfigOnce();
  return { title: `${config.name ?? "Ana Savu"} · Media Kit`, robots: { index: false, follow: false } };
}

/**
 * The media kit (ANA-53), slice 1: an internal preview behind the dashboard's access gate. Rendered on the server
 * from the world snapshot, so the page carries only the kit's aggregated numbers (never /api/world's payload).
 * `?for=<preset>` picks what a brand sees first (features/kit/presets.ts).
 */
export default async function KitPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const access = await checkAccess(new Headers(await headers()));
  if (!access.ok) notFound();
  const params = await searchParams;
  const raw = params.for;
  const presetId = Array.isArray(raw) ? raw[0] : raw;
  const [world, { config, error }, geo, links, opens] = await Promise.all([worldServiceFromEnv().read(), readKitConfigOnce(), kitGeo(), readKitLinks(), readOpens()]);
  const model = buildKit({ world, config, presetId, geo, configError: error });
  // the team finds the public brand links here, with how often each was opened (only behind the login)
  const rows = links.map((l) => ({ id: l.id, label: l.label, preset: l.preset, path: `/kit/b/${l.token}`, revoked: l.revoked, views: opens[l.id]?.views ?? 0, previews: opens[l.id]?.previews ?? 0, last_view_at: opens[l.id]?.last_view_at ?? null }));
  return <MediaKit model={model} preview links={rows} />;
}
