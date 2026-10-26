/**
 * ASADA home tiles (ANA-42, Confluence 07 §2.1). The order is a product decision, not a layout detail.
 * Only `social` is integrated (Instagram through the real adapter); every other tile is honestly
 * "Under Construction": dimmed, non-interactive, without invented numbers or links.
 */
export const TILE_IDS = ["social", "initiatives", "sessions", "knowledge", "community"] as const;
export type TileId = (typeof TILE_IDS)[number];

export interface HomeTile {
  id: TileId;
  /** true only for a tile that opens a real, verified integration */
  active: boolean;
}

export const HOME_TILES: readonly HomeTile[] = [
  { id: "social", active: true },
  { id: "initiatives", active: false },
  { id: "sessions", active: false },
  { id: "knowledge", active: false },
  { id: "community", active: false },
];

/** Channels of the Social Media Business picker, in the decided order; only Instagram has a route. */
export const CHANNELS = [
  { id: "instagram", label: "Instagram", href: "/pulse/social/instagram", monogram: "IG" },
  { id: "substack", label: "Substack", href: null, monogram: "S" },
  { id: "tiktok", label: "TikTok", href: null, monogram: "T" },
  { id: "youtube", label: "YouTube", href: null, monogram: "Y" },
  { id: "facebook", label: "Facebook", href: null, monogram: "F" },
] as const;
export type ChannelId = (typeof CHANNELS)[number]["id"];
