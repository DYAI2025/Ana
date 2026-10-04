# ANA-4 — Interaction checklist (ANA LUMEN localhost increment)

Purpose: the short interaction checklist required by ANA-4 and the starting point for the ANA-10 visual decision
gate. Every row says how to try it by hand, which automated test proves it, and which screenshot shows it.
Exact pass counts and the commit they were measured on are recorded in the pull request and in the Jira ANA-4
evidence comment, not here, so this file cannot drift from a later head.

**All content is fictional prototype data.** Nothing is connected to Jira, Confluence, Drive, a calendar, an AI
provider or a database. Ideas, ticket moves, notes and events live only in the open browser tab and reset on reload.

## Start

```bash
npm run dev            # repository root; Node >= 22.12; first run installs deps; prints the URL (3000, or next free port)
```

## Journeys

| # | Try this | Expected | Automated proof (apps/dashboard/e2e) | Screenshot |
|---|---|---|---|---|
| 1 | Open `/` | Current Focus statement first; Work and Last Session larger/brighter; Business, Knowledge, Community smaller | journeys `1 ·` | `*-now.jpg` |
| 2 | Click **Work**, then Esc; click **Last session**, close ×; click **Community**, click outside | Side lens opens with focus inside, Tab stays in it, closes three ways, focus returns to the card | journeys `2 ·` | `*-now-lens-work.jpg` |
| 3 | Rail → **Board** | Kanban NEXT / DOING / REVIEW / DONE, tickets show Ana / Ben / Vince by name | journeys `3–5` | `*-board.jpg` |
| 4 | Filter **Ana**, **Ben**, **Vince**, **All** | Only that person's tickets; empty columns say so | journeys `3–5` | `*-it-board.jpg` |
| 5 | Drag a ticket to another column; or focus it and press Shift+→ | Ticket moves, toast says "local only"; keyboard keeps focus on the ticket | journeys `3–5`, regressions | — |
| 6 | **Backlog · 6** (Board header) | Separate Backlog page | journeys `6–7` | `*-backlog-add-idea.jpg` |
| 7 | **Add idea**, submit empty, then type and submit | Error first; then idea on top with "New · local", nothing sent to Jira | journeys `6–7`, regressions | `*-backlog-add-idea.jpg` |
| 8 | Rail → **Sessions** → "Current focus and first loop" | Session detail opens | journeys `8–9` | `*-sessions.jpg` |
| 9 | Tabs **Watch / Summary / Transcript / JSON** (also ←/→) | Each view renders; transcript and JSON marked fictional | journeys `8–9`, SessionDetail.test | `*-session-transcript.jpg` |
| 10 | Rail → **Brain**: drag, scroll, click a node, use the list | Rotates, zooms, selected node is focused and its illustrative links highlighted; banner: no sources, no embeddings | journeys `10 ·`, regressions | `*-brain-selected.jpg` |
| 11 | Rail → **Whiteboard**: Add sticky, drag a note, Enter to edit, Delete | Note added/moved/edited/removed, arrow keys move a focused note | journeys `11 ·`, regressions | `*-whiteboard.jpg` |
| 12 | Rail → **Calendar**: **Add event** (try end before start), pick a day | Validation message, then event in the grid and the agenda; month navigation | journeys `12 ·`, regressions | `*-calendar.jpg` |
| 13 | Rail → **Pulse**, **Vault**, **Toolbox** | "Not connected yet" everywhere, no numbers, tool links "not configured" | journeys `13 ·` | `*-pulse.jpg`, `*-vault.jpg`, `*-toolbox.jpg` |
| 14 | **EN / DE / IT** in the top bar, then reload | Chrome and content switch language; choice survives reload | journeys `14 ·`, regressions | `*-de-now.jpg`, `*-it-board.jpg` |
| 15 | ⌘K / Ctrl+K or `/` or **Search**: try "workshop 02", "kalender", "lavagna" | Results across pages, tickets, backlog, sessions, Brain, calendar, tools, sources; Enter opens | journeys `15 ·`, regressions | — |

## Quality gates

| Check | How | Spec |
|---|---|---|
| No overlap, no horizontal scroll, rail inside viewport, dialog not clipped — 14 views × 1440×900, 1280×800, 1024×768 | DOM geometry on the production build | `visual.spec.ts` |
| Text contrast ≥ 4.5:1 (3:1 large) measured on rendered pixels, 19 states × 2 viewports | text hidden, worst-case background pixel per text run | `contrast.spec.ts` |
| axe WCAG 2.1 A/AA: no serious/critical issue on 11 routes and 10 open states (lens, search, forms, tabs) | `@axe-core/playwright` | `quality.spec.ts` |
| Visible focus, rail current-page marking, reduced motion (no auto-rotation, near-zero transitions), meaning not colour-only, state resets on reload | browser checks | `quality.spec.ts` |
| Regressions from review round 1 (each test was shown to fail on the code before its fix) | — | `regressions.spec.ts` |
| Unit: reducer, search, i18n key/placeholder parity, Brain projection, calendar grid, fixture honesty | Vitest | `src/**/*.test.ts(x)` |

Run everything: `npm run check && npm run e2e` (in `apps/dashboard`). Regenerate screenshots:
`EVIDENCE_DIR=<dir> npx playwright test e2e/visual.spec.ts` (PNG; the files here are JPEG copies).

## Known limits (deliberate for this slice)

- Brain is a hand-written fixture drawn on a 2D canvas with perspective projection; the production Three.js /
  3d-force-graph choice is still spike-gated (Confluence 08). It shows no real knowledge.
- Calendar opens on the fictional fixture month (October 2026).
- Whiteboard is a minimal custom surface, not Excalidraw (still spike-gated).
- The C4 single-file reference is not in the repository (business-specific wording); it was rebuilt as components.
- No authentication: localhost only.
