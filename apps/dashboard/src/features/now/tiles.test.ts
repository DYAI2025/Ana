import { CHANNELS, HOME_TILES, TILE_IDS } from "./tiles";

describe("ASADA home tiles (UI01-AC02 / UI01-AC04)", () => {
  it("keeps the decided order: Social Media Business → Initiatives → Sessions → Knowledge → Community", () => {
    expect(HOME_TILES.map((t) => t.id)).toEqual(["social", "initiatives", "sessions", "knowledge", "community"]);
    expect(TILE_IDS).toEqual(HOME_TILES.map((t) => t.id));
  });

  it("has exactly one active tile, and it is Social Media Business", () => {
    expect(HOME_TILES.filter((t) => t.active).map((t) => t.id)).toEqual(["social"]);
  });
});

describe("Social Media Business channels (UI02-AC02 / UI02-AC03)", () => {
  it("lists Instagram, Substack, TikTok, YouTube, Facebook in that order", () => {
    expect(CHANNELS.map((c) => c.label)).toEqual(["Instagram", "Substack", "TikTok", "YouTube", "Facebook"]);
  });

  it("routes only Instagram, to the existing cockpit", () => {
    expect(CHANNELS.filter((c) => c.href !== null).map((c) => [c.id, c.href])).toEqual([["instagram", "/pulse/social/instagram"]]);
  });
});
