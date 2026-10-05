// @vitest-environment node
import { describe, expect, it } from "vitest";
import { backlogIssues, columnForStatus } from "@/features/work/model";
import type { WorkSnapshot } from "@/features/work/types";
import { fakeJiraClient } from "@/test/fake-jira-fetch";
import { moveIssue, readSnapshot, validateMove } from "./work";

const S = { backlog: "10040", selected: "10182", doing: "10113", review: "10216", done: "10115" } as const;

async function snapshot(client = fakeJiraClient().client): Promise<WorkSnapshot> {
  const result = await readSnapshot(client);
  if (!result.ok) throw new Error(`snapshot failed: ${result.failure.code}`);
  return result.snapshot;
}

describe("readSnapshot — Board 734 / filter 10733 projection", () => {
  it("renders exactly the five mapped workflow states in Jira's order and drops the empty Kanban-backlog column", async () => {
    const snap = await snapshot();
    expect(snap.columns.map((c) => c.name)).toEqual(["Backlog", "Zur Entwicklung ausgewählt", "In Arbeit", "Review", "Erledigt"]);
    expect(snap.columns.map((c) => c.statuses.map((s) => s.id))).toEqual([[S.backlog], [S.selected], [S.doing], [S.review], [S.done]]);
    expect(snap.columns.filter((c) => c.isBacklog).map((c) => c.name)).toEqual(["Backlog"]);
    expect(snap.source).toEqual({ boardId: 734, boardName: "ANA board", filterId: "10733", projectKey: "ANA", site: "jira.example.invalid" });
  });

  it("maps every issue to its real key, summary, Jira status and assignee, in rank order", async () => {
    const snap = await snapshot();
    expect(snap.issues.map((i) => i.key)).toEqual(["ANA-901", "ANA-902", "ANA-907", "ANA-903", "ANA-904", "ANA-908", "ANA-905", "ANA-906"]);
    expect(snap.issues.find((i) => i.key === "ANA-904")).toEqual({
      id: "15904",
      key: "ANA-904",
      summary: "Prepare the shared resource map",
      status: { id: S.doing, name: "In Arbeit", category: "indeterminate" },
      assignee: { accountId: "fake-account-avery", displayName: "Avery Example" },
      issueType: "Task",
      isIdea: false,
      url: "https://jira.example.invalid/browse/ANA-904",
    });
    expect(snap.issues.find((i) => i.key === "ANA-901")!.assignee).toBeNull();
    expect(snap.issues.find((i) => i.key === "ANA-907")!.isIdea).toBe(true);
    expect(snap.unmapped).toEqual([]);
    expect(snap.truncated).toBe(false);
  });

  it("Board Backlog column and the dedicated Backlog view use the same Jira items", async () => {
    const snap = await snapshot();
    const column = snap.columns.find((c) => c.isBacklog)!;
    const inColumn = snap.issues.filter((i) => columnForStatus(snap.columns, i.status.id)?.id === column.id);
    expect(backlogIssues(snap)).toEqual(inColumn);
    expect(backlogIssues(snap).map((i) => i.key)).toEqual(["ANA-901", "ANA-902", "ANA-907"]);
  });

  it("issues in a status without a board column are reported as unmapped, not hidden or invented", async () => {
    const { fake, client } = fakeJiraClient();
    fake.setBoard({ withReview: false });
    const snap = await snapshot(client);
    expect(snap.columns.map((c) => c.name)).toEqual(["Backlog", "Zur Entwicklung ausgewählt", "In Arbeit", "Erledigt"]);
    expect(snap.unmapped.map((i) => [i.key, i.status.name])).toEqual([["ANA-905", "Review"]]);
  });

  it("refuses a drifted board (filter or project changed) as BLOCKED instead of substituting a source", async () => {
    const { fake, client } = fakeJiraClient();
    fake.setBoard({ filterId: "10734" });
    const result = await readSnapshot(client);
    expect(result).toMatchObject({ ok: false, failure: { state: "BLOCKED", code: "board-drift" } });
  });

  it.each([
    [{ op: "board" as const, mode: "status" as const, status: 401 }, "BLOCKED", "auth"],
    [{ op: "search" as const, mode: "status" as const, status: 403 }, "BLOCKED", "forbidden"],
    [{ op: "statuses" as const, mode: "status" as const, status: 500 }, "ERROR", "upstream"],
    [{ op: "search" as const, mode: "network" as const }, "UNKNOWN", "unavailable"],
    [{ op: "board" as const, mode: "delay" as const, ms: 1_000 }, "UNKNOWN", "unavailable"],
  ])("connector failure %o is visible as %s / %s", async (fault, state, code) => {
    const { fake, client } = fakeJiraClient();
    fake.addFault(fault);
    const result = await readSnapshot(client);
    expect(result).toMatchObject({ ok: false, failure: { state, code } });
  });

  it("a wrong credential is BLOCKED (401), and the token never appears in the failure", async () => {
    const { client } = fakeJiraClient({ token: "wrong-secret-token-value" });
    const result = await readSnapshot(client);
    expect(result).toMatchObject({ ok: false, failure: { state: "BLOCKED", code: "auth" } });
    expect(JSON.stringify(result)).not.toContain("wrong-secret-token-value");
  });

  it("asks Jira for read-after-write consistency so a just-created issue is not missing", async () => {
    const { fake, client } = fakeJiraClient();
    fake.setSearchLag(60_000);
    fake.handle("POST", "/rest/api/3/issue", { authorization: (await import("../../../e2e/fake-jira/core.mjs")).FAKE_AUTH_HEADER }, {
      fields: { project: { key: "ANA" }, issuetype: { name: "Task" }, summary: "Fresh idea", labels: [] },
    });
    const fresh = fake.summary().issues.at(-1)!;
    const id = fake.issue(fresh.key)!.id;
    const without = await snapshot(client);
    expect(without.issues.map((i) => i.key)).not.toContain(fresh.key);
    const result = await readSnapshot(client, { reconcileIssueIds: [id] });
    expect(result.ok && result.snapshot.issues.map((i) => i.key)).toContain(fresh.key);
  });
});

describe("moveIssue — Jira transitions with mandatory readback", () => {
  it("walks one issue through every supported transition, including Review, each confirmed by readback", async () => {
    const { fake, client } = fakeJiraClient();
    const path = [S.selected, S.doing, S.review, S.done, S.backlog];
    let from: string = S.backlog;
    for (const to of path) {
      const result = await moveIssue(client, "ANA-901", { fromStatusId: from, toStatusIds: [to] });
      expect(result, `→ ${to}`).toMatchObject({ ok: true, issue: { key: "ANA-901", status: { id: to } } });
      expect(fake.issue("ANA-901")!.fields.status.id).toBe(to);
      from = to;
    }
    // transitions out of Review in both directions
    await moveIssue(client, "ANA-905", { fromStatusId: S.review, toStatusIds: [S.doing] });
    expect(fake.issue("ANA-905")!.fields.status.id).toBe(S.doing);
    await moveIssue(client, "ANA-905", { fromStatusId: S.doing, toStatusIds: [S.review] });
    expect(fake.issue("ANA-905")!.fields.status.id).toBe(S.review);
  });

  it("uses the transition id Jira offers for the issue, not an assumed one", async () => {
    const { fake, client } = fakeJiraClient();
    const auth = (await import("../../../e2e/fake-jira/core.mjs")).FAKE_AUTH_HEADER;
    const offered = fake.handle("GET", "/rest/api/3/issue/ANA-904/transitions", { authorization: auth }).body as { transitions: { id: string; to: { id: string } }[] };
    const toReview = offered.transitions.find((t) => t.to.id === S.review)!;
    expect(toReview.id).not.toBe("51"); // the fake hands out issue-specific ids, so an assumed id would be refused
    expect(fake.handle("POST", "/rest/api/3/issue/ANA-904/transitions", { authorization: auth }, { transition: { id: "51" } }).status).toBe(400);
    const result = await moveIssue(client, "ANA-904", { fromStatusId: S.doing, toStatusIds: [S.review] });
    expect(result).toMatchObject({ ok: true, issue: { status: { id: S.review } } });
  });

  it("an issue already in the target status is confirmed by reading it, without a write", async () => {
    const { fake, client } = fakeJiraClient();
    const result = await moveIssue(client, "ANA-905", { fromStatusId: S.doing, toStatusIds: [S.review] });
    expect(result.ok).toBe(true);
    expect(fake.calls.filter((c) => c.startsWith("POST /rest/api/3/issue/ANA-905/transitions"))).toEqual([]);
  });

  it("an unsupported transition is BLOCKED and changes nothing", async () => {
    const { fake, client } = fakeJiraClient();
    fake.addFault({ op: "transitions", mode: "drop-transition", toStatusId: S.review });
    const result = await moveIssue(client, "ANA-904", { fromStatusId: S.doing, toStatusIds: [S.review] });
    expect(result).toMatchObject({ ok: false, failure: { state: "BLOCKED", code: "unsupported-transition", issue: { key: "ANA-904", status: { id: S.doing } } } });
    expect(fake.issue("ANA-904")!.fields.status.id).toBe(S.doing);
  });

  it("a target that is not a column of Board 734 is BLOCKED before anything is written", async () => {
    const { fake, client } = fakeJiraClient();
    fake.setBoard({ withReview: false });
    const result = await moveIssue(client, "ANA-904", { fromStatusId: S.doing, toStatusIds: [S.review] });
    expect(result).toMatchObject({ ok: false, failure: { state: "BLOCKED", code: "unsupported-transition" } });
    expect(fake.issue("ANA-904")!.fields.status.id).toBe(S.doing);
  });

  it("a readback that does not show the requested status is an ERROR with Jira's truth", async () => {
    const { fake, client } = fakeJiraClient();
    fake.addFault({ op: "transition", mode: "ignore" });
    const result = await moveIssue(client, "ANA-904", { fromStatusId: S.doing, toStatusIds: [S.review] });
    expect(result).toMatchObject({ ok: false, failure: { state: "ERROR", code: "readback-mismatch", issue: { status: { id: S.doing } } } });
  });

  it("a rejected write is an ERROR and the issue keeps its Jira status", async () => {
    const { fake, client } = fakeJiraClient();
    fake.addFault({ op: "transition", mode: "status", status: 400 });
    const result = await moveIssue(client, "ANA-904", { fromStatusId: S.doing, toStatusIds: [S.review] });
    expect(result).toMatchObject({ ok: false, failure: { state: "ERROR", code: "write-failed", issue: { status: { id: S.doing } } } });
  });

  it("a permission failure on the write is BLOCKED", async () => {
    const { fake, client } = fakeJiraClient();
    fake.addFault({ op: "transition", mode: "status", status: 403 });
    const result = await moveIssue(client, "ANA-904", { fromStatusId: S.doing, toStatusIds: [S.review] });
    expect(result).toMatchObject({ ok: false, failure: { state: "BLOCKED", code: "forbidden" } });
  });

  it("a write that timed out after Jira committed it is confirmed by readback", async () => {
    const { fake, client } = fakeJiraClient();
    fake.addFault({ op: "transition", mode: "commit-then-delay", ms: 1_000 });
    const result = await moveIssue(client, "ANA-904", { fromStatusId: S.doing, toStatusIds: [S.review] });
    expect(result).toMatchObject({ ok: true, issue: { status: { id: S.review } } });
  });

  it("a write with no clear answer and no visible change stays UNKNOWN, never success", async () => {
    const { fake, client } = fakeJiraClient();
    fake.addFault({ op: "transition", mode: "status", status: 502 });
    const result = await moveIssue(client, "ANA-904", { fromStatusId: S.doing, toStatusIds: [S.review] });
    expect(result).toMatchObject({ ok: false, failure: { state: "UNKNOWN", code: "write-unconfirmed", issue: { status: { id: S.doing } } } });
  });

  it("a failed readback after the write is UNKNOWN", async () => {
    const { fake, client } = fakeJiraClient();
    // the read before the write passes; the readback after it fails
    let reads = 0;
    const original = fake.handle.bind(fake);
    fake.handle = (method, path, headers, body) => {
      if (method === "GET" && path.startsWith("/rest/api/3/issue/ANA-904?") && ++reads === 2) return { status: 0, body: null, network: true };
      return original(method, path, headers, body);
    };
    const result = await moveIssue(client, "ANA-904", { fromStatusId: S.doing, toStatusIds: [S.review] });
    expect(result).toMatchObject({ ok: false, failure: { state: "UNKNOWN", code: "write-unconfirmed" } });
  });

  it("a stale source status (someone moved it in Jira) is UNKNOWN with the current Jira truth and no write", async () => {
    const { fake, client } = fakeJiraClient();
    const result = await moveIssue(client, "ANA-904", { fromStatusId: S.selected, toStatusIds: [S.review] });
    expect(result).toMatchObject({ ok: false, failure: { state: "UNKNOWN", code: "stale", issue: { status: { id: S.doing } } } });
    expect(fake.calls.some((c) => c.startsWith("POST"))).toBe(false);
  });

  it("a board or project Jira will not show (404) is BLOCKED as an unreadable source, not 'issue not found'", async () => {
    const { fake, client } = fakeJiraClient();
    fake.addFault({ op: "board", mode: "status", status: 404 });
    expect(await readSnapshot(client)).toMatchObject({ ok: false, failure: { state: "BLOCKED", code: "source-missing" } });
  });

  it("an unknown issue is an ERROR", async () => {
    const { client } = fakeJiraClient();
    const result = await moveIssue(client, "ANA-999", { fromStatusId: S.doing, toStatusIds: [S.review] });
    expect(result).toMatchObject({ ok: false, failure: { state: "ERROR", code: "not-found" } });
  });
});

describe("validateMove", () => {
  it("accepts only ANA keys and numeric status ids", () => {
    expect(validateMove("ANA-12", { fromStatusId: "10040", toStatusIds: ["10182"] })).toEqual({ fromStatusId: "10040", toStatusIds: ["10182"] });
    expect(validateMove("OTHER-12", { fromStatusId: "10040", toStatusIds: ["10182"] })).toBeNull();
    expect(validateMove("ANA-12", { fromStatusId: "x", toStatusIds: ["10182"] })).toBeNull();
    expect(validateMove("ANA-12", { fromStatusId: "10040", toStatusIds: [] })).toBeNull();
    expect(validateMove("ANA-12", { fromStatusId: "10040", toStatusIds: ["1; DROP"] })).toBeNull();
    expect(validateMove("ANA-12", null)).toBeNull();
  });
});
