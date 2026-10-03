import { describe, expect, it } from "vitest";
import { createInitialState, prototypeReducer } from "@/state/prototype";
import { buildSearchIndex, groupResults, normalize, SEARCH_GROUPS, searchEntries } from "./search";
import { activeViewFor } from "./views";

const index = (locale: "en" | "de" | "it" = "en", state = createInitialState()) => buildSearchIndex(state, locale);

describe("normalize", () => {
  it("folds case and diacritics", () => {
    expect(normalize("Prüfung RÉALTÀ")).toBe("prufung realta");
  });
});

describe("searchEntries", () => {
  it("offers every page when the query is empty", () => {
    const results = searchEntries(index(), "");
    const views = results.filter((r) => r.group === "view").map((r) => r.href);
    expect(views).toEqual(
      expect.arrayContaining(["/", "/board", "/backlog", "/sessions", "/brain", "/whiteboard", "/calendar", "/pulse", "/vault", "/toolbox"]),
    );
  });

  it("finds content across groups", () => {
    const entries = index();
    expect(searchEntries(entries, "loop").map((r) => r.group)).toEqual(expect.arrayContaining(["ticket", "concept", "event"]));
    expect(searchEntries(entries, "transcript")[0]).toMatchObject({ group: "idea" });
    expect(searchEntries(entries, "workshop 02").map((r) => r.href)).toContain("/sessions/workshop-02");
    expect(searchEntries(entries, "miro").map((r) => r.group)).toEqual(expect.arrayContaining(["tool", "concept"]));
    expect(searchEntries(entries, "instagram")[0]).toMatchObject({ group: "source", href: "/pulse" });
  });

  it("requires every word to match and ranks label prefix hits first", () => {
    const entries = index();
    expect(searchEntries(entries, "calendar")[0]).toMatchObject({ group: "view", href: "/calendar" });
    expect(searchEntries(entries, "zzzz nothing")).toEqual([]);
  });

  it("shows labels in the active language but also matches other languages", () => {
    const de = index("de");
    const hit = searchEntries(de, "kalender")[0];
    expect(hit).toMatchObject({ href: "/calendar", label: "Kalender" });
    expect(searchEntries(index("en"), "kalender")[0]).toMatchObject({ href: "/calendar", label: "Calendar" });
    expect(searchEntries(index("it"), "lavagna")[0]).toMatchObject({ href: "/whiteboard", label: "Lavagna" });
  });

  it("includes ideas and events created in this session", () => {
    let state = createInitialState();
    state = prototypeReducer(state, { type: "addIdea", title: "Quiet Friday review", owner: "ana" });
    state = prototypeReducer(state, {
      type: "addEvent",
      event: { title: "Studio visit", date: "2026-10-20", start: "10:00", end: "11:00", type: "workshop", createdBy: "ben" },
    });
    const entries = index("en", state);
    expect(searchEntries(entries, "quiet friday")[0]).toMatchObject({ group: "idea", href: "/backlog" });
    expect(searchEntries(entries, "studio visit")[0]).toMatchObject({ group: "event" });
  });

  it("finds a person's tickets by owner name", () => {
    const results = searchEntries(index(), "ana").filter((r) => r.group === "ticket");
    expect(results.length).toBeGreaterThan(0);
  });
});

describe("activeViewFor", () => {
  it.each([
    ["/", "now"],
    ["/board", "board"],
    ["/backlog", "board"],
    ["/sessions/working-session-01", "sessions"],
    ["/brain", "brain"],
    ["/nope", null],
  ])("%s → %s", (path, view) => {
    expect(activeViewFor(path)).toBe(view);
  });
});

describe("groupResults", () => {
  it("groups in a fixed order and records each group's flat start index", () => {
    const groups = groupResults(searchEntries(index(), "loop"));
    const flat = groups.flatMap((g) => g.items);
    groups.forEach((g) => expect(flat[g.start]).toBe(g.items[0]));
    const order = groups.map((g) => SEARCH_GROUPS.indexOf(g.group));
    expect(order).toEqual([...order].sort((a, b) => a - b));
  });
});
