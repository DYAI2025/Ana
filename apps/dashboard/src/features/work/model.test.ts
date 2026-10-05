import { describe, expect, it } from "vitest";
import { AVERY, issue, makeSnapshot, STATUS } from "@/test/work-fixture";
import { backlogIssues, FAILURE_STATE, filterByOwner, normalizeSummary, ownersOf, validateIdeaSummary, withIssue, workCounts } from "./model";
import { FAILURE_CODES } from "./types";

describe("failure labelling", () => {
  it("every failure code maps to ERROR, BLOCKED or UNKNOWN — none can read as success", () => {
    for (const code of FAILURE_CODES) expect(["ERROR", "BLOCKED", "UNKNOWN"]).toContain(FAILURE_STATE[code]);
    expect(Object.keys(FAILURE_STATE).sort()).toEqual([...FAILURE_CODES].sort());
  });
});

describe("work counts and filters", () => {
  it("counts Backlog, active, Review and done from the Jira columns", () => {
    expect(workCounts(makeSnapshot())).toEqual({ backlog: 3, active: 2, review: 1, done: 1 });
  });

  it("filters by assignee, by unassigned and lists owners from Jira data", () => {
    const { issues } = makeSnapshot();
    expect(filterByOwner(issues, { accountId: AVERY.accountId }).map((i) => i.key)).toEqual(["ANA-902", "ANA-904"]);
    expect(filterByOwner(issues, "unassigned").map((i) => i.key)).toEqual(["ANA-901", "ANA-907"]);
    expect(filterByOwner(issues, "all")).toHaveLength(issues.length);
    expect(ownersOf(issues)).toEqual({ people: [AVERY, { accountId: "test-account-blake", displayName: "Blake Example" }], hasUnassigned: true });
  });
});

describe("withIssue — placing Jira's confirmed truth", () => {
  it("moves an issue to the column of its new Jira status and keeps its rank position", () => {
    const snap = makeSnapshot();
    const next = withIssue(snap, { ...snap.issues[3]!, status: STATUS.review });
    expect(next.issues.map((i) => i.key)).toEqual(snap.issues.map((i) => i.key));
    expect(next.issues[3]!.status).toEqual(STATUS.review);
  });

  it("a new issue is ranked last, as Jira ranks new issues; an issue in an unmapped status leaves the board", () => {
    const snap = makeSnapshot();
    const added = withIssue(snap, issue("ANA-950", "New idea", STATUS.backlog, null, { isIdea: true }));
    expect(backlogIssues(added).map((i) => i.key).at(-1)).toBe("ANA-950");
    const hidden = withIssue(snap, { ...snap.issues[0]!, status: { id: "99999", name: "Archived", category: "done" } });
    expect(hidden.issues.map((i) => i.key)).not.toContain("ANA-901");
    expect(hidden.unmapped.map((i) => i.key)).toEqual(["ANA-901"]);
  });
});

describe("idea validation", () => {
  it("rejects empty and over-long ideas and collapses whitespace", () => {
    expect(validateIdeaSummary("   ")).toBe("backlog.ideaRequired");
    expect(validateIdeaSummary("x".repeat(256))).toBe("backlog.ideaTooLong");
    expect(validateIdeaSummary("x".repeat(255))).toBeNull();
    expect(normalizeSummary(" a \n b  ")).toBe("a b");
  });
});
