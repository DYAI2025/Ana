# ANA-5 — Fail-first evidence for the added gates

A gate is only trusted after it has been seen failing on code that has the defect. Each row below is a measured run:
one deliberate defect is put into an isolated copy of `apps/dashboard` (the working tree is never mutated), the
suite runs, and the copy is restored. The unmutated suite was green before and after each run.

## Unit suite (`npx vitest run`) — mutation canaries

| Canary | Defect injected | Result | Caught by |
|---|---|---|---|
| M1 | `moveIssue` reports success whatever the readback says | 3 failed | `src/server/jira/work.test.ts` (readback mismatch, rejected write, unconfirmed write) |
| M2 | Add idea never finds the request marker in Jira | 3 failed | `src/server/jira/ideas.test.ts` (replay after restart, timeout after commit, lagging index) |
| M3 | Board columns without statuses are kept | 11 failed | `work.test.ts`, `ideas.test.ts` (five-state projection, Backlog detection) |
| M4 | Jira credentials allowed over plain http to a remote host | 1 failed | `src/server/boundary.test.ts` |
| M5 | an unsupported transition is labelled ERROR instead of BLOCKED | 2 failed | `work.test.ts` |
| M6 | write endpoints accept cross-origin requests | 1 failed | `boundary.test.ts` |
| M7 | a failed move ignores the Jira truth carried by the failure | 1 failed (after a test was added for it; it first survived) | `src/features/board/board.test.tsx` "a failed move shows Jira's truth … at once" |
| M8 | after an unanswered create, a retry creates again without the hold | 1 failed | `ideas.test.ts` (lagging index) |
| M9 | a move from a stale source status is written anyway | 1 failed | `work.test.ts` (stale source) |

M7 survived its first run: the board's follow-up re-read hid the defect. The test that now catches it holds that
re-read open, so only the failure's own Jira truth can move the card.

## Browser suite (`npx playwright test`)

| Gate | Defect | Result |
|---|---|---|
| `e2e/work.spec.ts` "a slow Jira confirmation never takes keyboard focus away…" | the pre-fix `moveTo` that refocused the moved card unconditionally after Jira answered | failed at `toBeFocused` on the card the person had moved on to (the real defect found in the first full run, where a later Shift+→ moved the wrong issue) |

## Review round 1 fixes — new tests run against the pre-fix code

After the first independent review, each new test was run against the production files of the previous commit
(isolated copy). All of them failed there and pass on the fix:

| Test | Pre-fix defect it catches |
|---|---|
| `ideas.test.ts` "a key Jira returned is kept when the readback fails…" | the key from a 201 was dropped; the retry depended on Jira's lagging search |
| `ideas.test.ts` "the hold restarts after every unanswered create…" | the duplicate hold kept its first timestamp, so a quick third attempt created again |
| `ideas.test.ts` "the same idea under a new request id … joins the unresolved earlier request" | reload/second tab could create the same idea twice |
| `board.test.tsx` "a read that started before a confirmed move cannot put the card back…" | a slow refresh overwrote a confirmed move; later reads did not ask Jira to reconcile it |
| `board.test.tsx` "an unconfirmed idea stays locked after Cancel…" and "…continues with that request" | Cancel or editing after UNKNOWN minted a new request id |
| `work.test.ts` "uses the transition id Jira offers…" (with issue-specific ids in the fake) | the old fake used the same ids for every issue, so an assumed id could not fail |
| `e2e/work.spec.ts` "AC8 · reconnect…" | the Now view showed "3 active · 1 in review" while Jira was unreachable |

## Bundle secret scan (`npm run scan:bundle`)

Recorded with the build it ran on in the pull request: a planted file under `.next/static` that contains the token
variable name makes the scan exit 1; without it the scan exits 0.
