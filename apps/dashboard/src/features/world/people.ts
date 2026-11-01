/**
 * The three people of the world and the work they own. Avatar parameters were set by hand from reference photos the
 * team supplied on 2026-10-31 (consent given by Ben for all three); no photo is stored anywhere in this repository.
 * Colours are 0xRRGGBB. Everything here is public-safe: no place, no contact, no private data.
 */

export type WorldPersonId = "ana" | "ben" | "vince";

export type HairStyle = "long-wavy" | "swept-back" | "buzz";
export type Outfit = "sundress" | "open-shirt" | "tee" | "mermaid";
export type Prop = "coconut" | "laptop" | "phone" | "none";

export interface AvatarSpec {
  skin: number;
  /** cheek / shadow tint on the skin */
  blush: number;
  eyes: number;
  hair: { style: HairStyle; color: number; shine: number };
  beard: { full: boolean; color: number; grey: number } | null;
  moustache: number | null;
  stubble: boolean;
  outfit: { kind: Outfit; primary: number; secondary: number };
  sunglassesOnHead: boolean;
  bracelet: boolean;
  necklace: boolean;
  armTattoo: boolean;
  prop: Prop;
  /** a scooter helmet in this colour */
  helmet?: number;
  /** relative body height (1 = Ben) and shoulder width */
  height: number;
  shoulders: number;
}

export interface WorldPerson {
  id: WorldPersonId;
  name: string;
  /** css tint of the dashboard person token (globals.css --person-*) for chips; never colour alone */
  tint: string;
  avatar: AvatarSpec;
}

export const PEOPLE: Readonly<Record<WorldPersonId, WorldPerson>> = {
  ana: {
    id: "ana",
    name: "Ana",
    tint: "#c996a2",
    avatar: {
      skin: 0xf3c9a8,
      blush: 0xf09a8c,
      eyes: 0x4a2c1c,
      hair: { style: "long-wavy", color: 0x6e3f22, shine: 0xa8673a },
      beard: null,
      moustache: null,
      stubble: false,
      // blue-and-white gingham strapless sundress
      outfit: { kind: "sundress", primary: 0x34508f, secondary: 0xf4f6fb },
      sunglassesOnHead: true,
      bracelet: true,
      necklace: false,
      armTattoo: false,
      prop: "coconut",
      height: 0.9,
      shoulders: 0.86,
    },
  },
  ben: {
    id: "ben",
    name: "Ben",
    tint: "#afa6cc",
    avatar: {
      skin: 0xe8b693,
      blush: 0xe08d78,
      eyes: 0x5f7f8c,
      hair: { style: "swept-back", color: 0x5b4836, shine: 0x8c7258 },
      // full salt-and-pepper beard
      beard: { full: true, color: 0x7a6a58, grey: 0xc9c2b6 },
      moustache: null,
      stubble: false,
      outfit: { kind: "open-shirt", primary: 0x24272d, secondary: 0x3a3f47 },
      sunglassesOnHead: false,
      bracelet: false,
      necklace: false,
      armTattoo: false,
      prop: "laptop",
      height: 1,
      shoulders: 1,
    },
  },
  vince: {
    id: "vince",
    name: "Vince",
    tint: "#ceb394",
    avatar: {
      skin: 0xf0c3a2,
      blush: 0xe89580,
      eyes: 0x3d2a1e,
      hair: { style: "buzz", color: 0x3a291e, shine: 0x5a4434 },
      beard: null,
      moustache: 0x3a291e,
      stubble: true,
      outfit: { kind: "tee", primary: 0x1c1d22, secondary: 0x2c2e35 },
      sunglassesOnHead: false,
      bracelet: false,
      necklace: true,
      armTattoo: true,
      prop: "phone",
      height: 0.98,
      shoulders: 1.12,
    },
  },
};

export type ProjectShape = "screen" | "film" | "crystal" | "bubble" | "browser" | "globe";

export interface WorldProject {
  id: string;
  owner: WorldPersonId;
  /** i18n key under world.projects */
  nameKey: "lumen" | "destill" | "knowledge" | "brand" | "website" | "world";
  shape: ProjectShape;
  /** Jira issues that carry this project's state; empty = no source exists yet */
  jiraKeys: readonly string[];
}

/** Work the world shows. Status comes only from Jira; without a key or a Jira connection the station says so. */
export const PROJECTS: readonly WorldProject[] = [
  { id: "lumen", owner: "ben", nameKey: "lumen", shape: "screen", jiraKeys: ["ANA-39", "ANA-42", "ANA-46"] },
  { id: "destill", owner: "ben", nameKey: "destill", shape: "film", jiraKeys: ["ANA-47"] },
  { id: "knowledge", owner: "ben", nameKey: "knowledge", shape: "crystal", jiraKeys: ["ANA-35", "ANA-45"] },
  { id: "world", owner: "ben", nameKey: "world", shape: "globe", jiraKeys: ["ANA-48"] },
  { id: "brand", owner: "vince", nameKey: "brand", shape: "bubble", jiraKeys: [] },
  { id: "website", owner: "vince", nameKey: "website", shape: "browser", jiraKeys: [] },
];

/** Berlin office (Ben and Vince). Public city coordinates. */
export const BERLIN = { lat: 52.52, lon: 13.405 } as const;
