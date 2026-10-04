import { describe, expect, it } from "vitest";
import { dictionaries, flattenKeys, translate } from "./translate";

describe("dictionaries", () => {
  const enKeys = flattenKeys(dictionaries.en).sort();

  it.each(["de", "it"] as const)("%s has exactly the English key set", (locale) => {
    expect(flattenKeys(dictionaries[locale]).sort()).toEqual(enKeys);
  });

  it.each(["en", "de", "it"] as const)("%s has no empty strings", (locale) => {
    const empty = flattenKeys(dictionaries[locale]).filter((key) => translate(locale, key as never).trim() === "");
    expect(empty).toEqual([]);
  });

  it.each(["de", "it"] as const)("%s keeps every placeholder used in English", (locale) => {
    const mismatched = enKeys.filter((key) => {
      const placeholders = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join(",");
      return placeholders(translate("en", key as never)) !== placeholders(translate(locale, key as never));
    });
    expect(mismatched).toEqual([]);
  });

  it("actually translates navigation (not English copies)", () => {
    expect(translate("de", "nav.now")).toBe("Jetzt");
    expect(translate("it", "nav.now")).toBe("Ora");
    expect(translate("de", "nav.calendar")).not.toBe(translate("en", "nav.calendar"));
  });
});

describe("translate", () => {
  it("interpolates named placeholders", () => {
    expect(translate("en", "now.workStatus", { active: 2, review: 1 })).toBe("2 active · 1 in review");
  });

  it("leaves unknown placeholders visible instead of hiding them", () => {
    expect(translate("en", "now.workStatus", { active: 2 })).toBe("2 active · {review} in review");
  });

  it("returns the key itself for a missing key so the gap is visible", () => {
    expect(translate("en", "nav.doesNotExist" as never)).toBe("nav.doesNotExist");
  });
});
