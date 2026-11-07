import banner from "./brand/ana-savu-banner.png";
import logo from "./brand/ana-savu-logo.png";
import instagram from "./brand/icon-instagram-kachel.png";

/**
 * Ana Savu's brand assets for the media kit (brand guideline v1, Nov 2026, derived from the Zoho template
 * "Ana Savu Management", assets v3-20261007). The original files, never re-set or recoloured: the guideline forbids
 * redrawing the logo. Imported, so the build ships them with .next/static (the standalone image has no public/).
 */
type Asset = string | { src: string };
// Next's static import gives { src, width, height }; Vite (the unit tests) gives the URL string
const url = (a: Asset): string => (typeof a === "string" ? a : a.src);

export const BRAND = {
  /** 1200 × 360: gold/cream stripes, the wordmark, "MANAGEMENT", "TRAVEL • LIFESTYLE • STORYTELLING"; shown at most 600 px wide (2×) */
  banner: { src: url(banner), width: 1200, height: 360 },
  /** 352 × 352: the wordmark in the gold ring */
  logo: { src: url(logo), width: 352, height: 352 },
  /** 64 × 64, cream: for numbers on olive tiles */
  icons: { instagram: url(instagram) },
  /** the guideline's signature line */
  sender: "Ana Savu Management",
  senderLine: "Brand partnerships, campaigns and press",
} as const;
