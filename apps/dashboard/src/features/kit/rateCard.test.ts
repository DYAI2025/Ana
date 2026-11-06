import { describe, expect, it } from "vitest";
import { EMPTY_RATE_CARD, formatAmount, parseRateCard, registerDisplay } from "./rateCard";

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
});
