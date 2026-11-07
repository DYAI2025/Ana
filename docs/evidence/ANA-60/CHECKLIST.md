# ANA-60 — Reel rates overview: acceptance criteria → tests

Jira ANA-60, DRS contract `.drs/ANA-60.json`. Every committed screenshot and fixture is synthetic
(`apps/dashboard/e2e/fake-social/core.mjs`, `apps/dashboard/e2e/fake-social/tags.json`); real-data evidence stays
outside the repository.

| AC | What is checked | Tests |
|---|---|---|
| AC-1 | Like, share, save, comment rate = counter ÷ reach, exact; counter or reach missing → no rate; reach 0 → no rate; the row shows "Not fetched"/"Unavailable", never 0 | `src/features/social/overview.test.ts` "AC-1 ·" (4 tests); `e2e/social.spec.ts` "ANA-60 · … AC-1" |
| AC-2 | Category = Haiku `theme` at confidence ≥ 0.5 (0.5 counts); < 0.5, invalid record or no reading → "Not categorised"; tagger off → "Category not available", no category filter, no summary groups; browser receives only theme + confidence of the snapshot's own posts | `overview.test.ts` "AC-2 ·" (4 tests); `src/server/social/categories.test.ts` (4 tests); `social.spec.ts` "AC-2 ·" (2 tests, incl. `?__categories=off`) |
| AC-3 | Sort by date, reach and each rate, both directions, missing values last, ties newest first; category + format + feed/trial filters combine; "x of y posts" | `overview.test.ts` "AC-3 ·" (3 tests); `social.spec.ts` "AC-3 ·" (2 tests) |
| AC-4 | Summary per category over the filtered rows: n, median per rate, "Too few posts" below 3, formats named, young posts counted, click sets / clears the category filter | `overview.test.ts` "AC-4 ·" (4 tests); `social.spec.ts` "AC-4 ·" |
| AC-5 | Posts younger than 7 days marked "still growing" | `overview.test.ts` "AC-5 ·"; `social.spec.ts` "AC-5 ·" |
| AC-6 | Keyword themes not in row head, filters, summary or category cells; in the detail as "Offer signal themes (keyword-based, for H1/H4)" with the session override; Patterns and Offer Signals identical to the baseline recorded on `main` 52f33ef before the change | `overview.test.ts` "AC-6 ·" (baseline `src/features/social/__fixtures__/patterns-baseline.json`); `social.spec.ts` "AC-6 ·", "German: …"; existing `insights.test.ts`, `social.spec.ts` AC7 / patterns tests unchanged and green |
| AC-7 | `npm run check`, `npm run e2e` (incl. axe `quality.spec.ts`, `contrast.spec.ts`), `npm run scan:bundle`, i18n key/placeholder parity | see "Runs on the candidate" below |
| AC-8 | Screenshots 1440×900, 1280×800 (and 1024×768), 390×844: table with rates and categories, active sort, active category filter, summary with n < 3 categories, open detail | `e2e/visual.spec.ts` shots `instagram-rates-sorted-filtered`, `instagram-rates-summary`, `instagram-row-detail`; `social.spec.ts` mobile test; files in `screenshots/` |
| AC-9 | Real data on authorized loopback, 3 Reels against Instagram Insights | **not performed in this session** (cloud container without the worker key or Ana's Instagram Insights); procedure below |

## Changed e2e expectations (ANA-38 tests), and why

The row now carries Post | Category | Reach | four rates. Views and the reach index moved into the row detail, which
already showed views; the reach index was added there. Only these expectations changed, for exactly that reason:
`social.spec.ts` "AC8" (views of syn007 and "No insights" checked in the detail), "AC6" ("Too young to compare",
"Format group too small" checked in the detail), "every row value has an accessible label" and the mobile test
(the row label checked is now a rate label instead of "Reach index").

The fake worker's insights `likes` now differs per post (`round(reach × 0.05) + (index mod 5) × 9`, interactions
follow); before, every like rate was exactly 5.00 % and sorting by like rate could not be tested. The public
`like_count` counter (pulse, world) is unchanged.

## Category delivery

`GET /api/social/instagram` adds `categories: { state: "on" | "off", tags: { <media id>: { theme, confidence } } }` to
a successful answer. Source: the world's Haiku tagger (`src/server/world/tagger.ts`, Ana's consent 2026-11-02),
shared per process (`postTaggerFromEnv`, one writer of the tags file). A cockpit read queues the snapshot's untagged
posts for the same background reader (a few per read, never waited for) and waits only for the stored file to be
read. Off without `ANTHROPIC_API_KEY`. e2e: `SOCIAL_IG_E2E_TAGS_FILE` (only with `SOCIAL_IG_E2E_CONTROLS=1`) reads the
synthetic file through the store's own checks.

## AC-9 procedure (Ben, local, not committed)

1. On the candidate SHA, start the dashboard on loopback with the real worker key and `ANTHROPIC_API_KEY`
   (as in `docs/evidence/ANA-38/CHECKLIST.md`, "Live proof"), open `/pulse/social/instagram`.
2. Pick 3 Reels older than 7 days. For each, note from Instagram Insights: reach, likes, saves, shares, comments.
3. Compare with the row detail ("Instagram metrics (lifetime)") and check each rate: counter ÷ reach × 100, one
   decimal, equals the row value.
4. Count rows with a category vs. all rows with insights. **Below half → stop and report** (no substitute classifier).
5. Record as text only in a Jira ANA-60 comment: "Reel A/B/C: 5 of 5 values match, 4 of 4 rates match", category
   coverage "k of n rows". No captions, ids, permalinks or images.

## Runs on the candidate

Filled in after the candidate run (exact SHA, commands, results).
