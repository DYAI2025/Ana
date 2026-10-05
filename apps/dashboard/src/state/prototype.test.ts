import { describe, expect, it } from "vitest";
import { createInitialState, prototypeReducer, validateEvent, type PrototypeState } from "./prototype";

const initial = (): PrototypeState => createInitialState();

describe("work is not prototype state (ANA-5)", () => {
  it("holds no tickets, backlog or ideas — Board and Backlog are a Jira projection", () => {
    expect(Object.keys(initial()).sort()).toEqual(["events", "notes", "seq"]);
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

describe("notes outside a shrunken board", () => {
  it("keep their stored position (a temporary shrink is not lossy)", () => {
    let state = initial();
    state = prototypeReducer(state, { type: "addNote", kind: "sticky", color: "sand", text: "Far", x: 1100, y: 700 });
    expect(state.notes.at(-1)).toMatchObject({ x: 1100, y: 700 });
  });

  it("nudge starts from the visible (clamped) position, so the first key press moves the note", () => {
    let state = initial();
    state = prototypeReducer(state, { type: "addNote", kind: "sticky", color: "sand", text: "Far", x: 1100, y: 100 });
    const id = state.notes.at(-1)!.id;
    state = prototypeReducer(state, { type: "nudgeNote", id, dx: -8, dy: 0, bounds: { width: 800, height: 500 } });
    expect(state.notes.find((n) => n.id === id)!.x).toBe(800 - 48 - 8);
  });
});
