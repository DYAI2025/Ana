import { describe, expect, it } from "vitest";
import { lighten, lookFromCaption, parseColor, resolveLook, type NewestPost } from "./looks";

const post = (caption: string | null, published_at = "2026-10-29T10:00:00.000Z"): NewestPost => ({ id: "p1", published_at, permalink: "https://example.invalid/p1", caption });

describe("lookFromCaption", () => {
  it("finds the scooter and the mermaid by word or emoji", () => {
    expect(lookFromCaption("beep beeeeep!! 🛵💨 this is what you need to rent a scooter")).toBe("scooter");
    expect(lookFromCaption("Scooting through town")).toBe("scooter");
    expect(lookFromCaption("halloween night as a little MERMAID")).toBe("mermaid");
    expect(lookFromCaption("🧜‍♀️ with friends")).toBe("mermaid");
    expect(lookFromCaption("Meerjungfrau-Party")).toBe("mermaid");
  });

  it("does not guess from parts of words or unrelated captions", () => {
    expect(lookFromCaption("scootering? no: a quiet morning")).toBeNull();
    expect(lookFromCaption("mermaidish vibes")).toBeNull();
    expect(lookFromCaption("Happy 3 year travel anniversary")).toBeNull();
    expect(lookFromCaption(null)).toBeNull();
  });
});

describe("resolveLook", () => {
  it("follows the newest post's caption", () => {
    expect(resolveLook(post("rent a scooter 🛵"), null)).toMatchObject({ look: "scooter", look_source: "caption", colors: null, color_source: "default", manual: null, manual_expired: false });
  });

  it("wears the summer dress in her own colours when nothing matches", () => {
    expect(resolveLook(post("a quiet morning"), null)).toMatchObject({ look: "everyday", look_source: "default", colors: null, color_source: "default" });
    expect(resolveLook(null, null)).toMatchObject({ look: "everyday", post: null });
  });

  it("a manual pick wins until Ana posts again", () => {
    const manual = { look: "mermaid" as const, color: "#2fa39a", set_at: "2026-10-30T09:00:00.000Z" };
    const held = resolveLook(post("rent a scooter"), manual);
    expect(held).toMatchObject({ look: "mermaid", look_source: "manual", color_source: "manual", manual_expired: false });
    expect(held.colors).toEqual({ primary: 0x2fa39a, secondary: lighten(0x2fa39a) });
    const later = resolveLook(post("rent a scooter", "2026-10-31T09:00:00.000Z"), manual);
    expect(later).toMatchObject({ look: "scooter", look_source: "caption", color_source: "default", colors: null, manual_expired: true });
  });

  it("'auto' in a pick leaves that part to the post", () => {
    expect(resolveLook(post("rent a scooter"), { look: "auto", color: "#1f2328", set_at: "2026-10-30T09:00:00.000Z" })).toMatchObject({ look: "scooter", look_source: "caption", color_source: "manual" });
    expect(resolveLook(post("x"), { look: "mermaid", color: "auto", set_at: "2026-10-30T09:00:00.000Z" })).toMatchObject({ look: "mermaid", look_source: "manual", color_source: "default" });
  });

  it("parses only #rrggbb colours", () => {
    expect(parseColor("#34508f")).toBe(0x34508f);
    expect(parseColor("#34508")).toBeNull();
    expect(parseColor("red")).toBeNull();
  });
});
