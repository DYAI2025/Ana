import { describe, expect, it } from "vitest";
import { createInitialState, prototypeReducer } from "@/state/prototype";
import { makeSnapshot } from "@/test/work-fixture";
import { buildSearchIndex, groupResults, normalize, SEARCH_GROUPS, searchEntries } from "./search";
import { activeViewFor } from "./views";

const index = (locale: "en" | "de" | "it" = "en", state = createInitialState(), work = makeSnapshot()) => buildSearchIndex(state, locale, work);

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
    expect(searchEntries(entries, "onboarding checklist")[0]).toMatchObject({ group: "idea", href: "/backlog?ticket=ANA-901" });
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

  it("includes events created in this session", () => {
    const state = prototypeReducer(createInitialState(), {
      type: "addEvent",
      event: { title: "Studio visit", date: "2026-10-20", start: "10:00", end: "11:00", type: "workshop", createdBy: "ben" },
    });
    expect(searchEntries(index("en", state), "studio visit")[0]).toMatchObject({ group: "event" });
  });

  it("indexes Jira issues by key, summary and assignee; Backlog issues lead to the Backlog view", () => {
    const entries = index();
    expect(searchEntries(entries, "ANA-904")[0]).toMatchObject({ group: "ticket", href: "/board?ticket=ANA-904", label: "Prepare the shared resource map" });
    expect(searchEntries(entries, "avery").filter((r) => r.group === "ticket").map((r) => r.id)).toEqual(["ticket:ANA-904"]);
    expect(searchEntries(entries, "calmer friday")[0]).toMatchObject({ group: "idea", href: "/backlog?ticket=ANA-907" });
    expect(searchEntries(entries, "calmer friday")[0]!.detail).toContain("Idea");
  });

  it("a stale Jira read stays searchable but every work entry says it is not current", () => {
    const entries = buildSearchIndex(createInitialState(), "en", makeSnapshot(), "10:42");
    const work = entries.filter((e) => e.group === "ticket" || e.group === "idea");
    expect(work.length).toBeGreaterThan(0);
    for (const entry of work) expect(entry.detail).toContain("as read 10:42 · Jira not reachable");
  });

  it("offers no work entries without a Jira snapshot — never fixture tickets", () => {
    const entries = buildSearchIndex(createInitialState(), "en", null);
    expect(entries.filter((e) => e.group === "ticket" || e.group === "idea")).toEqual([]);
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
