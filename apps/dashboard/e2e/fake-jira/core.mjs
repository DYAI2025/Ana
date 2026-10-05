/**
 * In-memory stand-in for the parts of the Jira Cloud REST API that the dashboard's server-side adapter uses.
 * It is a TEST DOUBLE ONLY (unit tests and Playwright); it never talks to a real Jira. All issue content is
 * synthetic. Faults are injected per test to prove that failures stay visible (ANA-5 / ANA-27 / ANA-28).
 *
 * Endpoints: GET  /rest/agile/1.0/board/734/configuration
 *            GET  /rest/api/3/project/ANA/statuses
 *            POST /rest/api/3/search/jql
 *            GET  /rest/api/3/issue/{key}
 *            GET  /rest/api/3/issue/{key}/transitions
 *            POST /rest/api/3/issue/{key}/transitions
 *            POST /rest/api/3/issue
 */

export const FAKE_AUTH = { email: "e2e@example.invalid", token: "e2e-fake-token" };
export const FAKE_AUTH_HEADER = `Basic ${Buffer.from(`${FAKE_AUTH.email}:${FAKE_AUTH.token}`).toString("base64")}`;

const STATUSES = {
  10040: { id: "10040", name: "Backlog", statusCategory: { key: "new" } },
  10182: { id: "10182", name: "Zur Entwicklung ausgewählt", statusCategory: { key: "indeterminate" } },
  10113: { id: "10113", name: "In Arbeit", statusCategory: { key: "indeterminate" } },
  10216: { id: "10216", name: "Review", statusCategory: { key: "indeterminate" } },
  10115: { id: "10115", name: "Erledigt", statusCategory: { key: "done" } },
};

/**
 * Global transitions, one per status — the shape of the ANA simplified workflow. The ids Jira hands out are made
 * issue-specific here (see transitionsFor) so that an adapter that assumes ids instead of discovering them fails.
 */
const TRANSITIONS = [
  { id: "11", name: "Backlog", to: "10040" },
  { id: "21", name: "Zur Entwicklung ausgewählt", to: "10182" },
  { id: "31", name: "In Arbeit", to: "10113" },
  { id: "51", name: "Review", to: "10216" },
  { id: "41", name: "Erledigt", to: "10115" },
];

export const PEOPLE = {
  avery: { accountId: "fake-account-avery", displayName: "Avery Example" },
  blake: { accountId: "fake-account-blake", displayName: "Blake Example" },
  casey: { accountId: "fake-account-casey", displayName: "Casey Example" },
};

const SEED = [
  ["ANA-901", "Draft the onboarding checklist", "10040", null, []],
  ["ANA-902", "Collect workshop feedback themes", "10040", "avery", []],
  ["ANA-907", "Try a calmer Friday review", "10040", null, ["ana-dashboard", "ana-idea"]],
  ["ANA-903", "Close one feedback loop this week", "10182", "blake", []],
  ["ANA-904", "Prepare the shared resource map", "10113", "avery", []],
  ["ANA-908", "Collect approved source links", "10113", "casey", []],
  ["ANA-905", "Check the source registry draft", "10216", "blake", []],
  ["ANA-906", "Set up the project foundation", "10115", "blake", []],
];

const json = (status, body) => ({ status, body });

/** Transition ids differ per issue in this fake; real Jira ids depend on the workflow, never on a guess. */
const transitionsFor = (issue) => TRANSITIONS.map((t) => ({ ...t, id: String(Number(t.id) + ((Number(issue.id) % 5) + 1) * 100) }));
const errorBody = (message) => ({ errorMessages: [message], errors: {} });

export function createFakeJira() {
  let state;

  function reset() {
    state = {
      issues: SEED.map(([key, summary, statusId, person, labels], index) => ({
        id: String(15900 + index),
        key,
        fields: {
          summary,
          status: { ...STATUSES[statusId] },
          assignee: person ? { ...PEOPLE[person] } : null,
          issuetype: { name: "Task" },
          labels: [...labels],
          project: { key: "ANA" },
        },
        properties: {},
        createdAt: 0,
      })),
      nextNumber: 920,
      faults: [],
      board: { filterId: "10733", projectKey: "ANA", withReview: true },
      searchLagMs: 0,
      calls: [],
      creates: 0,
      clock: 0,
    };
  }
  reset();

  const now = () => Date.now() + state.clock;

  function boardConfig() {
    const column = (name, ...ids) => ({ name, statuses: ids.map((id) => ({ id, self: `/rest/api/2/status/${id}` })) });
    const columns = [column("Backlog"), column("Backlog", "10040"), column("Zur Entwicklung ausgewählt", "10182"), column("In Arbeit", "10113")];
    if (state.board.withReview) columns.push(column("Review", "10216"));
    columns.push(column("Erledigt", "10115"));
    return {
      id: 734,
      name: "ANA board",
      type: "kanban",
      location: { type: "project", key: state.board.projectKey, id: "10765", name: "Ana" },
      filter: { id: state.board.filterId },
      subQuery: { query: "fixVersion in unreleasedVersions() OR fixVersion is EMPTY" },
      columnConfig: { columns, constraintType: "issueCount" },
      ranking: { rankCustomFieldId: 10019 },
    };
  }

  /** The first matching fault for an operation; `times` counts down and removes the fault at zero. */
  function takeFault(op, key) {
    const index = state.faults.findIndex((f) => f.op === op && (!f.key || f.key === key));
    if (index === -1) return null;
    const fault = state.faults[index];
    if (fault.times !== undefined) {
      fault.times -= 1;
      if (fault.times <= 0) state.faults.splice(index, 1);
    }
    return fault;
  }

  const view = (issue, propertyKeys = []) => ({
    id: issue.id,
    key: issue.key,
    // Jira returns the creation time as a field; the fake keeps it outside `fields` and adds it here
    fields: { ...structuredClone(issue.fields), created: new Date(issue.createdAt).toISOString() },
    properties: Object.fromEntries(propertyKeys.filter((k) => k in issue.properties).map((k) => [k, structuredClone(issue.properties[k])])),
  });

  function search(body) {
    const jql = String(body.jql ?? "");
    const reconcile = new Set((body.reconcileIssues ?? []).map(String));
    const visible = state.issues.filter((issue) => reconcile.has(issue.id) || now() - issue.createdAt >= state.searchLagMs);
    let matches;
    if (/^filter = 10733\b/.test(jql)) matches = visible;
    else if (/labels = "ana-dashboard"/.test(jql)) {
      const sinceDay = /created >= -1d/.test(jql);
      matches = visible
        .filter((issue) => issue.fields.labels.includes("ana-dashboard") && (!sinceDay || now() - issue.createdAt <= 24 * 60 * 60_000))
        .sort((a, b) => b.createdAt - a.createdAt);
    }
    else return json(400, errorBody(`Fake Jira does not understand JQL: ${jql}`));
    const start = Number(body.nextPageToken ?? 0);
    const size = Math.min(Number(body.maxResults ?? 50), 100);
    const page = matches.slice(start, start + size);
    const isLast = start + size >= matches.length;
    return json(200, { issues: page.map((issue) => view(issue, body.properties ?? [])), isLast, nextPageToken: isLast ? null : String(start + size) });
  }

  function createIssue(body, fault) {
    const fields = body.fields ?? {};
    if (fields.project?.key !== "ANA") return json(400, errorBody("project: valid project is required"));
    if (fields.issuetype?.name !== "Task") return json(400, errorBody("issuetype: Specify a valid issue type"));
    if (typeof fields.summary !== "string" || fields.summary.trim() === "" || fields.summary.length > 255) return json(400, errorBody("summary: You must specify a summary"));
    const number = state.nextNumber++;
    const statusId = fault?.mode === "misplace" ? fault.statusId : "10040";
    const storedSummary = fault?.mode === "rewrite" ? fault.summary : fields.summary;
    const storedProperties = fault?.mode === "drop-properties" ? [] : (body.properties ?? []);
    const issue = {
      id: String(16000 + number),
      key: `ANA-${number}`,
      fields: { summary: storedSummary, status: { ...STATUSES[statusId] }, assignee: null, issuetype: { name: "Task" }, labels: [...(fields.labels ?? [])], project: { key: "ANA" } },
      properties: Object.fromEntries(storedProperties.map((p) => [p.key, structuredClone(p.value)])),
      createdAt: now(),
    };
    // like Jira, a new issue is ranked last
    state.issues.push(issue);
    state.creates += 1;
    return json(201, { id: issue.id, key: issue.key, self: `/rest/api/3/issue/${issue.id}` });
  }

  /**
   * Handles one request. Returns `{ status, body, delayMs }`; `delayMs` lets the caller simulate a slow or
   * hanging Jira (a write may already be committed when the answer is late).
   */
  function handle(method, rawPath, headers = {}, body = undefined) {
    const url = new URL(rawPath, "http://fake.invalid");
    const path = url.pathname;
    state.calls.push(`${method} ${path}`);
    const authorization = headers.authorization ?? headers.Authorization;
    if (authorization !== FAKE_AUTH_HEADER) return json(401, errorBody("Client must be authenticated to access this resource."));

    let op;
    let key;
    let match;
    if (method === "GET" && path === "/rest/agile/1.0/board/734/configuration") op = "board";
    else if (method === "GET" && /^\/rest\/agile\/1\.0\/board\/\d+\/configuration$/.test(path)) return json(404, errorBody("Board does not exist"));
    else if (method === "GET" && path === "/rest/api/3/project/ANA/statuses") op = "statuses";
    else if (method === "POST" && path === "/rest/api/3/search/jql") op = "search";
    else if (method === "POST" && path === "/rest/api/3/issue") op = "create";
    else if ((match = path.match(/^\/rest\/api\/3\/issue\/([^/]+)\/transitions$/))) {
      key = decodeURIComponent(match[1]);
      op = method === "GET" ? "transitions" : "transition";
    } else if (method === "GET" && (match = path.match(/^\/rest\/api\/3\/issue\/([^/]+)$/))) {
      key = decodeURIComponent(match[1]);
      op = "issue";
    } else return json(404, errorBody(`Fake Jira has no route ${method} ${path}`));

    const fault = takeFault(op, key);
    if (fault?.mode === "status") return { ...json(fault.status, errorBody(fault.message ?? `Injected ${fault.status}`)), delayMs: fault.delayMs ?? 0 };
    if (fault?.mode === "network") return { status: 0, body: null, network: true };
    if (fault?.mode === "empty") return { status: 200, body: null }; // a 2xx answer without a body
    const delayMs = fault?.mode === "delay" || fault?.mode === "commit-then-delay" ? fault.ms : 0;
    if (fault?.mode === "delay") return { status: 0, body: null, delayMs, hang: true };

    let result;
    switch (op) {
      case "board":
        result = json(200, boardConfig());
        break;
      case "statuses":
        result = json(200, ["Task", "Story", "Epic", "Bug", "Sub-task"].map((name) => ({ name, statuses: Object.values(STATUSES) })));
        break;
      case "search":
        result = search(body ?? {});
        break;
      case "create":
        result = createIssue(body ?? {}, fault);
        break;
      case "issue": {
        const issue = state.issues.find((i) => i.key === key);
        const properties = (url.searchParams.get("properties") ?? "").split(",").filter(Boolean);
        result = issue ? json(200, view(issue, properties)) : json(404, errorBody("Issue does not exist or you do not have permission to see it."));
        break;
      }
      case "transitions": {
        const issue = state.issues.find((i) => i.key === key);
        if (!issue) return json(404, errorBody("Issue does not exist"));
        const offered = transitionsFor(issue).filter((t) => !(fault?.mode === "drop-transition" && fault.toStatusId === t.to));
        result = json(200, {
          transitions: offered.map((t) => ({ id: t.id, name: t.name, to: STATUSES[t.to], isAvailable: true, isGlobal: true, hasScreen: false })),
        });
        break;
      }
      case "transition": {
        const issue = state.issues.find((i) => i.key === key);
        if (!issue) return json(404, errorBody("Issue does not exist"));
        const transition = transitionsFor(issue).find((t) => t.id === String(body?.transition?.id));
        if (!transition) return json(400, errorBody("Transition id is not valid for this issue."));
        if (fault?.mode !== "ignore") issue.fields.status = { ...STATUSES[transition.to] };
        result = { status: 204, body: null };
        break;
      }
    }
    return { ...result, delayMs };
  }

  return {
    handle,
    reset,
    /** fault: { op, mode: "status"|"delay"|"commit-then-delay"|"network"|"empty"|"ignore"|"drop-transition"|"misplace", ... } */
    addFault: (fault) => state.faults.push({ ...fault }),
    setBoard: (patch) => Object.assign(state.board, patch),
    setSearchLag: (ms) => (state.searchLagMs = ms),
    advanceClock: (ms) => (state.clock += ms),
    /** Simulates a change made directly in Jira by someone else. */
    setStatus: (key, statusId) => {
      const issue = state.issues.find((i) => i.key === key);
      if (issue && STATUSES[statusId]) issue.fields.status = { ...STATUSES[statusId] };
      return Boolean(issue && STATUSES[statusId]);
    },
    issue: (key) => structuredClone(state.issues.find((i) => i.key === key)),
    get creates() {
      return state.creates;
    },
    get calls() {
      return [...state.calls];
    },
    summary: () => ({ creates: state.creates, issues: state.issues.map((i) => ({ key: i.key, summary: i.fields.summary, status: i.fields.status.name, labels: i.fields.labels })) }),
  };
}
