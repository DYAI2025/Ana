/**
 * Synthetic Jira work snapshot for unit tests only. Every name and summary is invented (repo is public;
 * governance/DATA_GOVERNANCE.md). It mirrors the shape of Board 734: five columns with one status each.
 */
import type { WorkColumn, WorkIssue, WorkSnapshot, WorkStatus } from "@/features/work/types";

export const STATUS = {
  backlog: { id: "10040", name: "Backlog", category: "new" },
  selected: { id: "10182", name: "Zur Entwicklung ausgewählt", category: "indeterminate" },
  doing: { id: "10113", name: "In Arbeit", category: "indeterminate" },
  review: { id: "10216", name: "Review", category: "indeterminate" },
  done: { id: "10115", name: "Erledigt", category: "done" },
} as const satisfies Record<string, WorkStatus>;

const column = (status: WorkStatus): WorkColumn => ({ id: `col-${status.id}`, name: status.name, statuses: [status], isBacklog: status.category === "new" });

export const COLUMNS: WorkColumn[] = [STATUS.backlog, STATUS.selected, STATUS.doing, STATUS.review, STATUS.done].map(column);

export const AVERY = { accountId: "test-account-avery", displayName: "Avery Example" };
export const BLAKE = { accountId: "test-account-blake", displayName: "Blake Example" };

export function issue(key: string, summary: string, status: WorkStatus, assignee: WorkIssue["assignee"] = null, extra: Partial<WorkIssue> = {}): WorkIssue {
  return { id: key.replace(/\D/g, ""), key, summary, status, assignee, issueType: "Task", isIdea: false, url: `https://jira.example.invalid/browse/${key}`, ...extra };
}

export function makeSnapshot(overrides: Partial<WorkSnapshot> = {}): WorkSnapshot {
  return {
    source: { boardId: 734, boardName: "ANA board", filterId: "10733", projectKey: "ANA", site: "jira.example.invalid" },
    fetchedAt: "2026-10-05T08:00:00.000Z",
    columns: COLUMNS,
    issues: [
      issue("ANA-901", "Draft the onboarding checklist", STATUS.backlog),
      issue("ANA-902", "Collect workshop feedback themes", STATUS.backlog, AVERY),
      issue("ANA-907", "Try a calmer Friday review", STATUS.backlog, null, { isIdea: true }),
      issue("ANA-903", "Close one feedback loop this week", STATUS.selected, BLAKE),
      issue("ANA-904", "Prepare the shared resource map", STATUS.doing, AVERY),
      issue("ANA-905", "Check the source registry draft", STATUS.review, BLAKE),
      issue("ANA-906", "Set up the project foundation", STATUS.done, BLAKE),
    ],
    unmapped: [],
    truncated: false,
    ...overrides,
  };
}
