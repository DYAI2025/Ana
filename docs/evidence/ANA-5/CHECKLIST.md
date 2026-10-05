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

All fake-Jira content is synthetic (repo is public). Screenshots are in `screenshots/`, named
`<width>x<height>-<state>.jpg` for 1440x900, 1280x800 and 1024x768 (fake Jira; live-Jira screenshots stay out of the
repository because they show real Jira data).

## Acceptance criteria (Jira ANA-5)

| AC | Try this | Automated proof | Screenshot |
|---|---|---|---|
| 1 Board shows key, summary, status, assignee for Board 734 / filter 10733 | Open **Board** | `src/server/jira/work.test.ts` "maps every issue…"; `src/features/board/board.test.tsx` "renders the five Jira states…"; `e2e/work.spec.ts` "AC1/AC2" | `*-board.jpg` |
| 2 Five states Backlog → Zur Entwicklung ausgewählt → In Arbeit → Review → Erledigt | Board columns | `work.test.ts` "renders exactly the five mapped workflow states…"; `e2e/work.spec.ts` "AC1/AC2"; unmapped case "Review not mapped…" | `*-board.jpg`, `*-board-review-unmapped.jpg` |
| 3 Dedicated Backlog = Board Backlog column | **Backlog · n** on the Board | `work.test.ts` "Board Backlog column and the dedicated Backlog view…"; `board.test.tsx` "lists exactly the Board's Backlog column items"; `e2e/work.spec.ts` "AC3" | `*-backlog.jpg` |
| 4 Add idea creates one Jira item in Backlog, shows its key | Backlog → **Add idea** | `src/server/jira/ideas.test.ts` (creation, replay, restart, timeout-after-commit, kept key after failed readback, hold restart, no implicit re-create, same text found in Jira with an empty ledger, double submit); `board.test.tsx` locked UNKNOWN idea, explicit "Create it again", "already in Jira"; `e2e/work.spec.ts` "creates exactly one Jira item…", "double submit…", "an UNKNOWN idea survives leaving the page…", "reload and type the same idea again…" | `*-backlog-idea-created.jpg`, `*-backlog-idea-unknown.jpg` |
| 5 Status changes use Jira transitions | Drag an issue, or focus it and press Shift+→ | `work.test.ts` "walks one issue through every supported transition, including Review…", "uses the transition id Jira offers…"; `e2e/work.spec.ts` "AC5/AC6" | `*-board-move-pending.jpg`, `*-board-move-confirmed.jpg` |
| 6 Every write read back before success | — | `work.test.ts` readback cases; `ideas.test.ts` "creates one Task…" (readback after create), summary and marker mismatch; `board.test.tsx` "a keyboard move is … shown only as confirmed after Jira's answer", "a read that started before a confirmed move cannot put the card back…" | `*-board-move-pending.jpg` |
| 7 Failures visible as ERROR / BLOCKED / UNKNOWN | Inject a fault (see below) | `work.test.ts` connector/transition failure table; `ideas.test.ts` failure cases; `board.test.tsx` "a refused move is marked on the card itself…"; `e2e/work.spec.ts` "Connector failures stay visible", "AC7 ·…" (the card's state mark and the notice must be in the viewport) | `*-board-move-blocked.jpg`, `*-board-connector-blocked.jpg`, `*-backlog-idea-unknown.jpg` |
| 8 Reload/reconnect rebuild from Jira; no fixture/local canonical work | Reload the Board; or go offline and online again | `e2e/work.spec.ts` "AC8 · reload rebuilds the board from Jira…", "AC8 · reconnect…" (also: Now shows "Jira state unknown" while Jira is unreadable); `src/state/prototype.test.ts` "holds no tickets, backlog or ideas"; `src/lib/search.test.ts` "offers no work entries without a Jira snapshot" | — |
| 9 No Jira secret in the browser | — | `e2e/work.spec.ts` "AC9 · …"; `npm run scan:bundle` (CI, after the build and again after the e2e build with the fake token value); `src/server/boundary.test.ts` (config, token never in errors, loopback-only work API, same-origin writes) | — |
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
- **Duplicate protection is bounded; see the guarantee table below.** Two rows can still produce a second item: an
  explicit "Create it again" while Jira's index lags (the person's choice, the UI says so), and a server restart
  inside Jira's search lag followed by the same text from a tab that does not know the earlier request (G6). An
  edited text is a different idea by design (G7).
- **Outcomes across a full reload.** In-flight outcomes (an UNKNOWN idea, a refused move) live in the tab's memory
  and are not re-announced after a full page reload. The reloaded page shows Jira's search result, which can lag a
  few seconds behind writes made just before the reload (see "Read-after-write after a reload"), so an item created or
  moved just before can be missing or in its previous column until the next read.
- **A move refused in a render gap is silent.** If a read result arrives in the same instant as a keyboard move or a
  drop, the provider may refuse the move as "board not current" before the Board re-renders; nothing is written and
  nothing is shown. Timing-dependent; the person simply repeats the move.
- **Reads overlay writes by local order, not Jira time.** A move confirmed after a read began is laid over that read's
  result. If someone else changes the same issue in Jira inside that window, the board shows the older confirmed state
  until the next read.
- **Localhost only.** The npm scripts bind to 127.0.0.1 and the work API answers only loopback hosts; there is no
  sign-in, so the dashboard must not be exposed before the authentication slice. A server started by hand without
  `--hostname 127.0.0.1` listens on every interface, where a non-browser client can forge the Host header.
  `DASHBOARD_ALLOWED_HOSTS` (reserved for the authentication slice) accepts host names and IPv4 addresses; an IPv6
  address must be written in brackets (`[fd00::1]`), and an entry that cannot be parsed is ignored (fails closed).
- **Read-after-write after a reload.** Issues written from a tab are reconciled by Jira in that tab's reads for ten
  minutes, at most 50 per read (the newest writes first); a full page reload forgets that list, so for a few seconds
  Jira's search may still show the previous state of an issue moved, or miss an issue created, just before the
  reload.

## Add idea — duplicate guarantees

One row per scenario; each row is a test in `src/server/jira/ideas.test.ts` ("Add idea — duplicate guarantee matrix"
and the cases named). "Lag" means Jira's search does not show a new item yet; reading an issue by its key is
always current.

| Scenario | Outcome | Mechanism | Test |
|---|---|---|---|
| Same request id again (retry, double submit) | the same item | ledger, else request marker in Jira | "a repeated submission…", "double submit…" |
| Create timed out but Jira committed it | the item, found by its marker | marker search after an ambiguous create | "a create that timed out after Jira committed it…" |
| Create unanswered and not visible in Jira; "Check Jira again" | nothing is sent; after 60 s "Create it again" is offered | hold in the ledger | "after an unanswered create, checking again never re-sends it…" |
| Same as above after a server restart or after an hour | nothing is sent | the tab sends `knownUnconfirmed`; the server holds again | G2, G3 |
| A request the tab knows as unanswered, once Jira shows the item | that item | marker search | G4 |
| Same text, new request id, earlier request still unresolved | joins the earlier request | ledger join | "the same idea under a new request id … joins…" |
| Same text, new request id, earlier request created the item (same server), even with lag | that item, "Already in Jira" | ledger key, read directly | G1 |
| Same text after a reload, restart or from a second tab, item visible in Jira's search | that item, "Already in Jira" | same-text search (1 h) | "the same idea text under a new request id finds the item…" |
| Same text added more than an hour ago | a new item | window | G5 |
| Same-text item gone from Jira / unreadable | created once / that read failure, nothing sent | read by key | "a same-text item that no longer exists…", "…cannot be read…" |
| Empty answer from Jira's search | failure, nothing sent | empty body is never "nothing found" | "an empty answer from Jira's search…" |
| **Residual:** "Create it again" chosen while Jira still lags | can be a second item | the person's explicit choice, explained in the UI | "after the hold only an explicit request creates, once" |
| **Residual:** server restart inside the lag, then the same text from a tab without the earlier request | a second item | no durable dashboard store by design (Jira is the only store) | G6 |
| **By design:** edited text | a new item | a different text is a different idea | G7 |
