# ANA-38 — Instagram cockpit: acceptance criteria → tests

Jira ANA-38 (ANA-SOCIAL-01A), DRS contract `.drs/ANA-38.json`. Every committed screenshot and fixture is synthetic
(`apps/dashboard/e2e/fake-social/core.mjs`); real-data evidence stays outside the repository (live proof below).

| AC | What is checked | Tests |
|---|---|---|
| AC1 | Pulse links to `/pulse/social/instagram`; rail item count unchanged; Pulse stays current | `e2e/social.spec.ts` "AC1 · Pulse links to the cockpit" |
| AC2 | LUMEN shell; rows in order hero · cluster · stream · map · audience · content · patterns · comments (5/7 · 12 · 7/5 · 12 · 7/5) | `social.spec.ts` "AC2/AC12"; `visual.spec.ts` instagram-* at 1440/1280/1024 (no overlap, no horizontal scroll) |
| AC3 | Real content through the server-side worker adapter | `e2e-live/social.live.spec.ts` (manual, real worker, recorded in Jira ANA-38); worker contract `workers/instagram-oauth/test/worker.test.mjs` "social snapshot: …" (7 tests) |
| AC4 | Thumbnails (glyph fallback), captions, permalinks, verified metrics render | `social.spec.ts` "AC4/AC5"; `src/server/social/social.test.ts` normalizeSnapshot |
| AC5 | Coverage: retrieved / total / more available / insights split / last verified | `social.spec.ts` "AC4/AC5"; `social.test.ts` "states coverage" |
| AC6 | Same-format groups only, posts < 7 days excluded, small groups get no index, n shown | `src/features/social/insights.test.ts` "never mixes formats", "excludes … too young"; `social.spec.ts` "AC6" |
| AC7 | H1 inspection end to end: supporting / contradicting posts, limitations, jump to the post | `social.spec.ts` "AC7"; `insights.test.ts` "Substack offer signals" (5 tests) |
| AC8 | Missing values are UNAVAILABLE / NOT_FETCHED / INSUFFICIENT_EVIDENCE / NOT_CONNECTED, never 0; no drawn history | `social.spec.ts` "AC8"; `social.test.ts` "missing values are null with a state", "VERIFIED without a number is downgraded"; worker "missing values are null + unavailable, never 0" |
| AC9 | No worker key, `SOCIAL_IG_*` name, Bearer header or worker path in the client bundle | `npm run scan:bundle` (CI, twice, second with the e2e key value); `social.spec.ts` "the browser never calls the worker"; `e2e-live` checks the BFF body for the real key |
| AC10 | Unit, API contract, error states, access control, UI interaction | `social.test.ts` (config, client, normalizer, service caching/STALE/permission, route loopback + not-configured + e2e control gate); `social.spec.ts` failure states (7 faults + EMPTY + STALE + permission-after-good-read); worker CI `worker-instagram` |
| AC11 | axe + pixel contrast at 1440/1280/1024; mobile 390 layout; keyboard (inspector, tabs); reduced motion; EN/DE/IT | `quality.spec.ts` axe `/pulse/social/instagram`; `contrast.spec.ts` 5 instagram states × 3 viewports; `social.spec.ts` mobile, inspector keyboard, tabs, German; `src/i18n/i18n.test.ts` key/placeholder parity |
| AC12 | Topbar says "Instagram live · read-only", not Prototype | `social.spec.ts` "AC2/AC12" |
| AC13 | Loopback only on the localhost prototype; synthetic committed artefacts. Since LIVE-01 the deployed instance (ana.dyai.cloud) admits only a verified Cloudflare Access identity from the invite list | `social.test.ts` "refuses a foreign Host before any worker call"; `src/server/boundary.test.ts` (shared `refuseUnauthorized`); `src/server/access.test.ts` (Access JWT, invite list, fail-closed configuration); `dashboard-image` workflow (gate inside the container); screenshots below |

## Screenshots (synthetic fake worker)

`screenshots/{1440x900,1280x800,1024x768}-instagram-{cockpit,row-detail,offer-signals}.jpg`,
`screenshots/390x844-instagram-{cockpit,content}.jpg` — regenerate with
`EVIDENCE_DIR=<dir> npx playwright test e2e/visual.spec.ts e2e/social.spec.ts -g "instagram|mobile"` in `apps/dashboard`.

## Live proof (real boundary)

Run by hand on the candidate SHA against the deployed worker, never in CI:

```bash
cd apps/dashboard && npm run build
SOCIAL_IG_WORKER_URL=https://login.dyai.cloud \
SOCIAL_IG_INTERNAL_READ_KEY="$(security find-generic-password -a "$USER" -s ana-instagram-oauth/INTERNAL_READ_KEY -w)" \
  npx next start --hostname 127.0.0.1 --port 3300 &
LIVE_BASE_URL=http://127.0.0.1:3300 LIVE_EVIDENCE_DIR=<dir outside the repo> \
SOCIAL_IG_INTERNAL_READ_KEY="$(security find-generic-password -a "$USER" -s ana-instagram-oauth/INTERNAL_READ_KEY -w)" \
  npx playwright test -c playwright.live.config.ts social.live
```

`live-social-result.json` holds states, counts and availability distributions only; its summary is posted to Jira ANA-38.
The spec refuses to run without `LIVE_EVIDENCE_DIR` outside the repository and without the key (leak check), and blanks
every caption and thumbnail before its screenshots.
