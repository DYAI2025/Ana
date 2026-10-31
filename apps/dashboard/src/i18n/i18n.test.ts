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

  // ANA-35: /brain reads the ANA Brain. Every string that calls "the other modules" prototype data must not count the
  // Brain among them, whichever flag (prototype, Jira, Instagram) shows it.
  it.each(["en", "de", "it"] as const)("%s: no string that calls the other modules prototype data includes the Brain", (locale) => {
    const others = /other modules|andere(n)? Module|altri moduli/i;
    const prototype = /prototyp|prototip/i;
    const keys = flattenKeys(dictionaries[locale]).filter((key) => {
      const s = translate(locale, key as never);
      return others.test(s) && prototype.test(s);
    });
    expect(keys.length).toBeGreaterThan(0);
    expect(keys.filter((key) => !translate(locale, key as never).includes("ANA Brain"))).toEqual([]);
  });

  it("actually translates navigation (not English copies)", () => {
    expect(translate("de", "nav.now")).toBe("Jetzt");
    expect(translate("it", "nav.now")).toBe("Ora");
    expect(translate("de", "nav.calendar")).not.toBe(translate("en", "nav.calendar"));
  });
});

describe("translate", () => {
  it("interpolates named placeholders", () => {
    expect(translate("en", "now.socialState", { state: "Connected" })).toBe("Instagram · Connected");
  });

  it("leaves unknown placeholders visible instead of hiding them", () => {
    expect(translate("en", "now.socialState", {})).toBe("Instagram · {state}");
  });

  it("returns the key itself for a missing key so the gap is visible", () => {
    expect(translate("en", "nav.doesNotExist" as never)).toBe("nav.doesNotExist");
  });
});
