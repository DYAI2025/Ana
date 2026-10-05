// @vitest-environment node
import { describe, expect, it } from "vitest";
import { fakeJiraClient } from "@/test/fake-jira-fetch";
import { createIdea, SAME_TEXT_WINDOW_MS, UNCONFIRMED_HOLD_MS, validateIdeaRequest, type IdeaLedger } from "./ideas";

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

  it("after an unanswered create, checking again never re-sends it; after the hold only an explicit request creates, once", async () => {
    const { fake, client, options, advance } = setup();
    fake.addFault({ op: "create", mode: "status", status: 503, times: 1 });
    const first = await createIdea(client, { requestId: REQUEST, summary: "Second chance" }, options);
    expect(first).toMatchObject({ ok: false, failure: { state: "UNKNOWN", code: "write-unconfirmed", recreatable: false } });
    expect(fake.creates).toBe(0);
    // an early explicit request is still held back
    expect(await createIdea(client, { requestId: REQUEST, summary: "Second chance", confirmRecreate: true }, options)).toMatchObject({ ok: false, failure: { recreatable: false } });
    advance(UNCONFIRMED_HOLD_MS + 1);
    const checked = await createIdea(client, { requestId: REQUEST, summary: "Second chance" }, options);
    expect(checked).toMatchObject({ ok: false, failure: { state: "UNKNOWN", code: "write-unconfirmed", recreatable: true } });
    expect(fake.creates).toBe(0); // "Check Jira again" only checks
    const explicit = await createIdea(client, { requestId: REQUEST, summary: "Second chance", confirmRecreate: true }, options);
    expect(explicit).toMatchObject({ ok: true });
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

  it("a kept key that no longer exists in Jira settles the request (ERROR) and is never re-created", async () => {
    const { fake, client, options, advance } = setup();
    fake.setSearchLag(10 * 60_000);
    fake.addFault({ op: "issue", mode: "network", times: 1 }); // readback after the create fails: key kept
    await createIdea(client, { requestId: REQUEST, summary: "Vanishes" }, options);
    fake.addFault({ op: "issue", mode: "status", status: 404 }); // someone deleted it in Jira meanwhile
    advance(UNCONFIRMED_HOLD_MS + 1);
    const retry = await createIdea(client, { requestId: REQUEST, summary: "Vanishes" }, options);
    expect(retry).toMatchObject({ ok: false, failure: { state: "ERROR", code: "readback-mismatch" } });
    expect(!retry.ok && retry.failure.detail).toContain("no longer exists");
    expect(await createIdea(client, { requestId: REQUEST, summary: "Vanishes" }, options)).toMatchObject({ ok: false, failure: { code: "readback-mismatch" } });
    expect(fake.creates).toBe(1);
  });

  it("the hold restarts after every unanswered create, so a quick third attempt cannot create again", async () => {
    const { fake, client, options, advance } = setup();
    fake.setSearchLag(10 * 60_000);
    fake.addFault({ op: "create", mode: "commit-then-delay", ms: 1_000, times: 2 });
    await createIdea(client, { requestId: REQUEST, summary: "Degraded Jira" }, options);
    advance(UNCONFIRMED_HOLD_MS + 1);
    // the person explicitly sends it again after the hold: a second create goes out, unanswered too
    await createIdea(client, { requestId: REQUEST, summary: "Degraded Jira", confirmRecreate: true }, options);
    expect(fake.creates).toBe(2);
    advance(5_000);
    const third = await createIdea(client, { requestId: REQUEST, summary: "Degraded Jira", confirmRecreate: true }, options);
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

  it("the same idea text under a new request id finds the item already in Jira, even with an empty ledger (reload, restart)", async () => {
    const { fake, client, options } = setup();
    const first = await createIdea(client, { requestId: REQUEST, summary: "Only once please" }, options);
    expect(first.ok).toBe(true);
    const again = await createIdea(client, { requestId: OTHER, summary: "Only once please" }, { ...options, ledger: new Map() });
    expect(again).toMatchObject({ ok: true, replayed: true, matchedBy: "same-text", issue: { key: "ANA-920" } });
    expect(fake.creates).toBe(1);
  });

  it("an unexpected error after the request started is held as UNKNOWN, never thrown and never forgotten", async () => {
    const { fake, client, options } = setup();
    const broken = { ...client, post: async (path: string, body: unknown) => (path === "/rest/api/3/issue" ? Promise.reject(new Error("boom")) : client.post(path, body)) } as typeof client;
    const result = await createIdea(broken, { requestId: REQUEST, summary: "Exploding" }, options);
    expect(result).toMatchObject({ ok: false, failure: { state: "UNKNOWN", code: "write-unconfirmed" } });
    expect(options.ledger.get(REQUEST)).toMatchObject({ status: "unconfirmed" });
    expect(fake.creates).toBe(0);
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

/**
 * The duplicate guarantees of Add idea, one row per scenario. The same table, with the mechanism behind each row and
 * the rows where a second item remains possible, is in docs/evidence/ANA-5/CHECKLIST.md ("Add idea — duplicate
 * guarantees"). Clocks are linked: the fake Jira and the server see the same time.
 */
describe("Add idea — duplicate guarantee matrix", () => {
  function linked(timeoutMs = 200) {
    const { fake, client } = fakeJiraClient({ timeoutMs });
    const ledger: IdeaLedger = new Map();
    let offset = 0;
    const options = { ledger, now: () => Date.now() + offset, sleep: noSleep };
    const advance = (ms: number) => {
      offset += ms;
      fake.advanceClock(ms);
    };
    return { fake, client, ledger, options, advance };
  }
  const LAG = 10 * 60_000; // Jira's search index far behind its writes

  it("G1 same text again, earlier request confirmed on this server, Jira's search not caught up → that item, no second create", async () => {
    const { fake, client, options } = linked();
    fake.setSearchLag(LAG);
    expect((await createIdea(client, { requestId: REQUEST, summary: "Weekly review" }, options)).ok).toBe(true);
    const again = await createIdea(client, { requestId: OTHER, summary: "Weekly review" }, options);
    expect(again).toMatchObject({ ok: true, replayed: true, matchedBy: "same-text", issue: { key: "ANA-920" } });
    expect(fake.creates).toBe(1);
  });

  it("G2 unanswered create, then the server restarts; the open tab checks again → nothing is sent, the request is held", async () => {
    const { fake, client, options, advance } = linked();
    fake.setSearchLag(LAG);
    fake.addFault({ op: "create", mode: "commit-then-delay", ms: 1_000 }); // Jira commits, the answer is lost
    const first = await createIdea(client, { requestId: REQUEST, summary: "Lost answer" }, options);
    expect(first).toMatchObject({ ok: false, failure: { code: "write-unconfirmed" } });
    expect(fake.creates).toBe(1);
    const restarted = { ...options, ledger: new Map() as IdeaLedger };
    const check = await createIdea(client, { requestId: REQUEST, summary: "Lost answer", knownUnconfirmed: true }, restarted);
    expect(check).toMatchObject({ ok: false, failure: { code: "write-unconfirmed", recreatable: false } });
    advance(UNCONFIRMED_HOLD_MS + 1);
    const later = await createIdea(client, { requestId: REQUEST, summary: "Lost answer", knownUnconfirmed: true }, restarted);
    expect(later).toMatchObject({ ok: false, failure: { code: "write-unconfirmed", recreatable: true } });
    expect(fake.creates).toBe(1);
  });

  it("G3 the server forgot an unanswered request after an hour; the open tab checks again → nothing is sent", async () => {
    const { fake, client, options, advance } = linked();
    fake.setSearchLag(3 * 60 * 60_000);
    fake.addFault({ op: "create", mode: "commit-then-delay", ms: 1_000 });
    await createIdea(client, { requestId: REQUEST, summary: "Long wait" }, options);
    advance(61 * 60_000); // past the ledger's one-hour memory
    const check = await createIdea(client, { requestId: REQUEST, summary: "Long wait", knownUnconfirmed: true }, options);
    expect(check).toMatchObject({ ok: false, failure: { code: "write-unconfirmed", recreatable: false } });
    expect(fake.creates).toBe(1);
  });

  it("G4 a request id the browser knows as unanswered is found by its marker once Jira's search shows it", async () => {
    const { fake, client, options } = linked();
    fake.addFault({ op: "create", mode: "commit-then-delay", ms: 1_000 });
    await createIdea(client, { requestId: REQUEST, summary: "Found later" }, options);
    const check = await createIdea(client, { requestId: REQUEST, summary: "Found later", knownUnconfirmed: true }, { ...options, ledger: new Map() });
    expect(check).toMatchObject({ ok: true, replayed: true, matchedBy: "request" });
    expect(fake.creates).toBe(1);
  });

  it("G5 the same text added more than an hour ago is a new idea: it is created", async () => {
    const { fake, client, options, advance } = linked();
    await createIdea(client, { requestId: REQUEST, summary: "Recurring topic" }, options);
    advance(SAME_TEXT_WINDOW_MS + 60_000);
    const later = await createIdea(client, { requestId: OTHER, summary: "Recurring topic" }, options);
    expect(later).toMatchObject({ ok: true });
    expect(later.ok && later.replayed).toBeFalsy();
    expect(fake.creates).toBe(2);
  });

  it("G6 residual (documented): confirmed item, server restart, same text before Jira's search shows the item → a second item", async () => {
    const { fake, client, options } = linked();
    fake.setSearchLag(LAG);
    await createIdea(client, { requestId: REQUEST, summary: "Restart in the window" }, options);
    await createIdea(client, { requestId: OTHER, summary: "Restart in the window" }, { ...options, ledger: new Map() });
    expect(fake.creates).toBe(2);
  });

  it("G7 residual (by design): an edited text is a different idea and is created", async () => {
    const { fake, client, options } = linked();
    fake.setSearchLag(LAG);
    await createIdea(client, { requestId: REQUEST, summary: "Plan the review" }, options);
    await createIdea(client, { requestId: OTHER, summary: "Plan the weekly review" }, options);
    expect(fake.creates).toBe(2);
  });

  it("a same-text item that no longer exists in Jira is not the same idea: the new one is created once", async () => {
    const { fake, client, options } = linked();
    await createIdea(client, { requestId: REQUEST, summary: "Vanishing twin" }, options);
    fake.addFault({ op: "issue", mode: "status", status: 404, key: "ANA-920", times: 1 });
    const result = await createIdea(client, { requestId: OTHER, summary: "Vanishing twin" }, { ...options, ledger: new Map() });
    expect(result).toMatchObject({ ok: true, issue: { key: "ANA-921" } });
    expect(fake.creates).toBe(2);
  });

  it("a same-text item that cannot be read (Jira 5xx) is that failure: nothing is sent and nothing is held", async () => {
    const { fake, client, options } = linked();
    await createIdea(client, { requestId: REQUEST, summary: "Unreadable twin" }, options);
    fake.addFault({ op: "issue", mode: "status", status: 503, key: "ANA-920", times: 1 });
    const restarted = new Map() as IdeaLedger;
    const result = await createIdea(client, { requestId: OTHER, summary: "Unreadable twin" }, { ...options, ledger: restarted });
    expect(result).toMatchObject({ ok: false, failure: { state: "ERROR", code: "upstream" } });
    expect(restarted.has(OTHER)).toBe(false);
    expect(fake.creates).toBe(1);
  });

  it("an empty answer from Jira's search is a failure, never 'nothing found': no create is sent", async () => {
    const { fake, client, options } = linked();
    fake.addFault({ op: "search", mode: "empty", times: 1 });
    const result = await createIdea(client, { requestId: REQUEST, summary: "Empty search" }, options);
    expect(result).toMatchObject({ ok: false, failure: { code: "upstream" } });
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
