import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/providers/I18nProvider";
import { OfficeBoard } from "./OfficeBoard";

const TICKET = {
  id: "t1",
  title: "New website draft",
  description: "First look at the homepage.",
  column: "doing",
  assignee: "vince",
  position: 1,
  createdAt: "2026-11-01T10:00:00.000Z",
  updatedAt: "2026-11-01T10:00:00.000Z",
  createdBy: "ben",
  archived: false,
};

function fakeFetch(me: "ana" | "ben", openQuestions = 1) {
  const calls: Array<{ url: string; method: string; body?: unknown }> = [];
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    calls.push({ url, method, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    const json = (b: unknown) => new Response(JSON.stringify(b), { status: 200, headers: { "Content-Type": "application/json" } });
    if (url === "/api/office/tickets" && method === "GET") return json({ ok: true, me, tickets: [{ ...TICKET, entries: 1, attachments: 0, openQuestions }] });
    if (url === "/api/office/tickets/t1" && method === "GET")
      return json({ ok: true, ticket: TICKET, entries: [{ id: "e1", ticketId: "t1", author: "ana", body: "Can I see it on my phone?", isQuestion: true, questionResolved: false, createdAt: "2026-11-02T10:00:00.000Z" }] });
    if (url === "/api/office/tickets/t1/entries") return json({ ok: true, entry: {} });
    if (url === "/api/office/tickets/t1" && method === "PATCH") return json({ ok: true, ticket: TICKET });
    return new Response(JSON.stringify({ ok: false, reason: "nope" }), { status: 500 });
  });
  vi.stubGlobal("fetch", fn);
  return calls;
}

afterEach(() => vi.unstubAllGlobals());

const show = () => render(<I18nProvider><OfficeBoard /></I18nProvider>);

describe("OfficeBoard", () => {
  it("shows three columns, the ticket in 'Working on it' and an open question mark", async () => {
    fakeFetch("ana");
    show();
    const doing = await screen.findByTestId("office-col-doing");
    expect(within(doing).getByText("New website draft")).toBeTruthy();
    expect(within(doing).getByTestId("office-question")).toBeTruthy();
    expect(screen.getByTestId("office-col-todo")).toBeTruthy();
    expect(screen.getByTestId("office-col-done")).toBeTruthy();
  });

  it("gives Ana no buttons to create or move tickets", async () => {
    fakeFetch("ana");
    show();
    await screen.findByText("New website draft");
    expect(screen.queryByTestId("office-new")).toBeNull();
    expect(screen.queryByRole("button", { name: /Move to/ })).toBeNull();
  });

  it("lets Ana open a ticket, read the history and send a question", async () => {
    const calls = fakeFetch("ana");
    show();
    await userEvent.click(await screen.findByRole("button", { name: /Open ticket: New website draft/ }));
    const dialog = await screen.findByTestId("office-ticket");
    expect(within(dialog).getByText("First look at the homepage.")).toBeTruthy();
    expect(await within(dialog).findByText("Can I see it on my phone?")).toBeTruthy();
    await userEvent.type(within(dialog).getByRole("textbox"), "Is the colour final?");
    await userEvent.click(within(dialog).getByRole("button", { name: "Send" }));
    await waitFor(() => expect(calls.some((c) => c.url === "/api/office/tickets/t1/entries")).toBe(true));
    const sent = calls.find((c) => c.url === "/api/office/tickets/t1/entries")!.body as { body: string; isQuestion: boolean };
    expect(sent).toEqual({ body: "Is the colour final?", isQuestion: true });
  });

  it("lets Ben move a ticket with the arrow buttons", async () => {
    const calls = fakeFetch("ben", 0);
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Move to Done" }));
    await waitFor(() => expect(calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(calls.find((c) => c.method === "PATCH")!.body).toEqual({ column: "done" });
  });

  it("says so honestly when the board cannot load", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    show();
    expect(await screen.findByText(/could not be loaded/)).toBeTruthy();
  });
});
