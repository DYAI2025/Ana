import { describe, expect, it } from "vitest";
import { EMPTY_KIT_CONFIG, parseKitConfig } from "./config";
import { BUILT_IN_PRESETS, presetList, resolvePreset } from "./presets";

describe("parseKitConfig — Ana's content, lenient, nothing invented", () => {
  it("anything that is not an object is the empty kit", () => {
    for (const raw of [null, undefined, 3, "x", [], [{ name: "x" }]]) expect(parseKitConfig(raw)).toEqual(EMPTY_KIT_CONFIG);
    expect(parseKitConfig({})).toEqual(EMPTY_KIT_CONFIG);
  });

  it("keeps valid entries, drops bad ones, trims text", () => {
    const c = parseKitConfig({
      name: "  Ana  ",
      tagline: "   ",
      contact: { email: "hello@example.com", label: "Work with me", subject: "Collab" },
      cases: [
        { brand: " Hotel A ", title: "Stay", summary: "s", results: [{ label: "Bookings", value: "+40%" }, { label: "", value: "x" }], link: "http://insecure.example" },
        { title: "no brand" },
        "junk",
      ],
      packages: [{ name: "Reel", price: "from €1,500", includes: ["1 Reel", 3, " "] }, { name: "no price" }],
      addons: [{ name: "Usage rights", price: "+20–50 %" }, { price: "no name" }],
    });
    expect(c.name).toBe("Ana");
    expect(c.tagline).toBeNull();
    expect(c.contact).toEqual({ email: "hello@example.com", label: "Work with me", subject: "Collab" });
    expect(c.cases).toEqual([{ id: "hotel-a", brand: "Hotel A", title: "Stay", summary: "s", role: null, deliverables: [], period: null, source: null, results: [{ label: "Bookings", value: "+40%" }], link: null }]);
    expect(c.packages).toEqual([{ name: "Reel", price: "from €1,500", includes: ["1 Reel"], note: null }]);
    expect(c.addons).toEqual([{ name: "Usage rights", price: "+20–50 %", note: null }]);
  });

  it("a contact without a valid e-mail is no contact; an https link is kept", () => {
    expect(parseKitConfig({ contact: { email: "not an email" } }).contact).toBeNull();
    expect(parseKitConfig({ contact: { email: "a@b.c<script>" } }).contact).toBeNull();
    // nothing that would add mailto headers or recipients
    for (const email of ["a@b.co?bcc=x@y.z", "a@b.co&cc=x@y.z", "a@b.co,x@y.z", "a%3F@b.co", "a@b.co#x"]) expect(parseKitConfig({ contact: { email } }).contact, email).toBeNull();
    expect(parseKitConfig({ contact: { email: "ana.savu+brands@mail.example.com" } }).contact?.email).toBe("ana.savu+brands@mail.example.com");
    expect(parseKitConfig({ cases: [{ brand: "B", link: "https://example.com/work" }] }).cases[0]?.link).toBe("https://example.com/work");
  });

  it("presets: valid ids, known sections and tiles, upper-case country codes, no duplicates", () => {
    const c = parseKitConfig({
      presets: {
        "insurer-us": { base: "west", label: "US insurer", focus: ["us", "GB", "USA", "gb"], sections: ["audience", "nope", "audience", "numbers"], tiles: ["followers", "x"], reels: ["123", "bad id!"], lead: "sideways" },
        "Bad ID": { label: "x" },
        ok: "not an object",
      },
    });
    expect(Object.keys(c.presets)).toEqual(["insurer-us"]);
    expect(c.presets["insurer-us"]).toEqual({ base: "west", label: "US insurer", focus: ["US", "GB"], sections: ["audience", "numbers"], tiles: ["followers"], reels: ["123"] });
  });
});

describe("resolvePreset — what a brand sees first", () => {
  it("unknown, empty or odd ids fall back to the default; built-ins resolve by id", () => {
    expect(resolvePreset(null).id).toBe("default");
    expect(resolvePreset("nope").id).toBe("default");
    expect(resolvePreset("__proto__").id).toBe("default");
    expect(resolvePreset(" ASIA ").id).toBe("asia");
    expect(resolvePreset("west").lead).toBe("followers");
    expect(resolvePreset("asia").focus).toContain("IN");
  });

  it("a config preset sits on its base; its own focus without a label has no focus label", () => {
    const custom = parseKitConfig({ presets: { brand: { base: "west", label: "Brand", reels: ["9"] }, mine: { focus: ["TH"] }, asia: { label: "Asia (Ana's)" } } }).presets;
    const brand = resolvePreset("brand", custom);
    expect(brand).toMatchObject({ id: "brand", label: "Brand", lead: "followers", focus: BUILT_IN_PRESETS.west!.focus, focus_label: "US, UK & Europe", reels: ["9"] });
    expect(resolvePreset("mine", custom)).toMatchObject({ focus: ["TH"], focus_label: null, lead: "engaged" });
    // the config may adjust a built-in under the same id
    expect(resolvePreset("asia", custom)).toMatchObject({ label: "Asia (Ana's)", focus: BUILT_IN_PRESETS.asia!.focus, focus_label: "Asia-Pacific & India" });
    expect(presetList(custom).map((p) => p.id)).toEqual(["default", "asia", "west", "brand", "mine"]);
  });
});

describe("parseKitConfig — partners, Reel labels, case fields (ANA-54)", () => {
  it("partners: names with a known kind; no kind is the name alone; an unknown kind is dropped", () => {
    const c = parseKitConfig({ partners: [{ name: "Fiverr", kind: "paid" }, { name: " ClassPass ", kind: "affiliate" }, { name: "Nomad" }, { name: "X", kind: "sponsor" }, { kind: "paid" }] });
    expect(c.partners).toEqual([
      { name: "Fiverr", kind: "paid", current: false },
      { name: "ClassPass", kind: "affiliate", current: false },
      { name: "Nomad", kind: null, current: false },
    ]);
    // only an explicit true is a running partnership
    expect(parseKitConfig({ partners: [{ name: "A", current: true }, { name: "B", current: "yes" }, { name: "C", kind: "affiliate", current: true }] }).partners.map((p) => [p.name, p.current])).toEqual([["A", true], ["B", false], ["C", true]]);
  });

  it("Reel labels: by media id, known kinds only; organic and concept carry no brand", () => {
    const c = parseKitConfig({ reels: { "123": { kind: "partnership", brand: "BAGSMART" }, "456": { kind: "organic", brand: "ignored" }, "bad id!": { kind: "ugc" }, "789": { kind: "viral" }, "999": "ugc" } });
    expect(c.reels).toEqual({ "123": { kind: "partnership", brand: "BAGSMART" }, "456": { kind: "organic", brand: null } });
  });

  it("cases: own id or a slug of the brand; role, deliverables, period and source; presets pick cases by id", () => {
    const c = parseKitConfig({
      cases: [{ brand: "Nomad eSIM", role: "Concept and filming", deliverables: ["1 Reel", 5, "3 Stories"], period: "30 days", source: "Instagram Insights" }, { id: "Own-ID!", brand: "Ünïcode Brand" }],
      presets: { b: { cases: ["nomad-esim", "BAD ID", "unicode-brand"] } },
    });
    expect(c.cases.map((x) => x.id)).toEqual(["nomad-esim", "unicode-brand"]);
    expect(c.cases[0]).toMatchObject({ role: "Concept and filming", deliverables: ["1 Reel", "3 Stories"], period: "30 days", source: "Instagram Insights" });
    expect(c.presets.b!.cases).toEqual(["nomad-esim", "unicode-brand"]);
    // two cases of one brand both stay pickable
    expect(parseKitConfig({ cases: [{ brand: "Hotel A" }, { brand: "Hotel A" }, { brand: "Hotel A" }] }).cases.map((x) => x.id)).toEqual(["hotel-a", "hotel-a-2", "hotel-a-3"]);
    // an id written in the file is never renamed by a generated one
    expect(parseKitConfig({ cases: [{ brand: "Hotel A" }, { brand: "Hotel A" }, { brand: "Other", id: "hotel-a-2" }] }).cases.map((x) => x.id)).toEqual(["hotel-a", "hotel-a-3", "hotel-a-2"]);
    // a media id like __proto__ is an ordinary key, never the prototype
    const labels = parseKitConfig({ reels: JSON.parse('{"__proto__": {"kind": "ugc"}}') }).reels;
    expect(Object.getPrototypeOf(labels)).toBeNull();
    expect(Object.hasOwn(labels, "__proto__")).toBe(true);
  });
});
