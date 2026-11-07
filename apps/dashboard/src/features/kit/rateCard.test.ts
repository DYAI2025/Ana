import { describe, expect, it } from "vitest";
import { EMPTY_RATE_CARD, formatAmount, parseRateCard, rateCardProblems, rateId, registerDisplay } from "./rateCard";

describe("rate-card.json: Ana's internal prices", () => {
  it("keeps valid rates and add-ons; drops bad ids, missing names, non-positive or absurd quotes and duplicates", () => {
    const c = parseRateCard({
      currency: "USD",
      rates: [
        { id: "reel", name: "Instagram Reel", quote: 1500, includes: ["Crossposted to TikTok, Facebook and YouTube Shorts", 3], note: "Fixed rate" },
        { id: "bundle", name: "Reel + 3 Stories", quote: 1950, minimum: 1750 },
        { id: "reel", name: "again", quote: 1 },
        { id: "Bad Id", name: "x", quote: 1 },
        { id: "zero", name: "x", quote: 0 },
        { id: "text", name: "x", quote: "1500" },
        { id: "huge", name: "x", quote: 1e9 },
        { id: "nameless", quote: 100 },
        "junk",
      ],
      addons: [{ name: "Usage rights", tiers: [{ label: "30 days", value: "+30 %" }, { label: "", value: "x" }], note: "Of the content fee" }, { tiers: [] }],
      tips: ["Name our price first.", 4],
    });
    expect(c.rates.map((r) => r.id)).toEqual(["reel", "bundle"]);
    expect(c.rates[0]).toEqual({ id: "reel", name: "Instagram Reel", quote: 1500, minimum: null, includes: ["Crossposted to TikTok, Facebook and YouTube Shorts"], note: "Fixed rate" });
    expect(c.rates[1]!.minimum).toBe(1750);
    expect(c.addons).toEqual([{ name: "Usage rights", tiers: [{ label: "30 days", value: "+30 %" }], note: "Of the content fee" }]);
    expect(c.tips).toEqual(["Name our price first."]);
  });

  it("never shows a floor nobody named: a minimum above the quote, zero or text is no minimum", () => {
    const c = parseRateCard({ rates: [{ id: "a", name: "A", quote: 500, minimum: 600 }, { id: "b", name: "B", quote: 500, minimum: 0 }, { id: "c", name: "C", quote: 500, minimum: "400" }, { id: "d", name: "D", quote: 500, minimum: 500 }] });
    expect(c.rates.map((r) => r.minimum)).toEqual([null, null, null, 500]);
  });

  it("anything that is not a card is the empty card; an unknown currency falls back to USD", () => {
    for (const raw of [null, [], "x", 3]) expect(parseRateCard(raw)).toEqual(EMPTY_RATE_CARD);
    expect(parseRateCard({ currency: "dollars" }).currency).toBe("USD");
    expect(parseRateCard({ currency: "EUR" }).currency).toBe("EUR");
  });

  it("amounts read like a price list; the register shows the Reel's quote", () => {
    expect(formatAmount(1500, "USD")).toBe("$1,500");
    expect(formatAmount(1950.5, "USD")).toBe("$1,950.50");
    const card = parseRateCard({ rates: [{ id: "stories", name: "Story set", quote: 500 }, { id: "reel", name: "Reel", quote: 1500 }] });
    expect(registerDisplay(card)).toBe("$1,500");
    expect(registerDisplay(parseRateCard({ rates: [{ id: "stories", name: "Story set", quote: 500 }] }))).toBe("$500");
    expect(registerDisplay(EMPTY_RATE_CARD)).toBeNull();
  });

  it("keeps who saved it and when", () => {
    const c = parseRateCard({ rates: [], updated_at: "2026-11-07T00:30:00.000Z", updated_by: "ben@example.com" });
    expect([c.updated_at, c.updated_by]).toEqual(["2026-11-07T00:30:00.000Z", "ben@example.com"]);
    expect(parseRateCard({}).updated_at).toBeNull();
  });

  it("an edited card is stored only when nothing of it would be dropped", () => {
    expect(rateCardProblems({ rates: [{ id: "reel", name: "Reel", quote: 1500, minimum: 1200 }], addons: [{ name: "Usage rights", tiers: [{ label: "30 days", value: "+30%" }] }], tips: [] })).toEqual([]);
    const p = rateCardProblems({
      rates: [{ id: "reel", name: "", quote: 0 }, { id: "reel", name: "B", quote: 500, minimum: 600 }, { id: "c", name: "C", quote: null }],
      addons: [{ name: "X", tiers: [{ label: "30 days", value: "" }] }, { tiers: [] }],
    });
    expect(p).toEqual([
      "format 1: name missing",
      "format 1: quote must be a number above 0",
      "format 2: id missing or used twice",
      "format 2: minimum must be above 0 and not above the quote",
      "format 3: quote must be a number above 0",
      "add-on 1: every step needs a label and a value",
      "add-on 2: name missing",
    ]);
    expect(rateCardProblems(null)).toEqual(["not a rate card"]);
    expect(rateCardProblems({ rates: Array.from({ length: 13 }, (_, i) => ({ id: `r${i}`, name: "x", quote: 1 })) })).toContain("at most 12 formats");
  });

  it("a new format gets an id from its name, never one already taken", () => {
    expect(rateId("Instagram Reel", new Set())).toBe("instagram-reel");
    expect(rateId("Instagram Reel", new Set(["instagram-reel"]))).toBe("instagram-reel-2");
    expect(rateId("TikTok · Video!", new Set())).toBe("tiktok-video");
    expect(rateId("", new Set(["format"]))).toBe("format-2");
    expect(rateId("Ünïcode Größe", new Set())).toMatch(/^[a-z0-9][a-z0-9-]*$/);
  });
});
