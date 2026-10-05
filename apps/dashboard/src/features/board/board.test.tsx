import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/components/providers/I18nProvider";
import { ToastProvider } from "@/components/providers/ToastProvider";
import type { SnapshotResult, WorkSnapshot, WriteResult } from "@/features/work/types";
import { WorkProvider } from "@/features/work/WorkProvider";
import { issue, makeSnapshot, STATUS } from "@/test/work-fixture";
import { BacklogView } from "./BacklogView";
import { BoardView } from "./BoardView";

type Handler = (url: string, init?: RequestInit) => SnapshotResult | WriteResult | Promise<SnapshotResult | WriteResult>;

let handler: Handler;
const requests: { url: string; body?: unknown }[] = [];

beforeEach(() => {
  requests.length = 0;
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined });
    return new Response(JSON.stringify(await handler(url, init)), { status: 200, headers: { "content-type": "application/json" } });
  });
});

afterEach(() => vi.unstubAllGlobals());

const wrap = (node: ReactNode) => (
  <I18nProvider>
    <WorkProvider>
      <ToastProvider>{node}</ToastProvider>
    </WorkProvider>
  </I18nProvider>
);

const serve = (snapshot: WorkSnapshot) => (): SnapshotResult => ({ ok: true, snapshot });
const column = (name: string) => screen.getByRole("region", { name });

describe("Board — Jira projection", () => {
  it("renders the five Jira states with each issue's real key, summary, status and assignee", async () => {
    handler = serve(makeSnapshot());
    render(wrap(<BoardView />));
    await screen.findByTestId("work-source");
    const names = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    expect(names).toEqual(["Backlog", "Zur Entwicklung ausgewählt", "In Arbeit", "Review", "Erledigt"]);
    const card = within(column("In Arbeit")).getByText("Prepare the shared resource map").closest("article")!;
    expect(card).toHaveAttribute("data-ticket-id", "ANA-904");
    expect(within(card).getByText("ANA-904")).toHaveAttribute("href", "https://jira.example.invalid/browse/ANA-904");
    expect(within(card).getByTestId("ticket-status")).toHaveTextContent("In Arbeit");
    expect(within(card).getByText("Avery Example")).toBeInTheDocument();
    expect(within(column("Backlog")).getAllByText("Unassigned")).toHaveLength(2);
    expect(screen.getByTestId("work-source")).toHaveTextContent("Jira · ANA board (734) · filter 10733");
  });

  it("shows a BLOCKED connector state with the reason and no work at all", async () => {
    handler = () => ({ ok: false, failure: { state: "BLOCKED", code: "not-configured" } });
    render(wrap(<BoardView />));
    const alert = await screen.findByTestId("work-failure");
    expect(alert).toHaveAttribute("data-state", "BLOCKED");
    expect(alert).toHaveTextContent("BLOCKED");
    expect(alert).toHaveTextContent("The Jira connection is not configured");
    expect(screen.queryAllByTestId("ticket")).toEqual([]);
  });

  it("a keyboard move is written through Jira and shown only as confirmed after Jira's answer", async () => {
    const snapshot = makeSnapshot();
    let release!: (value: WriteResult) => void;
    handler = (url) => (url.includes("/transition") ? new Promise<WriteResult>((resolve) => (release = resolve)) : serve(snapshot)());
    const user = userEvent.setup();
    render(wrap(<BoardView />));
    const card = await screen.findByText("Prepare the shared resource map");
    act(() => card.closest("article")!.focus());
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");

    // pending: shown in the requested column, marked as being written
    const pending = await within(column("Review")).findByText("Prepare the shared resource map");
    expect(pending.closest("article")).toHaveAttribute("data-pending", "true");
    expect(within(pending.closest("article")!).getByTestId("ticket-status")).toHaveTextContent("Writing to Jira…");
    expect(requests.find((r) => r.url.includes("/transition"))).toEqual({
      url: "/api/work/issues/ANA-904/transition",
      body: { fromStatusId: STATUS.doing.id, toStatusIds: [STATUS.review.id] },
    });

    await act(async () => release({ ok: true, issue: { ...snapshot.issues[4]!, status: STATUS.review }, verifiedAt: "2026-10-05T08:01:00.000Z" }));
    const confirmed = within(column("Review")).getByText("Prepare the shared resource map").closest("article")!;
    expect(confirmed).not.toHaveAttribute("data-pending");
    expect(within(confirmed).getByTestId("ticket-status")).toHaveTextContent("Review");
    expect(await screen.findByTestId("toast")).toHaveTextContent("ANA-904 → Review · confirmed by Jira");
  });

  it("a refused move returns the issue to Jira's truth and shows BLOCKED, then re-reads the board", async () => {
    const snapshot = makeSnapshot();
    handler = (url) =>
      url.includes("/transition")
        ? { ok: false, failure: { state: "BLOCKED", code: "unsupported-transition", issue: snapshot.issues[4], detail: "Jira offers no transition" } }
        : serve(snapshot)();
    const user = userEvent.setup();
    render(wrap(<BoardView />));
    const card = await screen.findByText("Prepare the shared resource map");
    act(() => card.closest("article")!.focus());
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    const notice = await screen.findByTestId("move-failure");
    expect(notice).toHaveAttribute("data-state", "BLOCKED");
    expect(notice).toHaveTextContent("ANA-904");
    expect(within(column("In Arbeit")).getByText("Prepare the shared resource map")).toBeInTheDocument();
    await waitFor(() => expect(requests.filter((r) => r.url === "/api/work")).toHaveLength(2));
  });

  it("a failed move shows Jira's truth from the failure at once, before the board is re-read", async () => {
    const snapshot = makeSnapshot();
    let reads = 0;
    handler = (url) => {
      if (url.includes("/transition")) {
        // someone finished the issue in Jira meanwhile: the readback says Erledigt
        return { ok: false, failure: { state: "UNKNOWN", code: "stale", issue: { ...snapshot.issues[4]!, status: STATUS.done } } };
      }
      // the follow-up re-read never answers here, so only the failure's own truth can move the card
      return ++reads === 1 ? serve(snapshot)() : new Promise<SnapshotResult>(() => undefined);
    };
    const user = userEvent.setup();
    render(wrap(<BoardView />));
    const card = await screen.findByText("Prepare the shared resource map");
    act(() => card.closest("article")!.focus());
    await user.keyboard("{Shift>}{ArrowRight}{/Shift}");
    expect(await screen.findByTestId("move-failure")).toHaveAttribute("data-state", "UNKNOWN");
    expect(within(column("Erledigt")).getByText("Prepare the shared resource map")).toBeInTheDocument();
    expect(within(column("In Arbeit")).queryByText("Prepare the shared resource map")).toBeNull();
  });

  it("a failed refresh keeps the last Jira read visible but dated, marked UNKNOWN, and pauses moves", async () => {
    let calls = 0;
    handler = () => (++calls === 1 ? serve(makeSnapshot())() : { ok: false, failure: { state: "UNKNOWN", code: "unavailable" } });
    const user = userEvent.setup();
    render(wrap(<BoardView />));
    await screen.findByTestId("work-source");
    await user.click(screen.getByTestId("work-refresh"));
    const stale = await screen.findByTestId("work-stale");
    expect(stale).toHaveAttribute("data-state", "UNKNOWN");
    expect(stale).toHaveTextContent("Moves and new ideas are paused");
    expect(screen.getAllByTestId("ticket")[0]).toHaveAttribute("draggable", "false");
  });
});

describe("Backlog — same Jira items, Add idea through Jira", () => {
  const REQUEST_RE = /^[0-9a-f-]{36}$/;

  it("lists exactly the Board's Backlog column items", async () => {
    handler = serve(makeSnapshot());
    render(wrap(<BacklogView />));
    await screen.findByTestId("work-source");
    expect(screen.getAllByTestId("backlog-item").map((row) => row.getAttribute("data-backlog-key"))).toEqual(["ANA-901", "ANA-902", "ANA-907"]);
  });

  it("shows the durable key only after Jira confirmed the new idea", async () => {
    const created = issue("ANA-950", "Try a shared weekly review", STATUS.backlog, null, { isIdea: true });
    handler = (url) =>
      url === "/api/work/ideas"
        ? { ok: true, issue: created, verifiedAt: "2026-10-05T08:02:00.000Z" }
        : serve(url.includes("reconcile") ? { ...makeSnapshot(), issues: [created, ...makeSnapshot().issues] } : makeSnapshot())();
    const user = userEvent.setup();
    render(wrap(<BacklogView />));
    await user.click(await screen.findByTestId("add-idea"));
    await user.type(screen.getByTestId("idea-input"), "Try a shared weekly review");
    await user.click(screen.getByTestId("idea-submit"));
    expect(await screen.findByTestId("idea-created")).toHaveTextContent("ANA-950 created in Jira Backlog · confirmed by readback");
    const post = requests.find((r) => r.url === "/api/work/ideas")!;
    expect(post.body).toMatchObject({ summary: "Try a shared weekly review" });
    expect((post.body as { requestId: string }).requestId).toMatch(REQUEST_RE);
    await waitFor(() => expect(requests.some((r) => r.url === "/api/work?reconcile=950")).toBe(true));
    expect(screen.getAllByTestId("backlog-item")[0]).toHaveAttribute("data-backlog-key", "ANA-950");
  });

  it("an unconfirmed create stays UNKNOWN, keeps the draft, and a check reuses the same request id", async () => {
    handler = (url, init) =>
      url === "/api/work/ideas"
        ? { ok: false, failure: { state: "UNKNOWN", code: "write-unconfirmed", requestId: JSON.parse(String(init?.body)).requestId } }
        : serve(makeSnapshot())();
    const user = userEvent.setup();
    render(wrap(<BacklogView />));
    await user.click(await screen.findByTestId("add-idea"));
    await user.type(screen.getByTestId("idea-input"), "Unclear outcome");
    await user.click(screen.getByTestId("idea-submit"));
    const failure = await screen.findByTestId("idea-failure");
    expect(failure).toHaveAttribute("data-state", "UNKNOWN");
    expect(screen.queryByTestId("idea-created")).toBeNull();
    expect(screen.getByTestId("idea-input")).toHaveValue("Unclear outcome");
    expect(screen.getByTestId("idea-submit")).toHaveTextContent("Check Jira again");
    await user.click(screen.getByTestId("idea-submit"));
    await waitFor(() => expect(requests.filter((r) => r.url === "/api/work/ideas")).toHaveLength(2));
    const [first, second] = requests.filter((r) => r.url === "/api/work/ideas").map((r) => (r.body as { requestId: string }).requestId);
    expect(second).toBe(first);
  });

  it("an empty idea is refused locally and nothing is sent to Jira", async () => {
    handler = serve(makeSnapshot());
    const user = userEvent.setup();
    render(wrap(<BacklogView />));
    await user.click(await screen.findByTestId("add-idea"));
    await user.click(screen.getByTestId("idea-submit"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Write a short idea first.");
    expect(requests.some((r) => r.url === "/api/work/ideas")).toBe(false);
  });

  it("Add idea is unavailable while Jira cannot be read", async () => {
    handler = () => ({ ok: false, failure: { state: "BLOCKED", code: "auth" } });
    render(wrap(<BacklogView />));
    expect(await screen.findByTestId("work-failure")).toHaveTextContent("Jira rejected the dashboard's credentials.");
    expect(screen.getByTestId("add-idea")).toBeDisabled();
  });
});
