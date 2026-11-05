import { render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/providers/I18nProvider";
import type { TicketSummary } from "./api";
import { BerlinRoom, deskTicket, wallNotes } from "./BerlinRoom";

const T = (over: Partial<TicketSummary>): TicketSummary => ({
  id: "x",
  title: "T",
  description: "",
  column: "todo",
  assignee: "none",
  position: 1,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
  createdBy: "ben",
  archived: false,
  entries: 0,
  attachments: 0,
  openQuestions: 0,
  ...over,
});

afterEach(() => vi.unstubAllGlobals());

describe("desk notes and the wall", () => {
  it("put the first 'doing' ticket of each person on their desk", () => {
    const list = [T({ id: "a", column: "doing", assignee: "ben", position: 2, title: "Later" }), T({ id: "b", column: "doing", assignee: "ben", position: 1, title: "Now" }), T({ id: "c", column: "todo", assignee: "vince" })];
    expect(deskTicket(list, "ben")?.title).toBe("Now");
    expect(deskTicket(list, "vince")).toBeNull();
  });
  it("mark tickets with an open question on the wall", () => {
    const notes = wallNotes([T({ id: "q", openQuestions: 2 }), T({ id: "n" })]);
    expect(notes.map((n) => [n.id, n.question])).toEqual([["q", true], ["n", false]]);
  });
});

describe("BerlinRoom without WebGL", () => {
  it("opens the board right away instead of an empty room", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true, me: "ana", tickets: [T({ id: "t1", title: "New website draft", column: "doing", assignee: "vince", openQuestions: 1 })] }), { status: 200 })),
    );
    render(
      <I18nProvider>
        <BerlinRoom onClose={() => undefined} />
      </I18nProvider>,
    );
    const room = await screen.findByTestId("berlin-room");
    const drawer = await within(room).findByTestId("berlin-drawer");
    expect(await within(drawer).findByText("New website draft")).toBeTruthy();
    expect(room.getAttribute("data-gl")).toBe("unsupported");
  });
});
