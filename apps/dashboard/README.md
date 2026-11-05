# ANA Dashboard

## What is live and what is prototype

The app in this folder is **ASADA** — Ana Savu Dashboard (Jira ANA-4 visual shell, ANA-5 Jira work loop, ANA-38 Instagram cockpit, ANA-42 Bright Silver home, ANA-35 Brain).

- **Board and Backlog are a projection of Jira** (ANA-5): Kanban Board **734 "ANA board" / filter 10733** in project
  ANA. Issue keys, summaries, statuses and assignees are read from Jira; moving an issue runs a Jira workflow
  transition and *Add idea* creates a Jira item in Backlog. Every write is read back from Jira before the UI shows it
  as confirmed; failures are shown as **ERROR / BLOCKED / UNKNOWN**, never as success. The browser keeps no copy of
  work: a reload or reconnect reads Jira again.
- **The Brain reads the ANA Brain** (ANA-35): `/brain` shows the projection of the Brain service (semantic positions,
  clusters, explicit relations, provenance). The server reads it with `BRAIN_API_URL` and `BRAIN_API_TOKEN` (see
  `.env.example`; the browser never sees either). Without them the page shows **BLOCKED — the Brain connection is not
  configured**, never example notes. It writes nothing.
- **The media kit** (ANA-53, slice 1): `/kit` is the brand-facing page, for now an internal preview behind the same
  access check as every data route. It is rendered on the server from the world snapshot, so the page carries only
  aggregated numbers and cover links (never captions or `/api/world`). A number Instagram did not return as VERIFIED
  is left out, never shown as 0. `?for=asia|west|<own preset>` picks what a brand sees first. Ana's own content —
  her line, the contact for the one button, case studies, packages, add-ons and own presets — comes from
  `media-kit.json` next to the audience history in the state directory (never in git; the repo is public). Every
  part is optional: a missing part hides its section, and the preview bar lists what is hidden. The file is read on
  each view; with the systemd unit's `DynamicUser` it must belong to the unit's state directory owner
  (`chown --reference=<state dir> media-kit.json`, mode 0600). Shape (all fields optional):

  ```json
  {
    "name": "Ana Savu",
    "tagline": "a line in Ana's own words",
    "contact": { "email": "…", "label": "Work with Ana", "subject": "Collaboration" },
    "partners": [{ "name": "…", "kind": "paid | gifted | ugc | affiliate | partnership (optional)" }],
    "reels": { "<media id>": { "kind": "organic | partnership | ugc | concept", "brand": "…" } },
    "cases": [{ "id": "…", "brand": "…", "title": "…", "summary": "…", "role": "…", "deliverables": ["…"], "period": "…", "source": "…", "results": [{ "label": "…", "value": "…" }], "link": "https://…" }],
    "packages": [{ "name": "…", "price": "from …", "includes": ["…"], "note": "…" }],
    "addons": [{ "name": "Usage rights", "price": "…", "note": "…" }],
    "presets": { "insurer-us": { "base": "west", "label": "…", "focus": ["US", "GB"], "focus_label": "US & UK", "sections": ["audience", "numbers", "reels", "proof", "packages"], "tiles": ["followers", "reach", "engagement", "watch", "hold"], "reels": ["<media id>"], "cases": ["<case id>"] } }
  }
  ```

  ANA-54 adds: partners under the hero numbers (names only, no logos; the kind only when it is set — a brand without
  a kind shows its name alone); Reel labels on the cards; a "Typical Reel" before the best Reels (medians of views and
  reach over the same Reels, at least 5 of them and each at least 7 days old, with n and dates); case role,
  deliverables, measurement window and source, and "no published results" for a case without results; a hero link
  that leads down to the one button, whose e-mail opens with a short briefing; the preset's market share in the hero;
  "live" only for a reading of at most 26 h. A case's id defaults to its brand as a slug ("Nomad eSIM" →
  `nomad-esim`, a second case of the same brand `nomad-esim-2`); the preview bar lists the ids.

  Public per-brand links without the dashboard login, open tracking and revocation are a later slice.
- **Everything else is local prototype data**: Sessions, Whiteboard, Calendar, Pulse, Vault and Toolbox are not
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
| Idempotency | Jira is the durable record. Add idea carries a client request id stored on the issue; before any create the server searches Jira for that id and for a dashboard idea with exactly the same text added in the last hour, and answers with that item instead of creating. A process-local ledger covers the seconds before Jira's search shows a new item. A create that got no answer is not re-sent by "Check Jira again" — the tab repeats what it knows (`knownUnconfirmed`), so this holds across a server restart too; after a 60 s hold "Create it again" is offered as an explicit, explained choice. The exact guarantees and the two residual cases are the table in `docs/evidence/ANA-5/CHECKLIST.md`. |
| Failure | `ERROR` (Jira refused or disagrees), `BLOCKED` (configuration, credential, permission, workflow, board drift), `UNKNOWN` (no answer; Jira's state is not known). The UI then shows Jira's current truth for the issue and re-reads the board. |
| Provenance | The source line names board, filter and read time; every issue links to Jira. |
| Audit | Jira's own issue history records each transition and creation (by the integration account). The dashboard keeps no audit store of its own. |
| Secrets | Read only from server environment variables; never sent to the browser or written to logs or responses. The work API answers only loopback hosts. |

### Structure

- `src/app/` — routes: `/` ASADA home (ANA-42), `/board?ticket=`, `/backlog?ticket=`, `/sessions`, `/sessions/[id]?tab=`, `/brain?node=`, `/whiteboard`, `/calendar?event=`, `/pulse`, `/pulse/social/instagram`, `/vault`, `/toolbox?tool=`; `src/app/api/work/` — the work API; `src/app/api/social/instagram` — the read-only Social API (ANA-38)
- `src/server/` — server-only Jira adapter (`jira/`) and request guards (`http.ts`)
- `src/server/social/` + `src/features/social/` — Instagram cockpit (ANA-38): server-only worker client, normalizer to the observation DTO, in-memory snapshot cache; client-side insight engine, themes and Substack offer signals. Configure `SOCIAL_IG_WORKER_URL` and `SOCIAL_IG_INTERNAL_READ_KEY` (see `.env.example`); without them the cockpit says not-configured. Evidence: `docs/evidence/ANA-38/`.
- `src/features/work/` — client-safe work types, pure model, the `WorkProvider` (disposable view state) and failure/provenance UI
- `src/styles/globals.css` — ASADA Bright Silver tokens (silver canvas, glass material, brushed aluminium, restrained coral), atmosphere, focus and reduced-motion rules
- `src/components/` — shell (rail, top bar, search palette), providers (i18n, prototype state, toasts), UI primitives
- `src/features/<module>/` — one folder per module view; pure logic (Brain projection, calendar month grid) is unit-tested
- `src/fixtures/` — **fictional** prototype content in EN/DE/IT for the prototype modules; must never hold private data (public repo)
- `src/state/prototype.ts` — the in-memory reducer behind Calendar and Whiteboard (no work state)
- `src/i18n/` — EN (reference), DE, IT dictionaries; a test enforces identical keys and placeholders
- `e2e/fake-jira/` — test-only fake of the Jira endpoints the adapter uses (synthetic issues, injectable faults)

Design reference: ASADA Bright Silver (Confluence 07 §2.1 and Design Schema §2.1, Owner decision 26 October 2026, ANA-42) on the C4 / ANA LUMEN material grammar (ANA-10 decision KEEP C4, kept as history). The single-file C4 prototype is **not**
in this repository (it carries business-specific wording); it was rebuilt here as components and tokens. Brain,
Whiteboard and Calendar are not in C4 and were designed in the same language. The Brain view draws the Brain
service's projection on a 2D canvas with a small perspective projection — the production 3D library is still
spike-gated.

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
