import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import "@fontsource-variable/playfair-display";
import { MediaKit } from "@/features/kit/MediaKit";
import { buildKit } from "@/features/kit/model";
import { checkAccess } from "@/server/access";
import { kitGeo, readKitConfigOnce } from "@/server/kit/config";
import { findLink, isPreviewAgent, readKitLinks, recordOpen } from "@/server/kit/links";
import { worldServiceFromEnv } from "@/server/world/shared";

// live numbers and a fresh link check on every view: never a build-time copy
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const { config } = await readKitConfigOnce();
  return { title: `${config.name ?? "Ana Savu"} · Media Kit`, robots: { index: false, follow: false } };
}

/**
 * A public brand link of the media kit. Reachable without the dashboard login (src/proxy.ts lets only this path and
 * the static build files through); the token must name an active link in kit-links.json, otherwise 404, the same
 * answer for unknown and revoked links. The brand sees the kit of the link's preset: no preview bar, no other
 * presets, no case ids, nothing of the dashboard. An open is counted (views apart from link previews); a team member
 * who is logged in to the dashboard is not counted.
 */
export default async function BrandKitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link = findLink(await readKitLinks(), token);
  if (!link) notFound();
  const h = new Headers(await headers());
  const [world, { config, error }, geo, team] = await Promise.all([worldServiceFromEnv().read(), readKitConfigOnce(), kitGeo(), checkAccess(h)]);
  if (!team.ok) await recordOpen(link.id, isPreviewAgent(h.get("user-agent")));
  const model = buildKit({ world, config, presetId: link.preset, geo, configError: error });
  return <MediaKit model={model} />;
}
