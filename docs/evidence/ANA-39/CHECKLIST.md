# ANA-39 — F1.I1 Instagram Signal Truth & H1/H4 Evidence Repair: acceptance criteria → evidence

Jira ANA-39 (parent ANA-1), normative contract Confluence 108920834 v3, DRS contract `.drs/ANA-39.json`.
Base `c7b2c069538bee29d2ca41c73ecb3ce6839d8efc` (ANA-38 merged). Every committed fixture and screenshot is synthetic
(`apps/dashboard/e2e/fake-social/core.mjs`, inline fixtures in `offers.test.ts`); no real caption, media id, permalink,
thumbnail, metric value or credential is in this change.

This file records what was implemented and which test proves it. It is **not** a gate verdict: IC / R2G / R4M
PASS or FAIL is set by a separate acceptor on the exact candidate SHA (docs/delivery/DRS.md).

## What changed (one model, no new framework)

| Area | Change |
|---|---|
| `themes.ts` | Themes stay a browsing aid. Hypothesis eligibility (TOPICAL_FIT) has its own rules: **H1** = opportunity/job term **adjacent to (or one word from)** a creator/UGC/remote/brand domain term, or a compact hashtag such as `#ugcjobs`; **H4** = reusable-artifact term (template, checklist, worksheet, media kit, …; "workflow" only with a file cue such as file, PDF, download, Notion). Bare "remote" pairs only with job terms, and the author's own job ("my remote job") is excluded. The ANA-38 family→hypothesis coupling (`opportunities` theme → H1 **and** H4) is removed. Session-only, hypothesis-specific corrections (`include` / `exclude` / caption rule). |
| `offers.ts` | Per hypothesis four independent lanes: CONTENT_RESONANCE, TOPICAL_FIT, AUDIENCE_NEED (NOT_CONNECTED), COMMERCIAL_OUTCOME (NOT_CONNECTED). No `supporting` / `contradicting`, no blended `SIGNAL`, no `lean`. Above/below same-format median = engagement and low-resonance comparators. Next evidence actions + `ABSTAIN`. `nextTest` (0.25 lean) replaced by a descriptive H1-only/H4-only comparison with the absolute index difference. |
| `insights.ts` | Calculations unchanged; `high_intent_*` renamed `content_action_*`, semantics documented ((saves + shares) ÷ reach is an action ratio, can exceed 1; 7 days = maturity cutoff, not age matching). |
| UI | `Patterns.tsx` four-lane card, decision fieldset, inspection with eligible/excluded posts, disclosure (formats + baseline n, not compared + reason, observed, period, ages) and limits. `ContentRows.tsx` per-post topical fit with provenance and session correction. `InstagramCockpit.tsx` holds corrections and passes `stale`. EN/DE/IT: no "high intent" wording. |
| Not touched | `src/app/api/**`, `src/server/**`, `proxy`, auth/access, worker, DTO (`types.ts`), deployment, CI. No new route, OAuth scope, persistence, storage, network call or external processing. |

## AC → tests

| AC | What is checked | Evidence |
|---|---|---|
| AC1 | Instagram read, native metrics, DTO, cockpit navigation unchanged | No change under `src/server`, `src/app/api`, `types.ts`; `insights.test.ts` pinned engine values unchanged (reel group n=18, median reach 3250, hidden winner syn004, practical-value 2.398, reuse 1.2615); `social.spec.ts` ANA-38 tests (AC1–AC10, failure states, mobile) green; real-boundary readback: **see "Live proof" — not run by the implementing session** |
| AC2 | Negative/positive/ambiguous topical fit; theme override never qualifies; dual-topic overlap | `offers.test.ts` "AC2 · …" (17 tests: travel-only high-save ≠ H1, "remote opportunity to travel" / own past job ≠ H1, personal "workout workflow" ≠ H4, generic money ≠ H4, generic creator/UGC ≠ H1, opportunity word without domain ≠ H1, opportunity and domain words that only co-occur ≠ H1, Italian "modello" ≠ H4, hashtag and DE/IT positives, generic tips ≠ H4, unclear/missing caption UNCLASSIFIED, creator-job → DERIVED H1 only, template → DERIVED H4 only, ANA-38 coupling regression, dual-topic overlap counted once, hypothesis-specific session corrections, before/after on the ANA-38 fixture); `social.spec.ts` "ANA-39 AC2 · a broad 'opportunities' theme override never qualifies H1 or H4" |
| AC3 | Four lanes, provenance, denominators, no product support/counterevidence | `offers.test.ts` "AC3 · …" (5 tests); `social.spec.ts` "ANA-39 AC2/AC3 · travel and money posts are no longer product evidence; four lanes…", "ANA-39 AC3/AC5 · session correction…" |
| AC4 | Format n, observed, lifetime, maturity ≠ age matching, comparability; zero reach, missing saves/shares, zero median, <5, <3, <8, unequal ages, 49 Reels / 1 Feed, stale, overlap, absolute delta vs percentage | `offers.test.ts` "AC4 · comparability limits…" (9 tests) and "AC4 · H1-only vs H4-only comparison…" (3 tests); `social.spec.ts` "ANA-39 AC4 · a stale snapshot is disclosed…", disclosure assertions in "ANA-39 AC2/AC3" |
| AC5 | Browser journey: H1/H4, source-post inspection, gaps, next step or ABSTAIN; before/after | `social.spec.ts` "AC7 · Substack offer signals…" (jump to post), "ANA-39 AC3/AC5 · … next step or ABSTAIN is selectable by keyboard", "ANA-39 AC5 · a chosen step that the evidence no longer offers is not shown as chosen"; screenshots below |
| AC6 | ANA-38 regression, LUMEN, EN/DE/IT, keyboard, mobile, a11y, privacy | full Playwright suite; `quality.spec.ts` axe on `/pulse/social/instagram`; `contrast.spec.ts` instagram cockpit / row detail / offer signals × 3 viewports; `social.spec.ts` "ANA-39 AC6 · de/it…", "ANA-39 AC6 · offer signals: lanes and next-step choice fit the viewport" (390×844); `src/i18n/i18n.test.ts` key + placeholder parity |
| AC7 | Exact-candidate gates, independent review, browser proof, real-boundary readback, Outcome Delta | This file + PR + Jira ANA-39 comments. Gate verdicts by the acceptor only. |

## Outcome Delta (decision quality, synthetic fixture; no revenue claim)

Measured on `e2e/fake-social/core.mjs` with the base model (`c7b2c06`) and the candidate model.

| | Before (ANA-38) | After (ANA-39) |
|---|---|---|
| H1 posts counted | 9, state `SIGNAL`; 7 of 9 only on generic travel words (abroad, island trip, hotel, beach, passport/nomad, weekend trip, holiday) | 3 with specific opportunity subject matter (2 Reels, 1 Carousel), TOPICAL_FIT `DERIVED` |
| H1 "supporting posts" | 4, of which 2 travel-only Reels (incl. the high-save "Island trip vlog") | none: above-median posts are labelled *engagement, not demand* |
| H4 posts counted | 9, state `SIGNAL`, "median high-intent index 1.97×"; 7 of 9 on money / "how to" / "tips" | 3 with a specific reusable file (template, checklist, media kit) |
| H4 "supporting posts" | 6, of which 4 without a reusable artifact (freelance money, budget breakdown, how to pitch, a job post via "how to apply") | none |
| Theme override `opportunities` on a travel post | post joins **both** H1 and H4 | no change to either |
| Content resonance | blended into the hypothesis state | own lane: `INSUFFICIENT_EVIDENCE` (2 of 3 eligible posts comparable; carousel group n = 3) with format-skew disclosed |
| Audience need / commercial outcome | footnote | own lanes, `NOT_CONNECTED`, sources named |
| Product lean | "difference of 0.25× or more favours one hypothesis" | removed; descriptive H1-only/H4-only comparison, absolute index points, explicitly not a product signal |
| Analyst output | implied signal | smallest next evidence step (*wait for more comparable posts on this specific subject*) or explicit ABSTAIN, session-only |

Corrected false positives on the fixture: 14 of 18 hypothesis memberships (7 H1 + 7 H4) rested only on generic
keywords and no longer count; all 10 "supporting" labels are gone, 6 of which were on posts without specific subject
matter; no product lean can be produced any more.

## Review

Round 1 (separate reviewer agent, read-only, adversarial against the contract): 2 blocking findings — H1 accepted
opportunity and domain words that only co-occur ("remote island trip, what an opportunity"), H4 accepted Italian
"modello" (model) — fixed in `20cc999` with the reviewer's captions as negative tests; non-blocking: stale chosen step
after evidence changes (fixed, e2e), hard-coded inspect ids (fixed), DE/IT and hashtag misses (partly added),
ABSTAIN-vs-review-captions suggestion (kept, documented in `offers.ts`). This agent review is not the DRS acceptor.

Round 2 (falsification of the topical-fit rule on `0e27519`, commit `1b516a3`): 3 more false positives fixed —
"Remote opportunity to travel this summer" (H1), "I quit my remote job last year" (H1), "My morning workout workflow"
(H4). Fixture eligibility unchanged; syn002's displayed keywords become "job, remote". CI green on `1b516a3`; the
implementing session re-ran lint, typecheck, unit tests and the social/visual/contrast specs on it.

## Remaining unknowns (not resolved by F1.I1)

- Real audience need (comments, DMs, questions): NOT_CONNECTED — F1.I2, needs a permission/data decision.
- Commercial outcomes (signups, clicks, sales): NOT_CONNECTED — F1.I3.
- One snapshot of lifetime metrics: no trend, no fair equal-age comparison, no causality.
- Keyword rules are English-first with a few DE/IT artifact words; topical fit is a suggestion an analyst can
  correct per session, never a reviewed classification.
- On the real account, the share of eligible posts per hypothesis and per format is unknown until the live readback.

## Screenshots (synthetic fake worker)

`screenshots/before-*` = base `c7b2c06`; `screenshots/after-*` = candidate. Same fixture, same framing.

- `before-1440x900-offer-signals-panel.jpg` / `after-1440x900-offer-signals-panel.jpg` — whole offer-signals panel
- `before-390x844-offer-signals-panel.jpg` / `after-390x844-offer-signals-panel.jpg` — same on mobile
- `before-1440x900-instagram-offer-signals-H1-inspection.jpg` / `after-…` — H1 inspection (visual.spec framing)
- `after-1440x900-instagram-row-detail-topical-fit.jpg` — per-post topical fit with provenance and correction
- `after-390x844-instagram-offer-signals-decision.jpg` — ABSTAIN chosen on mobile

Regenerate: `EVIDENCE_DIR=<dir> npx playwright test e2e/visual.spec.ts e2e/social.spec.ts -g "instagram|mobile|offer signals"`.

## Live proof (real boundary) — PO-run

The implementing cloud session has no worker key and must not obtain one. Run on the candidate SHA exactly as for
ANA-38 (`docs/evidence/ANA-38/CHECKLIST.md` → "Live proof"). `e2e-live/social.live.spec.ts` now records, per
hypothesis, the four lane states and the suggested next step, plus the H1 eligible count by source and the comparison
state — counts and states only. Post the `live-social-result.json` summary to Jira ANA-39.

## Integration with LIVE-01 (PR #12)

PR #12 (head `c0917c8`) changes the Social API route, access gate, proxy, packaging and CI. This change touches none
of them; the only shared files are e2e specs (`journeys.spec.ts` untouched; `visual.spec.ts` untouched). Either merge
order keeps PR #12's fail-closed access model intact; the second PR must be re-validated on the new base (R4M).

## Local environment note

The container's preinstalled Chromium (1194) is older than the pinned Playwright browser; local runs used an uncommitted
config override pointing at it. Under it, one ANA-38 assertion (`5.2k` vs `5.2K`, ICU compact-number casing) fails
identically on the base and the candidate. CI's pinned browser is authoritative.
