// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fakeJiraClient } from "@/test/fake-jira-fetch";
import { createIdea, UNCONFIRMED_HOLD_MS, validateIdeaRequest, type IdeaLedger } from "./ideas";

const REQUEST = "3f2b8c1e-4d5a-4b6c-8d7e-9f0a1b2c3d4e";
const OTHER = "7a1c2e3f-5b6d-4e8f-9a0b-1c2d3e4f5a6b";
const noSleep = async () => undefined;

function setup(timeoutMs = 200) {
  const { fake, client } = fakeJiraClient({ timeoutMs });
  const ledger: IdeaLedger = new Map();
  let clock = 1_000_000;
  const options = { ledger, now: () => clock, sleep: noSleep };
  return { fake, client, ledger, options, advance: (ms: number) => (clock += ms) };
}

describe("Add idea creates exactly one Jira item in Backlog, confirmed by readback", () => {
  it("creates one Task in Backlog with the dashboard labels and request marker, and returns its durable key", async () => {
    const { fake, client, options } = setup();
    const result = await createIdea(client, { requestId: REQUEST, summary: "Try a shared weekly review" }, options);
    expect(result).toMatchObject({ ok: true, issue: { key: "ANA-920", summary: "Try a shared weekly review", status: { name: "Backlog" }, isIdea: true } });
    expect(fake.creates).toBe(1);
    const stored = fake.issue("ANA-920")!;
    expect(stored.fields.labels).toEqual(["ana-dashboard", "ana-idea"]);
    expect(stored.properties["ana.dashboard.request"]).toMatchObject({ requestId: REQUEST, source: "ana-dashboard", action: "add-idea" });
    // readback happened after the create: GET issue with the request property
    const calls = fake.calls;
    expect(calls.lastIndexOf("GET /rest/api/3/issue/ANA-920")).toBeGreaterThan(calls.indexOf("POST /rest/api/3/issue"));
  });

  it("a repeated submission with the same request id returns the same issue and creates nothing new", async () => {
    const { fake, client, options } = setup();
    const first = await createIdea(client, { requestId: REQUEST, summary: "Idea once" }, options);
    const again = await createIdea(client, { requestId: REQUEST, summary: "Idea once" }, options);
    expect(again).toMatchObject({ ok: true, replayed: true, issue: { key: first.ok ? first.issue.key : "" } });
    expect(fake.creates).toBe(1);
  });

  it("after a server restart (empty ledger) the request marker in Jira still prevents a duplicate", async () => {
    const { fake, client, options } = setup();
    await createIdea(client, { requestId: REQUEST, summary: "Survives restart" }, options);
    const restarted = await createIdea(client, { requestId: REQUEST, summary: "Survives restart" }, { ...options, ledger: new Map() });
    expect(restarted).toMatchObject({ ok: true, replayed: true });
    expect(fake.creates).toBe(1);
  });

  it("a create that timed out after Jira committed it is found by its marker and confirmed — still one issue", async () => {
    const { fake, client, options } = setup();
    fake.addFault({ op: "create", mode: "commit-then-delay", ms: 1_000 });
    const result = await createIdea(client, { requestId: REQUEST, summary: "Late answer" }, options);
    expect(result).toMatchObject({ ok: true, issue: { summary: "Late answer" } });
    expect(fake.creates).toBe(1);
    const retry = await createIdea(client, { requestId: REQUEST, summary: "Late answer" }, options);
    expect(retry).toMatchObject({ ok: true, replayed: true });
    expect(fake.creates).toBe(1);
  });

  it("an ambiguous create that is not visible in Jira is UNKNOWN and is not repeated before the hold expires", async () => {
    const { fake, client, options, advance } = setup();
    fake.setSearchLag(10 * 60_000); // Jira's search index has not caught up
    fake.addFault({ op: "create", mode: "commit-then-delay", ms: 1_000 });
    const first = await createIdea(client, { requestId: REQUEST, summary: "Lagging index" }, options);
    expect(first).toMatchObject({ ok: false, failure: { state: "UNKNOWN", code: "write-unconfirmed", requestId: REQUEST } });
    expect(fake.creates).toBe(1);

    const retry = await createIdea(client, { requestId: REQUEST, summary: "Lagging index" }, options);
    expect(retry).toMatchObject({ ok: false, failure: { state: "UNKNOWN", code: "write-unconfirmed" } });
    expect(fake.creates).toBe(1);

    // once the index has caught up the retry finds and confirms the one issue instead of creating another
    fake.setSearchLag(0);
    advance(UNCONFIRMED_HOLD_MS + 1);
    const settled = await createIdea(client, { requestId: REQUEST, summary: "Lagging index" }, options);
    expect(settled).toMatchObject({ ok: true, replayed: true });
    expect(fake.creates).toBe(1);
  });

  it("a create Jira did not perform (5xx) is UNKNOWN first; after the hold a retry creates exactly one", async () => {
    const { fake, client, options, advance } = setup();
    fake.addFault({ op: "create", mode: "status", status: 503, times: 1 });
    const first = await createIdea(client, { requestId: REQUEST, summary: "Second chance" }, options);
    expect(first).toMatchObject({ ok: false, failure: { state: "UNKNOWN", code: "write-unconfirmed" } });
    expect(fake.creates).toBe(0);
    advance(UNCONFIRMED_HOLD_MS + 1);
    const second = await createIdea(client, { requestId: REQUEST, summary: "Second chance" }, options);
    expect(second).toMatchObject({ ok: true });
    expect(fake.creates).toBe(1);
  });

  it("a rejected create is an ERROR, creates nothing, and a corrected retry may create", async () => {
    const { fake, client, options } = setup();
    fake.addFault({ op: "create", mode: "status", status: 400, times: 1 });
    const result = await createIdea(client, { requestId: REQUEST, summary: "Rejected once" }, options);
    expect(result).toMatchObject({ ok: false, failure: { state: "ERROR", code: "rejected", requestId: REQUEST } });
    expect(fake.creates).toBe(0);
    expect(await createIdea(client, { requestId: REQUEST, summary: "Rejected once" }, options)).toMatchObject({ ok: true });
    expect(fake.creates).toBe(1);
  });

  it("a permission failure is BLOCKED and creates nothing", async () => {
    const { fake, client, options } = setup();
    fake.addFault({ op: "create", mode: "status", status: 403 });
    expect(await createIdea(client, { requestId: REQUEST, summary: "No permission" }, options)).toMatchObject({ ok: false, failure: { state: "BLOCKED", code: "forbidden" } });
    expect(fake.creates).toBe(0);
  });

  it("when Jira cannot be searched for an earlier attempt, nothing is created (a duplicate cannot be ruled out)", async () => {
    const { fake, client, options } = setup();
    fake.addFault({ op: "search", mode: "network" });
    expect(await createIdea(client, { requestId: REQUEST, summary: "Search down" }, options)).toMatchObject({ ok: false, failure: { state: "UNKNOWN", code: "unavailable" } });
    expect(fake.creates).toBe(0);
  });

  it("an issue that Jira created outside Backlog is an ERROR (readback mismatch) and a retry does not create a second one", async () => {
    const { fake, client, options } = setup();
    fake.addFault({ op: "create", mode: "misplace", statusId: "10113" });
    const result = await createIdea(client, { requestId: REQUEST, summary: "Wrong column" }, options);
    expect(result).toMatchObject({ ok: false, failure: { state: "ERROR", code: "readback-mismatch", issue: { key: "ANA-920", status: { name: "In Arbeit" } } } });
    expect(await createIdea(client, { requestId: REQUEST, summary: "Wrong column" }, options)).toMatchObject({ ok: false, failure: { code: "readback-mismatch" } });
    expect(fake.creates).toBe(1);
  });

  it("a second submission while the first is in flight is UNKNOWN (duplicate in flight), not a second create", async () => {
    const { fake, client, options } = setup(2_000);
    fake.addFault({ op: "create", mode: "commit-then-delay", ms: 50 });
    const [first, second] = await Promise.all([
      createIdea(client, { requestId: REQUEST, summary: "Double click" }, options),
      createIdea(client, { requestId: REQUEST, summary: "Double click" }, options),
    ]);
    expect([first.ok, second.ok]).toEqual([true, false]);
    expect(second).toMatchObject({ ok: false, failure: { state: "UNKNOWN", code: "duplicate-in-flight" } });
    expect(fake.creates).toBe(1);
  });

  it("a key Jira returned is kept when the readback fails; the retry reads that key directly and never creates again", async () => {
    const { fake, client, options } = setup();
    fake.setSearchLag(10 * 60_000); // search cannot help here
    fake.addFault({ op: "issue", mode: "network", times: 1 }); // the readback right after the create fails
    const first = await createIdea(client, { requestId: REQUEST, summary: "Readback lost" }, options);
    expect(first).toMatchObject({ ok: false, failure: { state: "UNKNOWN", code: "write-unconfirmed", requestId: REQUEST } });
    expect(first.ok || first.failure.detail).toContain("ANA-920");
    const retry = await createIdea(client, { requestId: REQUEST, summary: "Readback lost" }, options);
    expect(retry).toMatchObject({ ok: true, replayed: true, issue: { key: "ANA-920" } });
    expect(fake.creates).toBe(1);
  });

  it("the hold restarts after every unanswered create, so a quick third attempt cannot create again", async () => {
    const { fake, client, options, advance } = setup();
    fake.setSearchLag(10 * 60_000);
    fake.addFault({ op: "create", mode: "commit-then-delay", ms: 1_000, times: 2 });
    await createIdea(client, { requestId: REQUEST, summary: "Degraded Jira" }, options);
    advance(UNCONFIRMED_HOLD_MS + 1);
    await createIdea(client, { requestId: REQUEST, summary: "Degraded Jira" }, options); // hold expired: a second create goes out, unanswered
    expect(fake.creates).toBe(2);
    advance(5_000);
    const third = await createIdea(client, { requestId: REQUEST, summary: "Degraded Jira" }, options);
    expect(third).toMatchObject({ ok: false, failure: { state: "UNKNOWN", code: "write-unconfirmed" } });
    expect(fake.creates).toBe(2);
  });

  it("the same idea under a new request id (reload, second tab) joins the unresolved earlier request instead of creating", async () => {
    const { fake, client, options } = setup();
    fake.setSearchLag(10 * 60_000);
    fake.addFault({ op: "create", mode: "commit-then-delay", ms: 1_000, times: 1 });
    await createIdea(client, { requestId: REQUEST, summary: "Typed twice" }, options);
    const again = await createIdea(client, { requestId: OTHER, summary: "Typed twice" }, options);
    expect(again).toMatchObject({ ok: false, failure: { state: "UNKNOWN", code: "write-unconfirmed", requestId: REQUEST } });
    expect(fake.creates).toBe(1);
  });

  it("a readback whose summary differs from the request is an ERROR (readback mismatch)", async () => {
    const { fake, client, options } = setup();
    fake.addFault({ op: "create", mode: "rewrite", summary: "Something else" });
    const result = await createIdea(client, { requestId: REQUEST, summary: "What I typed" }, options);
    expect(result).toMatchObject({ ok: false, failure: { state: "ERROR", code: "readback-mismatch" } });
    expect(!result.ok && result.failure.detail).toContain("summary differs");
  });

  it("a readback without this request's marker is an ERROR (readback mismatch)", async () => {
    const { fake, client, options } = setup();
    fake.addFault({ op: "create", mode: "drop-properties" });
    const result = await createIdea(client, { requestId: REQUEST, summary: "Marker lost" }, options);
    expect(result).toMatchObject({ ok: false, failure: { state: "ERROR", code: "readback-mismatch" } });
    expect(!result.ok && result.failure.detail).toContain("request marker missing");
  });

  it("different request ids create different issues", async () => {
    const { fake, client, options } = setup();
    await createIdea(client, { requestId: REQUEST, summary: "First" }, options);
    await createIdea(client, { requestId: OTHER, summary: "Second" }, options);
    expect(fake.creates).toBe(2);
  });

  it("a drifted board blocks creation", async () => {
    const { fake, client, options } = setup();
    fake.setBoard({ filterId: "99999" });
    expect(await createIdea(client, { requestId: REQUEST, summary: "Nowhere" }, options)).toMatchObject({ ok: false, failure: { state: "BLOCKED", code: "board-drift" } });
    expect(fake.creates).toBe(0);
  });
});

describe("validateIdeaRequest", () => {
  it("requires a UUID v4 request id and a 1–255 character summary, normalising whitespace", () => {
    expect(validateIdeaRequest({ requestId: REQUEST, summary: "  Two   spaces \n here " })).toEqual({ requestId: REQUEST, summary: "Two spaces here" });
    expect(validateIdeaRequest({ requestId: "nope", summary: "x" })).toBeNull();
    expect(validateIdeaRequest({ requestId: REQUEST, summary: "   " })).toBeNull();
    expect(validateIdeaRequest({ requestId: REQUEST, summary: "x".repeat(256) })).toBeNull();
    expect(validateIdeaRequest({ requestId: REQUEST })).toBeNull();
    expect(validateIdeaRequest("string")).toBeNull();
  });
});
