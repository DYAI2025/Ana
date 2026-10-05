export declare const FAKE_AUTH: { email: string; token: string };
export declare const FAKE_AUTH_HEADER: string;
export declare const PEOPLE: Record<"avery" | "blake" | "casey", { accountId: string; displayName: string }>;

export type FakeOp = "board" | "statuses" | "search" | "create" | "issue" | "transitions" | "transition";

export type FakeFault =
  | { op: FakeOp; mode: "status"; status: number; message?: string; times?: number; key?: string; delayMs?: number }
  | { op: FakeOp; mode: "delay" | "commit-then-delay"; ms: number; times?: number; key?: string }
  | { op: FakeOp; mode: "network"; times?: number; key?: string }
  | { op: FakeOp; mode: "empty"; times?: number; key?: string }
  | { op: "transition"; mode: "ignore"; times?: number; key?: string }
  | { op: "transitions"; mode: "drop-transition"; toStatusId: string; times?: number; key?: string }
  | { op: "create"; mode: "misplace"; statusId: string; times?: number }
  | { op: "create"; mode: "rewrite"; summary: string; times?: number }
  | { op: "create"; mode: "drop-properties"; times?: number };

export interface FakeResult {
  status: number;
  body: unknown;
  delayMs?: number;
  hang?: boolean;
  network?: boolean;
}

export interface FakeIssue {
  id: string;
  key: string;
  fields: { summary: string; status: { id: string; name: string }; labels: string[]; assignee: { accountId: string; displayName: string } | null };
  properties: Record<string, unknown>;
}

export interface FakeJira {
  handle(method: string, path: string, headers?: Record<string, string>, body?: unknown): FakeResult;
  reset(): void;
  addFault(fault: FakeFault): void;
  setBoard(patch: { filterId?: string; projectKey?: string; withReview?: boolean }): void;
  setSearchLag(ms: number): void;
  advanceClock(ms: number): void;
  setStatus(key: string, statusId: string): boolean;
  issue(key: string): FakeIssue | undefined;
  readonly creates: number;
  readonly calls: string[];
  summary(): { creates: number; issues: { key: string; summary: string; status: string; labels: string[] }[] };
}

export declare function createFakeJira(): FakeJira;
