/**
 * Ana's look in the world (client-safe). The avatar wears one look from a fixed catalogue and follows Ana's newest
 * Instagram post: a caption that names a scooter or a mermaid picks that look; otherwise a Claude vision model reads
 * the post's cover image (server side, when configured) for the look and the colours of her clothes. A plain pixel
 * estimate was tried first and was right on only about 3 of 8 real covers, so there is no estimate without the model.
 * Anyone on the team can pick a look and a colour; a pick holds until Ana publishes a newer post, then the automatic
 * look takes over again. Sleeping is not a look: Ana sleeps whenever it is night where she is.
 */

export const ANA_LOOKS = ["everyday", "scooter", "mermaid"] as const;
export type AnaLookId = (typeof ANA_LOOKS)[number];

export function isAnaLook(v: unknown): v is AnaLookId {
  return typeof v === "string" && (ANA_LOOKS as readonly string[]).includes(v);
}

export interface OutfitColors {
  /** 0xRRGGBB */
  primary: number;
  secondary: number;
}

/**
 * What Ana does by day in the world. Not data: a random pick every 20 minutes, the same for every viewer (it follows
 * the clock), unless her newest post names the scooter (then she rides for 2 hours) or the team picks one by hand.
 */
export const ANA_ACTIVITIES = ["scooter", "eating", "selfie", "dancing", "reading"] as const;
export type AnaActivity = (typeof ANA_ACTIVITIES)[number];

export function isAnaActivity(v: unknown): v is AnaActivity {
  return typeof v === "string" && (ANA_ACTIVITIES as readonly string[]).includes(v);
}

export const ACTIVITY_SLOT_MS = 20 * 60_000;
export const POST_ACTIVITY_MS = 2 * 3_600_000;

function mix(n: number): number {
  let x = (n ^ 0x9e3779b9) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35) >>> 0;
  return (x ^ (x >>> 16)) >>> 0;
}

/**
 * The activity of one 20-minute slot (slot = floor(time / 20 min)): deterministic, so every viewer sees the same one, and
 * never the same twice in a row. v(s) = (2s + g(s)) mod 5 with a pseudo-random g(s) in {0, 1}: consecutive slots differ
 * by 1, 2 or 3 (mod 5), never by 0, and all five activities come round.
 */
export function activityForSlot(slot: number): AnaActivity {
  const n = ANA_ACTIVITIES.length;
  const v = (((2 * slot + (mix(slot) & 1)) % n) + n) % n;
  return ANA_ACTIVITIES[v] as AnaActivity;
}

export interface ActivityState {
  activity: AnaActivity;
  source: "manual" | "post" | "rotation";
  /** when this activity changes on its own (ms), null when picked by hand */
  until: number | null;
}

export function currentActivity(look: Pick<AnaLook, "auto_look" | "manual" | "manual_expired" | "post">, now: number): ActivityState {
  const m = look.manual && !look.manual_expired ? look.manual : null;
  if (m?.activity && m.activity !== "auto") return { activity: m.activity, source: "manual", until: null };
  // a pick from before activities existed: "scooter" was a look
  if (m?.look === "scooter") return { activity: "scooter", source: "manual", until: null };
  const postAt = look.post?.published_at ? Date.parse(look.post.published_at) : Number.NaN;
  // the post's own look counts here, even when the team picked only an outfit or a colour
  if (look.auto_look === "scooter" && Number.isFinite(postAt) && now >= postAt && now - postAt < POST_ACTIVITY_MS) {
    return { activity: "scooter", source: "post", until: postAt + POST_ACTIVITY_MS };
  }
  const slot = Math.floor(now / ACTIVITY_SLOT_MS);
  return { activity: activityForSlot(slot), source: "rotation", until: (slot + 1) * ACTIVITY_SLOT_MS };
}

/** Outfits the avatar can wear; "scooter" from a post or an older pick means the summer dress. */
export const ANA_OUTFITS = ["everyday", "mermaid"] as const;

/** What the team picked by hand. "auto" leaves that part to the newest post (the activity: to the clock). */
export interface ManualLook {
  look: AnaLookId | "auto";
  /** "#rrggbb" or "auto" */
  color: string | "auto";
  /** absent in picks stored before activities existed = "auto" */
  activity?: AnaActivity | "auto";
  set_at: string;
}

export interface AnaLook {
  look: AnaLookId;
  look_source: "manual" | "caption" | "image" | "default";
  /** the look the newest post alone gives (caption or image), whatever the team picked */
  auto_look: AnaLookId | null;
  colors: OutfitColors | null;
  color_source: "manual" | "image" | "default";
  /** the vision model's confidence when the look or the colours come from the image */
  image_confidence: number | null;
  /** whether the server reads cover images with the vision model; "no-cover" = on, but the newest post has no cover image */
  image_reader: "on" | "off" | "no-cover";
  /** the post the automatic look and colours come from */
  post: { id: string; published_at: string | null; permalink: string | null } | null;
  /** the stored manual pick, also when a newer post has already replaced it */
  manual: ManualLook | null;
  /** true when a stored manual pick no longer applies because Ana posted after it */
  manual_expired: boolean;
  /** server time just before the manual pick was read (null outside the service) */
  read_at: string | null;
}

/** Caption rules, checked in order. Words are matched as words; emoji anywhere. */
const RULES: ReadonlyArray<{ look: AnaLookId; test: RegExp }> = [
  { look: "mermaid", test: /\bmermaids?\b|🧜|\bmeerjungfrau\b|\bsirena\b/iu },
  { look: "scooter", test: /\bscoot(?:er|ers|ing)\b|🛵|\bmoped\b|\bvespa\b|\bmotorbike\b/iu },
];

export function lookFromCaption(caption: string | null | undefined): AnaLookId | null {
  if (!caption) return null;
  for (const r of RULES) if (r.test.test(caption)) return r.look;
  return null;
}

export const COLOR_RE = /^#[0-9a-f]{6}$/;

export function parseColor(s: string): number | null {
  return COLOR_RE.test(s) ? Number.parseInt(s.slice(1), 16) : null;
}

export function colorHex(n: number): string {
  return `#${n.toString(16).padStart(6, "0")}`;
}

/** A second colour for the pattern: the main colour mixed towards white, so a single picked colour still reads. */
export function lighten(n: number, amount = 0.72): number {
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  return (mix(r) << 16) | (mix(g) << 8) | mix(b);
}

/** Swatches offered for a manual pick (plus "automatic"). */
export const SWATCHES: readonly string[] = ["#34508f", "#d8566f", "#2fa39a", "#f2b33d", "#8a5cf6", "#1f2328", "#f4f6fb"];

export interface NewestPost {
  id: string;
  published_at: string | null;
  permalink: string | null;
  caption: string | null;
}

/** What the vision model saw on the newest post's cover image. */
export interface ImageLook {
  look: AnaLookId | null;
  colors: OutfitColors | null;
  confidence: number;
}

/** below this the model's answer is not used */
export const IMAGE_MIN_CONFIDENCE = 0.55;

/**
 * The look the avatar wears: caption first, then the image, then the summer dress; colours from the image when the
 * model is sure enough. A manual pick older than the newest post is kept for display but not applied.
 */
export function resolveLook(newest: NewestPost | null, manual: ManualLook | null, image: ImageLook | null = null, imageReader: AnaLook["image_reader"] = "off"): AnaLook {
  const newestAt = newest?.published_at ? Date.parse(newest.published_at) : Number.NaN;
  const manualAt = manual ? Date.parse(manual.set_at) : Number.NaN;
  const manualApplies = manual !== null && Number.isFinite(manualAt) && (!Number.isFinite(newestAt) || manualAt >= newestAt);
  const auto = lookFromCaption(newest?.caption);
  const seen = image && image.confidence >= IMAGE_MIN_CONFIDENCE ? image : null;
  let look: AnaLookId = auto ?? seen?.look ?? "everyday";
  let lookSource: AnaLook["look_source"] = auto ? "caption" : seen?.look ? "image" : "default";
  const autoLook: AnaLookId | null = auto ?? seen?.look ?? null;
  let colors: OutfitColors | null = seen?.colors ?? null;
  let colorSource: AnaLook["color_source"] = seen?.colors ? "image" : "default";
  if (manualApplies && manual) {
    if (manual.look !== "auto") {
      look = manual.look;
      lookSource = "manual";
    }
    const picked = manual.color === "auto" ? null : parseColor(manual.color);
    if (picked !== null) {
      colors = { primary: picked, secondary: lighten(picked) };
      colorSource = "manual";
    }
  }
  return {
    look,
    look_source: lookSource,
    auto_look: autoLook,
    colors,
    color_source: colorSource,
    image_confidence: lookSource === "image" || colorSource === "image" ? (seen?.confidence ?? null) : null,
    image_reader: imageReader,
    post: newest ? { id: newest.id, published_at: newest.published_at, permalink: newest.permalink } : null,
    manual,
    manual_expired: manual !== null && !manualApplies,
    read_at: null,
  };
}
