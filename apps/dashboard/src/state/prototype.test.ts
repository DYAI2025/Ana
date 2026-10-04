import { describe, expect, it } from "vitest";
import {
  columnCounts,
  createInitialState,
  filterTickets,
  prototypeReducer,
  validateEvent,
  validateIdea,
  type PrototypeState,
} from "./prototype";

const initial = (): PrototypeState => createInitialState();
const ticket = (state: PrototypeState, id: string) => state.tickets.find((t) => t.id === id)!;

describe("tickets", () => {
  it("moves a ticket to another column without touching the others", () => {
    const before = initial();
    const after = prototypeReducer(before, { type: "moveTicket", id: "t-resource-map", column: "doing" });
    expect(ticket(after, "t-resource-map").column).toBe("doing");
    expect(after.tickets.filter((t) => t.id !== "t-resource-map")).toEqual(
      before.tickets.filter((t) => t.id !== "t-resource-map"),
    );
    expect(after.lastMove).toEqual({ id: "t-resource-map", from: "next", to: "doing" });
  });

  it("ignores a move to the same column and unknown tickets", () => {
    const before = initial();
    expect(prototypeReducer(before, { type: "moveTicket", id: "t-resource-map", column: "next" })).toBe(before);
    expect(prototypeReducer(before, { type: "moveTicket", id: "nope", column: "done" })).toBe(before);
  });

  it("shifts a ticket one column left/right and stops at the edges", () => {
    let state = initial();
    state = prototypeReducer(state, { type: "shiftTicket", id: "t-session-agenda", direction: 1 });
    expect(ticket(state, "t-session-agenda").column).toBe("done");
    const atEdge = prototypeReducer(state, { type: "shiftTicket", id: "t-session-agenda", direction: 1 });
    expect(atEdge).toBe(state);
    state = prototypeReducer(state, { type: "shiftTicket", id: "t-resource-map", direction: -1 });
    expect(ticket(state, "t-resource-map").column).toBe("next");
  });

  it("filters by owner and counts per column", () => {
    const state = initial();
    const anas = filterTickets(state.tickets, "ana");
    expect(anas.length).toBeGreaterThan(0);
    expect(anas.every((t) => t.owner === "ana")).toBe(true);
    expect(filterTickets(state.tickets, "all")).toHaveLength(state.tickets.length);
    const counts = columnCounts(state.tickets);
    expect(counts.next + counts.doing + counts.review + counts.done).toBe(state.tickets.length);
  });

  it("every team member owns at least one fixture ticket", () => {
    const owners = new Set(initial().tickets.map((t) => t.owner));
    expect([...owners].sort()).toEqual(["ana", "ben", "vince"]);
  });
});

describe("ideas", () => {
  it("validates idea text", () => {
    expect(validateIdea("   ")).toBe("backlog.ideaRequired");
    expect(validateIdea("Try a calmer weekly review")).toBeNull();
  });

  it("adds a trimmed local idea at the top of the backlog", () => {
    const before = initial();
    const after = prototypeReducer(before, { type: "addIdea", title: "  Try a calmer weekly review ", owner: "vince" });
    expect(after.backlog).toHaveLength(before.backlog.length + 1);
    expect(after.backlog[0]).toMatchObject({ title: "Try a calmer weekly review", owner: "vince", kind: "idea", local: true });
  });

  it("refuses an empty idea", () => {
    const before = initial();
    expect(prototypeReducer(before, { type: "addIdea", title: " ", owner: "ana" })).toBe(before);
  });
});

describe("calendar events", () => {
  const draft = { title: "Planning call", date: "2026-10-16", start: "09:00", end: "10:00", type: "session" as const, createdBy: "ana" as const };

  it("validates title and time order", () => {
    expect(validateEvent(draft)).toBeNull();
    expect(validateEvent({ ...draft, title: "  " })).toBe("calendar.titleRequired");
    expect(validateEvent({ ...draft, end: "09:00" })).toBe("calendar.endBeforeStart");
    expect(validateEvent({ ...draft, date: "" })).toBe("calendar.dateRequired");
    expect(validateEvent({ ...draft, date: "2026-13-40" })).toBe("calendar.dateRequired");
    expect(validateEvent({ ...draft, start: "" })).toBe("calendar.timeRequired");
  });

  it("adds a local event", () => {
    const before = initial();
    const after = prototypeReducer(before, { type: "addEvent", event: draft });
    expect(after.events).toHaveLength(before.events.length + 1);
    expect(after.events.at(-1)).toMatchObject({ ...draft, local: true });
  });

  it("refuses an invalid event", () => {
    const before = initial();
    expect(prototypeReducer(before, { type: "addEvent", event: { ...draft, end: "08:00" } })).toBe(before);
  });
});

describe("whiteboard notes", () => {
  const bounds = { width: 1000, height: 600 };

  it("adds sticky and text notes with unique ids", () => {
    let state = initial();
    const count = state.notes.length;
    state = prototypeReducer(state, { type: "addNote", kind: "sticky", color: "lilac", text: "Hello", x: 10, y: 20 });
    state = prototypeReducer(state, { type: "addNote", kind: "text", color: "sand", text: "World", x: 30, y: 40 });
    expect(state.notes).toHaveLength(count + 2);
    expect(new Set(state.notes.map((n) => n.id)).size).toBe(state.notes.length);
    expect(state.notes.at(-1)).toMatchObject({ kind: "text", text: "World", x: 30, y: 40 });
  });

  it("moves and nudges a note inside the board bounds", () => {
    let state = initial();
    const id = state.notes[0]!.id;
    state = prototypeReducer(state, { type: "moveNote", id, x: 5000, y: -50, bounds });
    const moved = state.notes.find((n) => n.id === id)!;
    expect(moved.x).toBeLessThanOrEqual(bounds.width);
    expect(moved.x).toBeGreaterThan(0);
    expect(moved.y).toBe(0);
    state = prototypeReducer(state, { type: "nudgeNote", id, dx: 0, dy: 24, bounds });
    expect(state.notes.find((n) => n.id === id)!.y).toBe(24);
  });

  it("edits and removes a note", () => {
    let state = initial();
    const id = state.notes[0]!.id;
    state = prototypeReducer(state, { type: "editNote", id, text: "Edited" });
    expect(state.notes.find((n) => n.id === id)!.text).toBe("Edited");
    state = prototypeReducer(state, { type: "removeNote", id });
    expect(state.notes.find((n) => n.id === id)).toBeUndefined();
  });
});
