import { describe, expect, it } from "vitest";
import { briefFacts, capStrength, numbersBacked, parseBrief, type Fact } from "./brief";
import { tierOf, marketSplit } from "./markets";
import { NOW, post, series, tag, world } from "./worldFixture";

describe("markets", () => {
  it("US, UK and Germany are tier 1, Thailand tier 2, India tier 3; the split sums the listed shares", () => {
    expect([tierOf("US"), tierOf("gb"), tierOf("DE"), tierOf("TH"), tierOf("IN"), tierOf("ZZ")]).toEqual([1, 1, 1, 2, 3, 3]);
    const s = marketSplit(series([["US", 30], ["IN", 50], ["PH", 20]]));
    expect(s).toMatchObject({ t1: 0.3, t2: 0.2, t3: 0.5 });
    expect(s?.top1).toEqual([{ key: "US", share: 0.3 }]);
  });
});

describe("brief facts", () => {
  it("spell out markets, who, content and limits — and never a caption", () => {
    const facts = briefFacts(world(), [], NOW);
    const text = facts.map((f) => f.text).join("\n");
    expect(facts.map((f) => f.id)).toEqual(facts.map((_, i) => `F${i + 1}`));
    expect(text).toContain("Tier 1 55 %, Tier 2 45 %, Tier 3 0 %");
    expect(text).toContain("Tier-1-Anteil 7 Tage 55 % gegenüber 30 Tage 70 % (-15.0 Pkt)");
    expect(text).toContain("Steigend (7 gegen 30 Tage): TH (Tier 2) +15.0 Pkt");
    expect(text).toContain("Altersgruppen 25-34 50 %");
    expect(text).toContain("Alle Posts mit Insights: Interaktionsrate im Median 6.0 % (n 5)");
    expect(text).toContain("nicht pro Post");
    expect(text).not.toContain("SECRET");
    expect(facts.some((f) => f.kind === "substack" && f.text.startsWith("H1 Opportunity Drop"))).toBe(true);
  });

  it("name the best and the worst value of a category only with 3 posts or more on each side", () => {
    const w = world();
    if (w.instagram.ok) w.instagram.snapshot.posts.push(post("p6", 15, 1000, 30, 1, 1));
    w.post_tags.tags.p5 = tag("food");
    w.post_tags.tags.p6 = tag("food");
    const text = briefFacts(w, [], NOW).map((f) => f.text).join("\n");
    // beach: p1 12 %, p2 4 %, p3 6 % → 6.0 %; food: p4 5 %, p5 8 %, p6 3 % → 5.0 %
    expect(text).toContain("Thema: höchste Interaktionsrate „beach“ 6.0 % (n 3), niedrigste „food“ 5.0 % (n 3).");
    expect(text).not.toMatch(/Thema: .*n 2/);
  });

  it("compare the oldest and the newest stored day only when they are 3 days or more apart", () => {
    const day = (d: string, us: number) => ({ day: d, week: { country: [["US", us], ["IN", 100 - us]] as Array<[string, number]>, age: [], gender: [] } });
    expect(briefFacts(world(), [day("2026-11-02", 20), day("2026-11-03", 30)], NOW).some((f) => f.text.includes("Tage auseinander"))).toBe(false);
    const t = briefFacts(world(), [day("2026-10-27", 20), day("2026-11-03", 30)], NOW).find((f) => f.text.includes("Tage auseinander"));
    expect(t?.text).toBe("Tier-1-Anteil im 7-Tage-Fenster am 2026-10-27: 20 %, am 2026-11-03: 30 % (7 Tage auseinander).");
  });
});

describe("parseBrief — the model may phrase and weigh, not bring figures", () => {
  const facts: Fact[] = [
    { id: "F1", kind: "market", text: "Engagement nach Werbemarkt: Tier 1 55 %, Tier 2 45 %." },
    { id: "F2", kind: "content", text: "Ana im Bild: höchste Interaktionsrate „Gesicht sichtbar“ 6.1 % (n 12), niedrigste „nicht im Bild“ 3.0 % (n 9)." },
    { id: "F3", kind: "substack", text: "Keine Tendenz zwischen H1 und H4 (ohne Überschneidung: 2 H1-Posts, 3 H4-Posts)." },
  ];
  const pattern = (o: Record<string, unknown>) => ({ kind: "content", title: "Gesicht trägt", text: "Posts mit sichtbarem Gesicht kommen auf 6,1 % gegenüber 3.0 %.", facts: ["F2"], counter: null, counter_facts: [], strength: "medium", ...o });

  it("keeps a pattern whose numbers are in its facts; drops invented numbers and unknown facts", () => {
    const b = parseBrief({
      headline: "Gesicht und Tier-1-Märkte tragen die Woche",
      patterns: [pattern({}), pattern({ title: "Erfunden", text: "Gesicht bringt 9.9 % mehr." }), pattern({ title: "Fremd", facts: ["F9"] }), pattern({ title: "Falsche Quelle", facts: ["F1"] })],
      brands: { text: "55 % des Engagements liegt in Tier 1, in den letzten 7 Tagen.", facts: ["F1"] },
      substack: { text: "Zwischen H1 und H4 ist noch nichts entschieden: 2 gegen 3 Posts.", facts: ["F3"], lean: "H9" },
      next_test: "H1- und H4-Posts im selben Format vergleichen.",
      limits: ["Meta zeigt Zielgruppen nur kontoweit.", "Erfunden: 42 Wochen."],
    }, facts);
    expect(b?.patterns.map((p) => p.title)).toEqual(["Gesicht trägt"]);
    expect(b?.dropped).toBe(3);
    expect(b?.brands?.text).toContain("55 %");
    expect(b?.substack).toMatchObject({ lean: null, facts: ["F3"] });
    expect(b?.limits).toEqual(["Meta zeigt Zielgruppen nur kontoweit."]);
    expect(b?.next_test).toContain("H1");
  });

  it("names with digits are not figures: H1, Tier 1, 7 Tage", () => {
    expect(numbersBacked("H4 vor H1, Tier 1 in den letzten 7 Tagen", [])).toBe(true);
    expect(numbersBacked("Tier 1 hat 55 %", [])).toBe(false);
    expect(numbersBacked("6,1 % und 6.10 %", [{ id: "F1", kind: "content", text: "6.1 %" }])).toBe(true);
  });

  // a word list cannot be complete: what slips through is still shown next to the facts it cites
  it("thousands, other scripts and number words cannot smuggle a figure in", () => {
    const F: Fact[] = [{ id: "F1", kind: "market", text: "Tier 1 63 %, Tier 2 25 %, Tier 3 12 % (Stand 2026-08-22); Reichweite 40000." }];
    expect(numbersBacked("über 1.000 neue Follower", F)).toBe(false);
    expect(numbersBacked("2,000 Klicks", F)).toBe(false);
    expect(numbersBacked("Tier 1 brachte 22.000 Interaktionen", F)).toBe(false);
    expect(numbersBacked("Reichweite 40.000", F)).toBe(true);
    expect(numbersBacked("Reichweite 40,000", F)).toBe(true);
    expect(numbersBacked("９９ %", F)).toBe(false);
    for (const w of ["Die Hälfte kommt aus Tier 1", "Gesicht verdoppelt die Rate", "zehn Prozent mehr", "twice as many", "doppelt so gut", "zweimal so hoch", "dreimal mehr", "fünfzig Prozent", "vierzig Prozent", "dreizehn Länder", "ein Fünftel", "verzehnfacht", "threefold", "fifteen posts", "zwanzig Prozent", "sechzig Prozent", "siebzig Prozent", "sechzehn", "siebzehn", "zweihundert", "dreitausend", "zehntausend", "halbiert", "zweieinhalb", "dreiviertel", "ein Dutzend", "vervielfacht"])
      expect(numbersBacked(w, F), w).toBe(false);
    // ordinary words that only look like numbers stay allowed
    for (const w of ["einfach und klar", "vereinfacht gesagt", "beachten", "Achtung", "einmal testen", "Elfenbein", "Zweifel", "Untertitel", "Fachleute"]) expect(numbersBacked(w, F), w).toBe(true);
    expect(numbersBacked("Reichweite 40 000", F)).toBe(true);
    expect(numbersBacked("25 000 Views", [{ id: "F2", kind: "content", text: "Tier 3 0 % und 25 %" }])).toBe(false);
    // names and windows are not figures, but only as names
    expect(numbersBacked("Tier 1 in den letzten 30 Tagen", F)).toBe(true);
    expect(numbersBacked("an 28 Tagen gepostet", [])).toBe(true);
    expect(numbersBacked("7 t", [])).toBe(false);
  });

  it("the model's strength is capped by what it cites", () => {
    const f = (id: string, text: string, kind: Fact["kind"] = "content"): Fact => ({ id, kind, text });
    expect(capStrength("strong", [f("F1", "x (n 5)")])).toBe("weak");
    expect(capStrength("strong", [f("F1", "x (n 6)"), f("F2", "y (n 12)")])).toBe("medium");
    expect(capStrength("strong", [f("F1", "x (n 9)"), f("F2", "y (n 12)")])).toBe("strong");
    expect(capStrength("strong", [f("F1", "Tier 1 40 %", "market"), f("F2", "nur kontoweit", "limit")])).toBe("weak");
    expect(capStrength("medium", [f("F1", "x (n 3)"), f("F2", "y (n 12)")])).toBe("weak");
    expect(capStrength("weak", [f("F1", "x (n 9)"), f("F2", "y (n 12)")])).toBe("weak");
    // a fact about posts without a readable n cannot carry "strong"
    expect(capStrength("strong", [f("F1", "Reichweite 28 Tage: 40000", "brand"), f("F2", "y (n 12)")])).toBe("medium");
    // the brief's own facts carry their n
    const facts = briefFacts(world(), [], NOW);
    const brand = facts.find((x) => x.kind === "brand" && x.text.startsWith("Posts mit sichtbarer Marke"))!;
    const fresh = facts.find((x) => x.text.startsWith("Posts der letzten 7 Tage"))!;
    expect(capStrength("strong", [brand, fresh])).toBe("weak");
  });

  it("not a brief: no headline, not an object", () => {
    expect(parseBrief({ patterns: [] }, facts)).toBeNull();
    expect(parseBrief("nope", facts)).toBeNull();
  });
});
