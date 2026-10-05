# ANA-5 — Jira-backed Board and Backlog: acceptance evidence map

Purpose: show, per acceptance criterion of Jira ANA-5 and its work packages ANA-23..ANA-29, how to try it by hand,
which automated test proves it, and which screenshot shows it. Exact pass counts, the commit they were measured on,
CI run links and the live-Jira proof are recorded in the pull request and in Jira ANA-5 comments, not here, so this
file cannot drift from a later head (DRS §7: evidence on another SHA is not evidence).

Test layers:

- **Unit** (`npm test`, Vitest): the server adapter against the shared fake Jira (`e2e/fake-jira/core.mjs`), the
  pure work model, request guards, and the Board/Backlog components in jsdom.
- **Browser** (`npm run e2e`, Playwright): the production build with its real route handlers, talking to the fake
  Jira over HTTP (`e2e/fake-jira/server.mjs`). Each write is checked against the fake's own state (independent
  readback), not only against the page.
- **Live Jira** (manual, recorded in Jira): the same build against Jira Board 734 with server-side credentials.

All fake-Jira content is synthetic (repo is public).

## Acceptance criteria (Jira ANA-5)

| AC | Try this | Automated proof | Screenshot |
|---|---|---|---|
| 1 Board shows key, summary, status, assignee for Board 734 / filter 10733 | Open **Board** | `src/server/jira/work.test.ts` "maps every issue…"; `src/features/board/board.test.tsx` "renders the five Jira states…"; `e2e/work.spec.ts` "AC1/AC2" | `*-board.png` |
| 2 Five states Backlog → Zur Entwicklung ausgewählt → In Arbeit → Review → Erledigt | Board columns | `work.test.ts` "renders exactly the five mapped workflow states…"; `e2e/work.spec.ts` "AC1/AC2"; unmapped case "Review not mapped…" | `*-board.png`, `*-board-review-unmapped.png` |
| 3 Dedicated Backlog = Board Backlog column | **Backlog · n** on the Board | `work.test.ts` "Board Backlog column and the dedicated Backlog view…"; `board.test.tsx` "lists exactly the Board's Backlog column items"; `e2e/work.spec.ts` "AC3" | `*-backlog.png` |
| 4 Add idea creates one Jira item in Backlog, shows its key | Backlog → **Add idea** | `src/server/jira/ideas.test.ts` (creation, replay, restart, timeout-after-commit, double submit); `e2e/work.spec.ts` "creates exactly one Jira item…", "double submit…" | `*-backlog-idea-created.png` |
| 5 Status changes use Jira transitions | Drag an issue, or focus it and press Shift+→ | `work.test.ts` "walks one issue through every supported transition, including Review…", "uses the transition id Jira offers…"; `e2e/work.spec.ts` "AC5/AC6" | `*-board-move-pending.png`, `*-board-move-confirmed.png` |
| 6 Every write read back before success | — | `work.test.ts` readback cases; `ideas.test.ts` "creates one Task…" (readback after create); `board.test.tsx` "a keyboard move is … shown only as confirmed after Jira's answer" | `*-board-move-pending.png` |
| 7 Failures visible as ERROR / BLOCKED / UNKNOWN | Inject a fault (see below) | `work.test.ts` connector/transition failure table; `ideas.test.ts` failure cases; `e2e/work.spec.ts` "Connector failures stay visible", "AC7 ·…" | `*-board-move-blocked.png`, `*-board-connector-blocked.png`, `*-backlog-idea-unknown.png` |
| 8 Reload/reconnect rebuild from Jira; no fixture/local canonical work | Reload the Board | `e2e/work.spec.ts` "AC8 · reload rebuilds the board from Jira…"; `src/state/prototype.test.ts` "holds no tickets, backlog or ideas"; `src/lib/search.test.ts` "offers no work entries without a Jira snapshot" | — |
| 9 No Jira secret in the browser | — | `e2e/work.spec.ts` "AC9 · …"; `npm run scan:bundle` (CI step); `src/server/boundary.test.ts` (config, token never in errors, same-origin writes) | — |
| 10 Tests for mapping, duplicate prevention, transitions incl. Review, mismatch, failures | `npm test`, `npm run e2e` | the files above | — |
| 11 DRS v1.0 applied | — | `.drs/ANA-5.json` validated by `.github/workflows/drs.yml`; binding in `docs/delivery/DRS.md` | — |

## Work packages

| Package | Where it is satisfied |
|---|---|
| ANA-23 Review in Jira + Board 734 column | Jira itself (live state recorded in Jira ANA-23); the dashboard renders exactly the columns Jira maps and reports issues in unmapped statuses (`work.test.ts`, `e2e/work.spec.ts` "Review not mapped…") |
| ANA-24 Jira reads | `src/server/jira/work.ts` `readSnapshot`, `src/app/api/work/route.ts` |
| ANA-25 Add idea | `src/server/jira/ideas.ts`, `src/app/api/work/ideas/route.ts`, `src/features/board/BacklogView.tsx` |
| ANA-26 Transitions | `src/server/jira/work.ts` `moveIssue`, `src/app/api/work/issues/[key]/transition/route.ts`, `src/features/board/BoardView.tsx` |
| ANA-27 Failure honesty / no local copy | `src/features/work/model.ts` (`FAILURE_STATE`), `WorkStatus.tsx`, `WorkProvider.tsx`; prototype reducer holds no work |
| ANA-28 Verification | this file; `src/**/*.test.ts(x)`; `e2e/work.spec.ts`; `e2e/fake-jira/` |
| ANA-29 DRS | `.drs/ANA-5.json`, `docs/delivery/DRS.md`, `.github/workflows/drs.yml` |

## Inject failures by hand (fake Jira)

Start `node e2e/fake-jira/server.mjs`, run the app with `JIRA_BASE_URL=http://127.0.0.1:3199 JIRA_EMAIL=e2e@example.invalid
JIRA_API_TOKEN=e2e-fake-token`, then for example:

```bash
curl -X POST localhost:3199/__fake/fault -d '{"op":"transitions","mode":"drop-transition","toStatusId":"10216"}'   # move to Review → BLOCKED
curl -X POST localhost:3199/__fake/fault -d '{"op":"transition","mode":"ignore"}'                                  # readback mismatch → ERROR
curl -X POST localhost:3199/__fake/fault -d '{"op":"board","mode":"status","status":401}'                          # credentials → BLOCKED
curl -X POST localhost:3199/__fake/reset
```

## Known limits (deliberate for this slice)

- **No per-person creator attribution.** Without sign-in the dashboard cannot know who is adding an idea; Jira
  records the integration account as reporter, and the UI says so. Confluence 07 REQ-F-013 lists creator
  attribution as a verification point; it needs the authentication slice and is tracked as a follow-up.
- **No dashboard audit store.** Jira's issue history is the audit trail for writes made here.
- **Duplicate protection window.** Retry safety rests on Jira's search finding the request marker. If Jira gives no
  answer to a create and its search index lags by more than a minute, a retry after that minute could still create a
  second item; the UI shows UNKNOWN until Jira confirms either way.
