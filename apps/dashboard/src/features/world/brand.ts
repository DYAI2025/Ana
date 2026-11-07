import { BRAND } from "../kit/brand";

/**
 * Ana's brand colours for the 3D world (brand guideline v1, assets v3-20261007: read from her "Ana Savu Management"
 * mail template and the original images). Used only where the brand belongs: Ana's office and the sign at its door.
 *
 * Rules from the guideline that the 3D code keeps:
 * - cream is the ground, olive draws lines and carries labels, gold is the rare accent (light, frames, what you can use);
 * - gold never carries text on cream (1.45:1);
 * - flat, no drop shadows.
 */
export const ANA_BRAND = {
  cream: 0xf2efdc,
  gold: 0xdec84f,
  logoOlive: 0x6b621a,
  olive: 0x5f5722,
  black: 0x000000,
} as const;

/** The original banner, the same file the media kit ships (imported, so the standalone build carries it). */
export const ANA_BANNER = BRAND.banner;
