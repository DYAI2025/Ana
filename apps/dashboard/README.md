# ANA Dashboard

## Local prototype (ANA-4)

The app in this folder is the **ANA LUMEN clickable localhost increment** (Jira ANA-4). It exists for the
visual/UX decision gate (ANA-10). **Everything in it is local prototype data**: nothing is connected to Jira,
Confluence, Drive, a calendar, an AI provider or a database, and nothing is saved — ideas, ticket moves,
whiteboard notes and calendar events live in memory for the browser tab and reset on reload. Only the chosen
language is remembered (localStorage key `ana.locale`).

### Run it

Requires Node.js ≥ 22.12 (see `/.nvmrc`). From a clean checkout, at the repository root:

```bash
npm run dev          # installs apps/dashboard deps on first run, then serves http://localhost:3000
                     # (if 3000 is busy, Next picks the next free port and prints it; or set PORT=3005)
```

Other commands (repository root, or `npm run <x>` inside `apps/dashboard`):

| Command | What it does |
|---|---|
| `npm run check` | lint + typecheck + unit tests + production build |
| `npm run e2e` | Playwright journeys, accessibility (axe), reduced-motion and viewport layout checks against a production build on port 3100 |
| `npm start` | production build served on http://localhost:3000 (or `PORT`) |

Inside `apps/dashboard`: `npm test` (Vitest), `npx vitest run src/lib/search.test.ts` (one file),
`npx playwright test e2e/journeys.spec.ts -g "Brain"` (one journey), `npm run e2e:install` (Chromium for Playwright).
`EVIDENCE_DIR=<dir> npx playwright test e2e/visual.spec.ts` writes the 1440/1280/1024 screenshot set to `<dir>`.

### Structure

- `src/app/` — routes: `/` Now, `/board`, `/backlog`, `/sessions`, `/sessions/[id]?tab=`, `/brain?node=`, `/whiteboard`, `/calendar?event=`, `/pulse`, `/vault`, `/toolbox?tool=`
- `src/styles/globals.css` — LUMEN tokens (canvas, pastel refraction, glass material, coral accent), atmosphere, focus and reduced-motion rules
- `src/components/` — shell (rail, top bar, search palette), providers (i18n, prototype state, toasts), UI primitives
- `src/features/<module>/` — one folder per module view; pure logic (Brain projection, calendar month grid) is unit-tested
- `src/fixtures/` — **fictional** prototype content in EN/DE/IT; must never hold private data (public repo)
- `src/state/prototype.ts` — the in-memory reducer behind every local interaction
- `src/i18n/` — EN (reference), DE, IT dictionaries; a test enforces identical keys and placeholders

Design reference: C4 / ANA LUMEN (Confluence 07). The single-file C4 prototype is **not** in this repository
(it carries business-specific wording); it was rebuilt here as components and tokens. Brain, Whiteboard and Calendar
are not in C4 and were designed in the same language. The Brain is a hand-written visual fixture drawn on a 2D canvas
with a small perspective projection — the production 3D library (3d-force-graph candidate) is still spike-gated.

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
