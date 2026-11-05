/**
 * Brand presets of the media kit (ANA-53): what a brand sees first. An Asia platform sees the engaged audience in
 * India and South-East Asia first; a US insurer sees the followers in the US and UK first. A preset picks the order of
 * the sections, whose audience leads (engaged accounts or followers), the countries that are highlighted, the number
 * tiles and, optionally, the example Reels. More presets come from media-kit.json (config.ts), on top of a built-in.
 */
export const KIT_SECTIONS = ["proof", "numbers", "audience", "reels", "packages"] as const;
export type KitSectionId = (typeof KIT_SECTIONS)[number];

export const KIT_TILES = ["followers", "reach", "views", "engaged", "interactions", "engagement", "watch", "hold"] as const;
export type KitTileId = (typeof KIT_TILES)[number];

export interface KitPreset {
  id: string;
  label: string;
  /** whose countries, ages and genders lead the audience section */
  lead: "engaged" | "followers";
  /** ISO 3166-1 alpha-2 codes of the brand's markets: listed first and highlighted on the map */
  focus: string[];
  /** a name for the focus countries ("US, UK & Europe"); null without focus */
  focus_label: string | null;
  /** the order of the sections between the hero and the button; a section left out is not shown */
  sections: KitSectionId[];
  tiles: KitTileId[];
  /** media ids of the example Reels in this order; empty = the Reels with the most views */
  reels: string[];
}

/** a preset as written in media-kit.json: every field optional, on top of `base` (default: the built-in of the same id, else "default") */
export interface KitPresetInput {
  base?: string;
  label?: string;
  lead?: KitPreset["lead"];
  focus?: string[];
  focus_label?: string;
  sections?: KitSectionId[];
  tiles?: KitTileId[];
  reels?: string[];
}

const ASIA = ["IN", "TH", "ID", "VN", "PH", "MY", "SG", "JP", "KR", "AU", "NZ", "LK", "NP", "BD", "KH", "LA", "MM", "HK", "TW", "CN", "MV"];
const WEST = ["US", "GB", "CA", "IE", "AU", "NZ", "DE", "FR", "NL", "BE", "LU", "ES", "PT", "IT", "CH", "AT", "SE", "NO", "DK", "FI"];

export const BUILT_IN_PRESETS: Readonly<Record<string, KitPreset>> = {
  default: {
    id: "default",
    label: "Overview",
    lead: "engaged",
    focus: [],
    focus_label: null,
    sections: ["proof", "numbers", "audience", "reels", "packages"],
    tiles: ["followers", "reach", "views", "engagement", "watch", "hold"],
    reels: [],
  },
  asia: {
    id: "asia",
    label: "Asia-Pacific & India",
    lead: "engaged",
    focus: ASIA,
    focus_label: "Asia-Pacific & India",
    sections: ["audience", "numbers", "reels", "proof", "packages"],
    tiles: ["reach", "engaged", "views", "engagement", "watch", "hold", "followers"],
    reels: [],
  },
  west: {
    id: "west",
    label: "US, UK & Europe",
    lead: "followers",
    focus: WEST,
    focus_label: "US, UK & Europe",
    sections: ["audience", "numbers", "proof", "reels", "packages"],
    tiles: ["followers", "reach", "engagement", "watch", "hold", "views"],
    reels: [],
  },
};

/** The preset for `?for=`: a config preset on top of its base, a built-in, or the default for anything unknown. */
export function resolvePreset(id: string | null | undefined, custom: Readonly<Record<string, KitPresetInput>> = {}): KitPreset {
  const key = typeof id === "string" ? id.trim().toLowerCase() : "";
  const own = Object.hasOwn(custom, key) ? custom[key] : undefined;
  if (own) {
    // a config preset named like a built-in adjusts that built-in
    const baseId = own.base && Object.hasOwn(BUILT_IN_PRESETS, own.base) ? own.base : Object.hasOwn(BUILT_IN_PRESETS, key) ? key : "default";
    const base = BUILT_IN_PRESETS[baseId]!;
    const focus = own.focus ?? base.focus;
    return {
      id: key,
      label: own.label ?? key,
      lead: own.lead ?? base.lead,
      focus,
      focus_label: focus.length ? (own.focus_label ?? (own.focus ? null : base.focus_label)) : null,
      sections: own.sections ?? base.sections,
      tiles: own.tiles ?? base.tiles,
      reels: own.reels ?? base.reels,
    };
  }
  return Object.hasOwn(BUILT_IN_PRESETS, key) ? BUILT_IN_PRESETS[key]! : BUILT_IN_PRESETS.default!;
}

/** every preset the preview can switch to: the built-ins, then the config's own */
export function presetList(custom: Readonly<Record<string, KitPresetInput>> = {}): Array<{ id: string; label: string }> {
  const ids = [...Object.keys(BUILT_IN_PRESETS), ...Object.keys(custom).filter((k) => !Object.hasOwn(BUILT_IN_PRESETS, k))];
  return ids.map((id) => ({ id, label: resolvePreset(id, custom).label }));
}
