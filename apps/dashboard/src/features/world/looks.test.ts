import { describe, expect, it } from "vitest";
import { ACTIVITY_SLOT_MS, ANA_ACTIVITIES, activityForSlot, currentActivity, lighten, lookFromCaption, parseColor, POST_ACTIVITY_MS, resolveLook, type NewestPost } from "./looks";

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

describe("Ana's activities", () => {
  it("picks one activity per 20-minute slot, the same for everyone, never twice in a row within a day", () => {
    const base = Math.floor(Date.parse("2026-11-01T00:00:00Z") / ACTIVITY_SLOT_MS);
    const day = Array.from({ length: 72 }, (_, i) => activityForSlot(base - (base % 72) + i));
    for (let i = 1; i < day.length; i++) expect(day[i], `slot ${i}`).not.toBe(day[i - 1]);
    for (const a of ANA_ACTIVITIES) expect(day).toContain(a);
    expect(activityForSlot(base)).toBe(activityForSlot(base));
  });

  it("rotation by default, the scooter for 2 hours after a scooter post, a hand pick above both", () => {
    const now = Date.parse("2026-11-01T10:30:00Z");
    const plain = resolveLook({ id: "p", published_at: "2026-11-01T09:00:00Z", permalink: null, caption: "a quiet morning" }, null);
    expect(currentActivity(plain, now)).toMatchObject({ source: "rotation", until: (Math.floor(now / ACTIVITY_SLOT_MS) + 1) * ACTIVITY_SLOT_MS });
    const ride = resolveLook({ id: "p", published_at: "2026-11-01T09:00:00Z", permalink: null, caption: "rent a scooter 🛵" }, null);
    expect(currentActivity(ride, now)).toEqual({ activity: "scooter", source: "post", until: Date.parse("2026-11-01T09:00:00Z") + POST_ACTIVITY_MS });
    expect(currentActivity(ride, Date.parse("2026-11-01T11:30:00Z")).source).toBe("rotation");
    const picked = resolveLook({ id: "p", published_at: "2026-11-01T09:00:00Z", permalink: null, caption: "rent a scooter" }, { look: "auto", color: "auto", activity: "reading", set_at: "2026-11-01T09:30:00Z" });
    expect(currentActivity(picked, now)).toEqual({ activity: "reading", source: "manual", until: null });
    const old = resolveLook(null, { look: "scooter", color: "auto", set_at: "2026-11-01T09:30:00Z" });
    expect(currentActivity(old, now)).toEqual({ activity: "scooter", source: "manual", until: null });
  });
});
