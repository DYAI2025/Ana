# ANA Dashboard

## What is live and what is prototype

The app in this folder is **ANA LUMEN** (Jira ANA-4 visual shell, ANA-5 Jira work loop).

- **Board and Backlog are a projection of Jira** (ANA-5): Kanban Board **734 "ANA board" / filter 10733** in project
  ANA. Issue keys, summaries, statuses and assignees are read from Jira; moving an issue runs a Jira workflow
  transition and *Add idea* creates a Jira item in Backlog. Every write is read back from Jira before the UI shows it
  as confirmed; failures are shown as **ERROR / BLOCKED / UNKNOWN**, never as success. The browser keeps no copy of
  work: a reload or reconnect reads Jira again.
- **Everything else is local prototype data**: Sessions, Brain, Whiteboard, Calendar, Pulse, Vault and Toolbox are not
  connected to Confluence, Drive, a calendar, an AI provider or a database. Whiteboard notes and calendar events live
  in memory for the browser tab and reset on reload. Only the chosen language is remembered (localStorage
  `ana.locale`).
- There is **no sign-in yet**. The dashboard is for localhost use; it must not be exposed publicly before the
  authentication slice. Jira records the integration account as the reporter of ideas added here.

### Run it

Requires Node.js ≥ 22.12 (see `/.nvmrc`). From a clean checkout, at the repository root:

```bash
npm run dev          # installs apps/dashboard deps on first run, then serves http://127.0.0.1:3000
                     # (if 3000 is busy, Next picks the next free port and prints it; or set PORT=3005)
```

The server binds to **127.0.0.1 only** when started through the npm scripts, and the work API refuses requests that
are not addressed to this machine (DNS-rebinding guard). There is no sign-in yet, so other machines must not reach
the server's Jira credential: do not start it with a bare `npx next start`/`next dev` (those listen on every
interface, and a non-browser client on the network can forge the Host header). `DASHBOARD_ALLOWED_HOSTS` exists
only for the later authentication slice.

Without Jira credentials the Board and Backlog show **BLOCKED — the Jira connection is not configured**; the rest of
the app works. To connect Jira, give the **server** process these variables (see `.env.example`; real values go
into `apps/dashboard/.env.local`, which git ignores, or into the process environment — never into the repository):

| Variable | Meaning |
|---|---|
| `JIRA_BASE_URL` | Jira site origin, e.g. `https://<site>.atlassian.net` (https only; plain http is accepted for `localhost`/`127.0.0.1` test doubles) |
| `JIRA_EMAIL` | Atlassian account of the integration (Jira records it as reporter of new ideas) |
| `JIRA_API_TOKEN` | API token of that account — server-side only, never `NEXT_PUBLIC_*` |
| `JIRA_TIMEOUT_MS` | optional, per Jira request (default 10000) |

The account needs *Browse projects*, *Create issues* and *Transition issues* in project ANA.

Other commands (repository root, or `npm run <x>` inside `apps/dashboard`):

| Command | What it does |
|---|---|
| `npm run check` | lint + typecheck + unit tests + production build |
| `npm run e2e` | Playwright journeys, accessibility (axe), contrast and viewport checks against a production build on 127.0.0.1:3100, wired to a local **fake Jira** on 127.0.0.1:3199 |
| `npm start` | production build served on http://127.0.0.1:3000 (or `PORT`) |
| `npm run scan:bundle` (in `apps/dashboard`, after a build) | fails if the browser bundle contains a Jira credential, its variable names or a Basic auth header |

Inside `apps/dashboard`: `npm test` (Vitest), `npx vitest run src/server/jira/work.test.ts` (one file),
`npx playwright test e2e/work.spec.ts` (the ANA-5 Jira journeys), `npm run e2e:install` (Chromium for Playwright).
`EVIDENCE_DIR=<dir> npx playwright test e2e/visual.spec.ts` writes the 1440/1280/1024 screenshot set to `<dir>`.
`E2E_BASE_URL=http://127.0.0.1:3000 npx playwright test` reuses an already running server instead of building one
(start `node e2e/fake-jira/server.mjs` too, and point that server's `JIRA_BASE_URL` at it).
Evidence: `docs/evidence/ANA-4/` (visual shell), `docs/evidence/ANA-5/` (Jira work loop).

### Jira work adapter (server side)

`src/server/jira/` is the only code that talks to Jira; route handlers under `src/app/api/work/` expose it to the
browser. Contract:

| Aspect | Behaviour |
|---|---|
| Reads | `GET /api/work` — Board 734 configuration (columns, filter, sub-query), project statuses, and the board's issue set via `filter = 10733 AND (<board sub-query>) ORDER BY Rank ASC`. Columns without statuses (e.g. a disabled Kanban-backlog area) are not workflow states and are dropped. `?reconcile=<issue ids>` asks Jira for read-after-write consistency. |
| Pinned source | Board 734 must use filter 10733 in project ANA; anything else is BLOCKED (`board-drift`); a board or project Jira will not show is BLOCKED (`source-missing`). Board 735 (sprints) is never used. |
| Writes | `POST /api/work/issues/:key/transition` — the transition id is discovered from Jira for that issue; `POST /api/work/ideas` — one Task in Backlog, labels `ana-dashboard` + `ana-idea`, issue property `ana.dashboard.request`. Same-origin JSON requests only. |
| Readback | Every write is followed by a strongly consistent `GET issue`; only a matching readback is success. Issues written from the browser tab are reconciled by Jira in every later board read for ten minutes, and a read that started before a confirmed write cannot undo it. |
| Idempotency | Add idea carries a client request id. Before creating, the server searches recent dashboard ideas for that id, so a retry after a timeout finds the item Jira already created. After an unanswered create the server does not create again for 60 s, counted from the end of that attempt; when Jira returned a key but the readback failed, the retry re-reads that key and never creates again; the same idea text under a new request id joins the unresolved earlier request. In the browser an unconfirmed idea keeps its text and request id until Jira answers, also across page changes. |
| Failure | `ERROR` (Jira refused or disagrees), `BLOCKED` (configuration, credential, permission, workflow, board drift), `UNKNOWN` (no answer; Jira's state is not known). The UI then shows Jira's current truth for the issue and re-reads the board. |
| Provenance | The source line names board, filter and read time; every issue links to Jira. |
| Audit | Jira's own issue history records each transition and creation (by the integration account). The dashboard keeps no audit store of its own. |
| Secrets | Read only from server environment variables; never sent to the browser or written to logs or responses. The work API answers only loopback hosts. |

### Structure

- `src/app/` — routes: `/` Now, `/board?ticket=`, `/backlog?ticket=`, `/sessions`, `/sessions/[id]?tab=`, `/brain?node=`, `/whiteboard`, `/calendar?event=`, `/pulse`, `/vault`, `/toolbox?tool=`; `src/app/api/work/` — the work API
- `src/server/` — server-only Jira adapter (`jira/`) and request guards (`http.ts`)
- `src/features/work/` — client-safe work types, pure model, the `WorkProvider` (disposable view state) and failure/provenance UI
- `src/styles/globals.css` — LUMEN tokens (canvas, pastel refraction, glass material, coral accent), atmosphere, focus and reduced-motion rules
- `src/components/` — shell (rail, top bar, search palette), providers (i18n, prototype state, toasts), UI primitives
- `src/features/<module>/` — one folder per module view; pure logic (Brain projection, calendar month grid) is unit-tested
- `src/fixtures/` — **fictional** prototype content in EN/DE/IT for the non-Jira modules; must never hold private data (public repo)
- `src/state/prototype.ts` — the in-memory reducer behind Calendar and Whiteboard (no work state)
- `src/i18n/` — EN (reference), DE, IT dictionaries; a test enforces identical keys and placeholders
- `e2e/fake-jira/` — test-only fake of the Jira endpoints the adapter uses (synthetic issues, injectable faults)

Design reference: C4 / ANA LUMEN (Confluence 07; ANA-10 decision KEEP C4). The single-file C4 prototype is **not**
in this repository (it carries business-specific wording); it was rebuilt here as components and tokens. Brain,
Whiteboard and Calendar are not in C4 and were designed in the same language. The Brain is a hand-written visual
fixture drawn on a 2D canvas with a small perspective projection — the production 3D library is still spike-gated.

> The product contract and route list below predate Confluence page 07 (“ANA Dashboard Requirements & Target
> Architecture”), whose module set (Now, Board/Backlog, Sessions, Brain, Whiteboard, Calendar, Pulse, Vault, Toolbox)
> takes precedence where they differ.

## Product contract

The dashboard is the simplest possible UI through which Ana, Ben and Vince can understand:
- what matters now;
- what is moving;
- what is blocked;
- what has changed;
- which hypotheses are being used;
- what evidence supports them;
- what should happen next.

It is not a replacement for Jira, Confluence or Drive.

## UX requirements

- useful within 10 seconds of opening;
- current focus above navigation detail;
- progressive disclosure instead of dense admin screens;
- clear labels for FACT / SELF-REPORT / HYPOTHESIS / UNKNOWN;
- visible confidence and counterevidence for derived states;
- one-click route to canonical source;
- responsive mobile experience;
- keyboard accessible;
- no hidden agent-only state;
- no vanity metrics.

## MVP routes

- /
- /board
- /state
- /resources
- /workshops
- /evidence
- /progress

## MVP acceptance

- Reads ANA Jira board.
- Reads curated current-state content from Confluence.
- Shows source-system freshness.
- Supports one verified Jira mutation.
- Displays Ana-State items from a schema-valid source.
- Does not persist raw transcript text.
- Requires authentication.
- Provides explicit error/blocked states when a connector is unavailable.

## Non-goals for v0

- CRM;
- generic project management suite;
- autonomous psychological profiling;
- independent backlog;
- replacing workshop whiteboards;
- automated life coaching.
