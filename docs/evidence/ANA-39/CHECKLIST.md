# ANA-39 — F1.I1 Instagram Signal Truth & H1/H4 Evidence Repair: acceptance criteria → evidence

Jira ANA-39 (parent ANA-1), normative contract Confluence 108920834 v3, DRS contract `.drs/ANA-39.json`.
Implemented on base `c7b2c069538bee29d2ca41c73ecb3ce6839d8efc` (ANA-38 merged); integrated on 2026-10-31 with main
`8199150c34d5fc07c0be87b96de32f8157e7938b` (ANA-42 Bright Silver, ANA-35/ANA-45 Brain) and on 2026-11-02 with main
`0ecd727b4e1ce7b7b72d0d346e2cb5065274eb50` (ANA-48 World, ANA-50 release provenance; no conflict, see "Integration with main
and R2G(4) binding"). Against that main the PR diff holds ANA-39 files only: the branch's own PR-head workflow edits were dropped in the merge in favour of main's equivalent
`SOURCE_SHA` / `pr-<sha>` convention (`docs/delivery/DRS.md`). Every committed fixture and screenshot is synthetic
(`apps/dashboard/e2e/fake-social/core.mjs`, inline fixtures in `offers.test.ts`); no real caption, media id, permalink,
thumbnail, metric value or credential is in this change.

This file records what was implemented and which test proves it. It is **not** a gate verdict: IC / R2G / R4M
PASS or FAIL is set by a separate acceptor on the exact candidate SHA (docs/delivery/DRS.md).

## What changed (one model, no new framework)

| Area | Change |
|---|---|
| `themes.ts` | Themes stay a browsing aid. Hypothesis eligibility (TOPICAL_FIT) has its own rules: **H1** = opportunity/job term **adjacent to (or one word from)** a creator/UGC/remote/brand domain term, or a compact job hashtag such as `#ugcjobs` under the same guards; a generic "opportunity" needs work context (remote-work domain, "job/work opportunities", a call to apply); **H4** = reusable-artifact term (template, checklist, worksheet, media kit, …; "workflow" only with a file cue such as file, PDF, download, Notion). Bare "remote" pairs only with job terms, and the author's own job ("my remote job") is excluded. The ANA-38 family→hypothesis coupling (`opportunities` theme → H1 **and** H4) is removed. Session-only, hypothesis-specific corrections (`include` / `exclude` / caption rule). |
| `offers.ts` | Per hypothesis four independent lanes: CONTENT_RESONANCE, TOPICAL_FIT, AUDIENCE_NEED (NOT_CONNECTED), COMMERCIAL_OUTCOME (NOT_CONNECTED). No `supporting` / `contradicting`, no blended `SIGNAL`, no `lean`. Above/below same-format median = engagement and low-resonance comparators. Next evidence actions + `ABSTAIN`. `nextTest` (0.25 lean) replaced by a descriptive H1-only/H4-only comparison with the absolute index difference. |
| `insights.ts` | Calculations unchanged; `high_intent_*` renamed `content_action_*`, semantics documented ((saves + shares) ÷ reach is an action ratio, can exceed 1; 7 days = maturity cutoff, not age matching). |
| UI | `Patterns.tsx` four-lane card, decision fieldset, inspection with eligible/excluded posts, disclosure (formats + baseline n, not compared + reason, observed, period, ages) and limits. `ContentRows.tsx` per-post topical fit with provenance and session correction. `InstagramCockpit.tsx` holds corrections and passes `stale`. EN/DE/IT: no "high intent" wording. |
| Live readback | `Patterns.tsx` eligible list carries `data-count` (model total); `e2e-live/social.live.spec.ts` records H1 **and** H4 eligible totals from it (the inspection renders at most 12 rows) and asserts rendered = min(total, 12). |
| Not touched | `src/app/api/**`, `src/server/**`, `proxy`, auth/access, worker, DTO (`types.ts`), deployment, CI workflows (against main 0ecd727). No new route, OAuth scope, persistence, storage, network call or external processing. |

## AC → tests

| AC | What is checked | Evidence |
|---|---|---|
| AC1 | Instagram read, native metrics, DTO, cockpit navigation unchanged | No change under `src/server`, `src/app/api`, `types.ts`; `insights.test.ts` pinned engine values unchanged (reel group n=18, median reach 3250, hidden winner syn004, practical-value 2.398, reuse 1.2615); `social.spec.ts` ANA-38 tests (AC1–AC10, failure states, mobile) green; real-boundary readback: **see "Live proof" — not run by the implementing session** |
| AC2 | Negative/positive/ambiguous topical fit; theme override never qualifies; dual-topic overlap | `offers.test.ts` "AC2 · …" (25 tests, incl. review rounds 3–6 caption sets: travel-only high-save ≠ H1, "remote opportunity to travel" / own past job ≠ H1, personal "workout workflow" ≠ H4, generic money ≠ H4, generic creator/UGC ≠ H1, opportunity word without domain ≠ H1, opportunity and domain words that only co-occur ≠ H1, Italian "modello" ≠ H4, hashtag and DE/IT positives, generic tips ≠ H4, unclear/missing caption UNCLASSIFIED, creator-job → DERIVED H1 only, template → DERIVED H4 only, ANA-38 coupling regression, dual-topic overlap counted once, hypothesis-specific session corrections, before/after on the ANA-38 fixture); `social.spec.ts` "ANA-39 AC2 · a broad 'opportunities' theme override never qualifies H1 or H4" |
| AC3 | Four lanes, provenance, denominators, no product support/counterevidence | `offers.test.ts` "AC3 · …" (5 tests); `social.spec.ts` "ANA-39 AC2/AC3 · travel and money posts are no longer product evidence; four lanes…", "ANA-39 AC3/AC5 · session correction…" |
| AC4 | Format n, observed, lifetime, maturity ≠ age matching, comparability; zero reach, missing saves/shares, zero median, <5, <3, <8, unequal ages, 49 Reels / 1 Feed, stale, overlap, absolute delta vs percentage | `offers.test.ts` "AC4 · comparability limits…" (9 tests), "AC4 · review round 3: format skew…" (2 tests) and "AC4 · H1-only vs H4-only comparison…" (5 tests); `social.spec.ts` "ANA-39 AC4 · a stale snapshot is disclosed…", disclosure assertions in "ANA-39 AC2/AC3" |
| AC5 | Browser journey: H1/H4, source-post inspection, gaps, next step or ABSTAIN; before/after | `social.spec.ts` "AC7 · Substack offer signals…" (jump to post), "ANA-39 AC3/AC5 · … next step or ABSTAIN is selectable by keyboard", "ANA-39 AC5 · a chosen step that the evidence no longer offers is not shown as chosen"; screenshots below |
| AC6 | ANA-38 regression, LUMEN, EN/DE/IT, keyboard, mobile, a11y, privacy | full Playwright suite; `quality.spec.ts` axe on `/pulse/social/instagram`; `contrast.spec.ts` instagram cockpit / row detail / offer signals × 3 viewports, and "contrast 390 · ANA-39 evidence blocks" (phone-width scroll sweep, see below); `social.spec.ts` "ANA-39 AC6 · de/it…", "ANA-39 AC6 · offer signals: lanes and next-step choice fit the viewport" (390×844); `src/i18n/i18n.test.ts` key + placeholder parity |
| AC7 | Exact-candidate gates, independent review, browser proof, real-boundary readback, Outcome Delta | This file + PR + Jira ANA-39 comments. Gate verdicts by the acceptor only. |

## Phone-width contrast (AC6 repair)

Below 391px the nav becomes a fixed bottom bar and the dusk atmosphere stays fixed behind translucent glass, so the
background behind a note changes while the page scrolls. Measured on macOS, pinned Chromium 1243, 390×844, fake
worker, the `contrast.spec.ts` pixel method (static position, plus a sweep over every scroll position), base
`c7b2c06` against `c7d7bfd`; repeated runs gave identical values:

| Reading | Base | `c7d7bfd` | Class |
|---|---|---|---|
| Offer-signal disclosure "Reel 2/2, n = 18 · Carousel 0/1, n = 3", 2.57:1 | — | 2.57 at the default scroll position only | measurement defect: the text box lies under the fixed bottom nav (covered, not shown) |
| "Caption shown on this computer only; not stored." | 4.57 static, 3.20 worst while scrolling | 4.45 static, 3.20 worst while scrolling | pre-existing |
| Row-detail "Reach" / "Shares" labels | 3.75 / 4.05 | 3.70 / 3.99 | pre-existing |
| Topical-fit editor notes; H1 inspection fit-row reasons, "Low resonance…", disclosure labels | — (blocks are new) | 3.24–4.21 worst while scrolling | introduced by ANA-39, repaired |
| H4 inspection "Low resonance…" and disclosure labels | — (block is new) | 4.48–4.49 worst while scrolling | introduced by ANA-39, repaired |
| ANA-39 rule notes and reworded text in card slots that already failed on base: H1 rule note (base "Mapped keyword families"), H4 rule note, H1 description, offers intro | 3.15 / 4.28 / 3.64 / 2.95 | 3.03 / 4.41 (3.75 with H4 inspected) / 3.55 / 2.91 | ANA-39 text in a pre-existing failing slot; repaired in the card stabilization below |
| Content-row metric value "8" | 4.51 | 4.48 with the row detail open, 4.51 in every other state | pre-existing failing column (siblings "20", "10", "41", "0.92×" at 4.26–4.43 on base and candidate); the 0.03 shift comes from the taller row detail (topical-fit editor) moving the glass sheen; **not repaired** — fixing it means re-styling every metric row |

Repair: the inspection, the H1-only/H4-only comparison and the topical-fit editor get the ink backing and secondary
note tone the lanes and decision already use (`social.module.css`). Guard: "contrast 390 · ANA-39 evidence blocks"
sweeps the row-detail topical-fit editor and, per hypothesis card, the lanes, decision and inspection (plus the
comparison) through the viewport in 40px steps, skips text under fixed chrome and fails if any scoped block had no
measured text. It failed on `c7d7bfd` with 17 texts in 3 of 3 states (3.24–4.49:1) and passed 3 of 3 runs after the
repair. Lowest ratio on these blocks after the repair (20px steps), 390 / 1024 / 1280 / 1440: topical fit and H1
card 4.89 / 5.37 / 5.22 / 5.20, H4 card 6.03 / 6.04 / 7.04 / 7.26. The topical-fit `<select>` value is not
pixel-measured by the method (option text); its opaque `--canvas-soft` background with `--text` computes to 10.70:1.

Card stabilization (second pass, measured against `a6e8151` at 20px sweep steps, base and `c7d7bfd` alongside): the
H1/H4 cards and the offers intro get the same ink backing at 0.28 and the secondary note tone; the intro gets a
padded, rounded box. That padding makes the offers panel 16px taller, which moved the theme-table head "Theme" from
4.53 to 4.49 at 390px (4px sweep: 4.534 → 4.488; already 4.49 on `a6e8151` with an inspection open, 4.16–4.41 on
base), so that head inside `.offers` takes the secondary tone as well (now 5.26). The guard's H1 and H4 states now
also cover the card itself and the intro (listed after the blocks, which keep their own measured-text check). Red on
the `a6e8151` styles with the extended guard: H1 state "H1 and H4 are product hypotheses…" 2.91, H1 rule note 3.03,
H1 description 3.55, card title 4.38; H4 state rule note 3.75, description 4.34; both failing at the contrast
assertion with every surface measured. Canary: an intro selector that matches nothing fails "every surface had
measured text". Green 3 of 3 runs after the repair. Lowest ratio after the repair, 390 / 1024 / 1280 / 1440: card
text 5.37 / 5.71 / 5.63 / 5.57, intro 5.29 / 5.57 / 5.56 / 5.54; no text in the offers panel under 4.5:1 at any of
the four widths, and no text in the swept range worse than on `a6e8151` by more than 0.05. Still under 4.5:1 there
at 390px and unchanged: the "Observations" tab label (4.32), pre-existing.

Silver theme (merge of main `6899575`, ANA-42 ASADA Bright Silver): main turned the canvas light. The ink backing
above (`rgba(20,15,19,…)`) and the white panel title, both tuned for the dark canvas, then failed: panel titles 1.00:1
(main itself uses `--text` there), ANA-39 lane, decision and fit notes 3.41–3.55:1, 13 of 87 contrast tests red on the
merged tree. Repair: titles back to `--text`, every ANA-39 backing becomes main's light `--surface-veil`, the notes keep
`--text-secondary`. Contrast spec 87/87 green after the repair, including the 390px ANA-39 sweep guard.

Not repaired, pre-existing on base and outside the guard: across the Instagram cockpit at 390px many older texts
measure below 4.5:1 at some scroll position (row metrics, eyebrows, tab labels, observation
labels). The guard is scoped so those findings neither hide nor excuse a regression in the ANA-39 blocks; they need
their own decision. This is a focused check, not a WCAG conformance claim for the dashboard.

## Outcome Delta (decision quality, synthetic fixture; no revenue claim)

First measured on `e2e/fake-social/core.mjs` with the base model (`c7b2c06`) and the candidate model. **Re-measured
2026-10-31** after the integration: the fixture changed on main since `c7b2c06` (LIVE-01/ANA-42), the H1/H4 model files
(`offers.ts`, `themes.ts`, `insights.ts`) did not. Main `8199150`'s model and the candidate model on the fixture of
`8199150` (28 posts), run as throwaway vitest files, not committed: before H1 9 posts `SIGNAL` (median index 0.87,
4 supporting), H4 9 posts `SIGNAL` (median 1.97, 6 supporting), lean `INSUFFICIENT_EVIDENCE` (6/6 disjoint), a
`opportunities` override on travel-only `syn005` puts it in H1 **and** H4; after H1 = syn002, syn008, syn022 and
H4 = syn004, syn013, syn020 (`DERIVED`), both resonance `INSUFFICIENT_EVIDENCE` (2 of 3 comparable), need and outcome
`NOT_CONNECTED`, suggested step *comparable observations*, comparison `INSUFFICIENT_EVIDENCE` (2/2/0), the override
qualifies neither. Dropped memberships: H1 syn003, 005, 009, 011, 014, 017, 019 (all travel-family matches); H4
syn002, 006, 009, 010, 014, 016, 018 (money / how-to / tips) — 14 of 18. The table below holds on that run.

**Re-measured 2026-11-02 on the integration candidate:** model of main `0ecd727` against the candidate model, fixture blob
`e78cf4a` identical in both trees, 28 posts, throwaway vitest files, not committed. Before: H1 9 posts `SIGNAL` (median 0.87, 4
supporting, 5 contradicting), H4 9 posts `SIGNAL` (median 1.97, 6 supporting, 3 contradicting), lean `INSUFFICIENT_EVIDENCE`
(6/6); an `opportunities` override on `syn005` (already H1 through travel) adds it to H4 too. After: H1 syn002, syn008, syn022
and H4 syn004, syn013, syn020, both `DERIVED` with 0 session corrections and 0 overlap, resonance `INSUFFICIENT_EVIDENCE` (2 of 3
comparable), need and outcome `NOT_CONNECTED`, suggested step *comparable observations*, comparison `INSUFFICIENT_EVIDENCE`
(2/2/0); the override qualifies neither. The dropped memberships are the 14 listed above. The fixture has no hashtag caption,
so the final repair moves no fixture number; its delta is the caption matrix (H1 eligibility; base = the family mapping):

| Caption (synthetic) | Base `0ecd727` | `2fdfab9` | Candidate |
|---|---|---|---|
| `#creatoropportunity` / `#creatoropportunities` / `#ugcopportunities` | no | yes | no |
| `AI is a massive brand opportunity #creatoropportunity` | yes | yes | no |
| `Not a #ugcjob` / `I quit my #remotejob` | no | yes | no |
| `#ugcjobs` | no | yes | yes |
| `How to land your first UGC job` | no (H4 yes) | yes | yes |
| `Creator opportunities: apply before Friday` / `Brands hiring UGC creators` | yes | yes | yes |

The bare-hashtag and guard false positives were introduced by ANA-39, not inherited from the base. REVENUE_UPLIFT: NOT_MEASURED.

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

Round 3 (integration onto main `8199150`, candidate `d9a49c9`): word proximity kept admitting new idioms, so the rule
was rebuilt on allowlisted constructions inside one clause; the comparison gained its own limitations list.

Round 4 (adversarial review of `d9a49c9`): 15 confirmed findings, 13 of them the same class as rounds 1–3 (caption
keyword false positives). Per the review-convergence rule the idiom-by-idiom patching stopped. The change of strategy:
guards (first-person possessives incl. "our/unser/nostro", own-job verbs such as "booked/landed/quit", negators incl.
the contraction pieces "don/isn/…") now read the whole clause before the construction, not two words; "hiring" counts
only when announced; the connector form does not count as the predicate of a copula; colon list heads must be plural;
"workflow", "spreadsheet" and "toolkit" need a file cue as modifier or apposition. All 26 reviewer captions are
negative tests (red on `d9a49c9`, green after). Stats: resonance format-skew now also fires when every indexed post is
one format in a mixed eligible set; the comparison discloses `format-mix` for any format mix, independent of post
order.

Round 5 (adversarial review of `471eecf`): 17 confirmed, 6 major, again the same class. Root cause: a construction
("UGC jobs", "remote job") says nothing about whether a job is on offer; how-to, commentary, the author's own BTS and
nomad-lifestyle captions all contain one. Structural change: H1 now also requires an explicit offer signal in the
caption (apply, casting call, open call, deadline, wanted, list/board/listing, vacancy, bewerben, candidatura, or
announced hiring; compact job hashtags still count alone), and an advice frame (how, where, tips, guide, …) before
the construction abstains. H4: an app name alone is no file cue, and a modifier cue must stand right before the term.
The format-mix text now holds for equal mixes too. Accepted cost (recall, minor in round 5): real offers without such a
signal ("Remote jobs for creators", "Job alert: …", "No experience needed") are no longer derived; an analyst includes
them per session.

Round 6 (adversarial review of `b8388d4`): 12 confirmed, 3 major. Two were holes in the round-5 gate itself: the
everyday words "list", "board" and "wanted" counted as offer signals anywhere ("bucket list", "vision board", "always
wanted"), and "brands are hiring" commentary read as an announcement. Fix: "list/board/listing/roundup" count only right
after an opportunity noun, "wanted" only right after a domain word, generic subjects ("everyone/brands are hiring") and
a judging copula later in the clause do not announce hiring, and "why" is an advice frame. H4: a Reels/CapCut
"template" (with reel/capcut/trend/audio/edit in the clause, or "use (this) template") is an edit preset, not a file.
The 9 minor round-6 findings (recall losses of the disclosed kind, H4 how-to/figurative mentions) are recorded, not
patched: the classifier is frozen here, because six rounds show that each review finds new phrasings of the same class
and only the PO precision decision below can close it.

AC2 contract repair (PO decision 2026-10-31, on `54441ce`): the round-5 offer-signal gate and advice-frame abstention
went beyond Confluence 108920834 v3, which asks for "a specific creator/UGC/remote-work opportunity or job context" and
names "a specific UGC-job Reel" as a TOPICAL_FIT candidate; it never requires a live job posting. Both are removed from
`themes.ts` (`H1_OFFER_SIGNALS`, the list/board/wanted signals and `ADVICE_FRAMES` go with them). H1 is again a specific
job/opportunity TOPIC read from the unchanged constructions; how-to, list and job-market commentary captions count
("How to land your first UGC job", "Where to find remote jobs as a creator", "UGC jobs for creators"). Unchanged:
constructions, hashtags, the bare-"remote" and copula/connector rules, the hiring-announcement rule, and the guards for
first-person possessives, own-job verbs, negators and praise; all H4 logic; all four lanes; AUDIENCE_NEED and
COMMERCIAL_OUTCOME = NOT_CONNECTED. Proof: the new `offers.test.ts` block "AC2 repair · …" failed on `54441ce` (3 of 4
positive captions returned no match; "Brands hiring UGC creators — apply now" already matched and is kept as a
preservation case) and passes after the change; the fixture before/after test is unchanged (syn002/syn008/syn022, H4
syn004/syn013/syn020).

AC2 finding on `0b80d41` (2026-10-31): generic business-opportunity commentary qualified for H1 through the adjacent
form ("AI is a massive brand opportunity", "Reels are a huge creator opportunity"), and the residual test pinned it as
eligible. The connector form already abstained under a copula; the adjacent form now applies the same copula guard, only
to the generic terms "opportunity"/"opportunities" (job-specific terms and "hiring" are untouched; no offer signal is
required). Proof: the `offers.test.ts` cases "negative (AC2 finding) …" and "outcome delta (AC2 finding) …" fail on
`0b80d41` and pass after the change; the outcome delta shows the rule now returns what an analyst previously had to
exclude by hand, with identical H1 resonance, H4 lane, source metrics and NOT_CONNECTED lanes. Known cost: a generic
"opportunity" announced with a copula ("Here are 5 creator opportunities this week") now abstains as well (pinned).

Residual of that finding on `6b28633` (2026-11-01): the copula guard was incomplete. Without a copula ("Huge brand
opportunity in AI right now") or with a modal ("Reels could be a major creator opportunity") the same commentary was
still H1. The copula guard is replaced by one boundary for the generic terms "opportunity"/"opportunities" in every
construction: they count only with work context in their clause, i.e. a remote-work domain ("remote work
opportunities"), a job/work noun right before them ("job opportunities for creators") or a call to apply ("apply now",
"apply by Friday", "how to apply"; not "apply this hook", "apply yourself"). Job-specific terms, "hiring", hashtags, all
guards, H4 and the four lanes are unchanged; no offer signal is required for job topics. Proof: the `offers.test.ts`
cases "negative (AC2 finding) …" and "outcome delta (AC2 finding) …" fail on `6b28633` (e.g. "Huge brand opportunity in
AI right now" → `[opportunity, brand]`; outcome delta eligible `[g3, g4, job]`) and pass after the change; the four
specific job-topic positives and the ANA-38 fixture before/after (syn002/syn008/syn022) are unchanged. Precision gain:
own sponsorships without work context ("Grateful for this brand opportunity …") are no longer DERIVED. Recall cost,
accepted: "Here are 5 creator opportunities this week" still abstains, as does any bare "creator opportunities" list
whose call to apply sits in another clause; "Creator opportunities: casting call for UGC" stays H1 through the casting
call, but the bare head no longer adds the keywords `opportunities`/`creator`. Not changed (out of this repair's scope):
the compact hashtags `#creatoropportunity`, `#creatoropportunities` and `#ugcopportunities` still counted on their own
at that commit (closed by the final bounded repair below).

Final bounded repair (PO brief 2026-11-02, on `2fdfab9`; the brief states the product interpretation, Jira and Confluence do
not yet): a bare generic creator/UGC opportunity hashtag gives no specific job context, and conservative abstention is
preferred. `ugcopportunities`, `creatoropportunity` and `creatoropportunities` leave `H1_HASHTAG_TERMS`; `ugcjob(s)`,
`creatorjobs` and `remotejob(s)` stay and now apply the negation, first-person possessive and own-job verb guards of the
other constructions, read over one clause. The `H1Rule` copy (EN/DE/IT) drops the "creator opportunity" example and states
that a creator or brand opportunity without job context does not qualify; each example it names is accepted by the rule.
Proof: `offers.test.ts` block "AC2 final repair · …", 15 failed / 62 passed on the unchanged `2fdfab9` classifier and copy,
77 / 77 after the change. Known cost, pinned: a job hashtag in a clause holding a guard word abstains ("No experience needed
#ugcjobs", "Got a new camera #ugcjobs"); a hashtag in its own clause or line still counts. The praise guard was not extended
to hashtags (the brief names negation and own-job). Session-only inclusion stays available for every abstained post.

Residual limit (stated, not hidden): a caption keyword rule cannot read intent. Without the gate, captions that mention
the author's own current job carry no guard cue and are now DERIVED ("Just shot a UGC job for a skincare brand", "BTS of
today's UGC job", "POV: you have a remote job and live in Bali"); they are pinned in `offers.test.ts` as uncertain
DERIVED suggestions that an analyst excludes per session. (Own brand opportunities and generic opportunity commentary
left this list on 2026-11-01: without work context they are UNCLASSIFIED.) The rule still abstains where a
guard fires (e.g. "My top 5 UGC jobs this week", "I quit my remote job", "Not a UGC job"). The lane is labelled a
DERIVED suggestion, never confirmed demand; a reviewed classification is not part of F1.I1.

## Remaining unknowns (not resolved by F1.I1)

- Real audience need (comments, DMs, questions): NOT_CONNECTED — F1.I2, needs a permission/data decision.
- Commercial outcomes (signups, clicks, sales): NOT_CONNECTED — F1.I3.
- One snapshot of lifetime metrics: no trend, no fair equal-age comparison, no causality.
- Keyword rules are English-first with a few DE/IT artifact words; topical fit is a suggestion an analyst can
  correct per session, never a reviewed classification.
- On the real account, the share of eligible posts per hypothesis and per format is unknown until the live readback.

## Screenshots (synthetic fake worker)

Regenerated 2026-11-02: `screenshots/before-*` = main `0ecd727` (pre-ANA-39 model on its shell); `screenshots/after-*` =
the integrated candidate's app tree. One throwaway spec ran on both trees with the same steps, viewport and reduced motion:
offer-signals panel element, H1 inspection viewport, ABSTAIN decision, row detail of syn004. The inspection image uses the same
`scrollIntoViewIfNeeded` step on both trees; the after panel is taller, so the two scroll positions differ. All text is synthetic
(fake worker). Historical baseline: `screenshots/baseline-8199150/before-*`, unchanged files from main `8199150`; the
previous after-images stay in the history of `2fdfab9`.

- `before-1440x900-offer-signals-panel.jpg` / `after-1440x900-offer-signals-panel.jpg` — whole offer-signals panel
- `before-390x844-offer-signals-panel.jpg` / `after-390x844-offer-signals-panel.jpg` — same on mobile
- `before-1440x900-instagram-offer-signals-H1-inspection.jpg` / `after-…` — H1 inspection (visual.spec framing)
- `after-1440x900-instagram-row-detail-topical-fit.jpg` — per-post topical fit with provenance and correction
- `after-390x844-instagram-offer-signals-decision.jpg` — ABSTAIN chosen on mobile

Regenerate: `EVIDENCE_DIR=<dir> npx playwright test e2e/visual.spec.ts e2e/social.spec.ts -g "instagram|mobile|offer signals"`.

## Live proof (real boundary)

R2G(6) is a PO-run readback on the exact candidate SHA, loopback only, after `/admin/probe` and `/admin/insights-probe`
pass (status CONNECTED alone is not a real read; Jira ANA-39 18072). A run by an agent is AGENT_REPORTED: it can count
only through a separate, SHA-bound PO decision outside the contract (Jira 18119 did so for `e3dd023`; it does not
transfer). Run exactly as for
ANA-38 (`docs/evidence/ANA-38/CHECKLIST.md` → "Live proof"). `e2e-live/social.live.spec.ts` records, per
hypothesis, the four lane states and the suggested next step, the H1 and H4 eligible totals with their derived /
session split (model counts) and the comparison state — counts and states only. Post the `live-social-result.json` summary to Jira ANA-39.

## Integration with main and R2G(4) binding

Merge of `0ecd727` on 2026-11-02: no conflict. `ContentRows.tsx` auto-merged and keeps both ANA-39's topical-fit row and
ANA-48's `image_url` thumbnail fallback. Against `0ecd727` these paths are unchanged (`git diff --quiet`, rc 0, canary on
`themes.ts` rc 1): `e2e/fake-social`, `fake-jira`, `fake-brain`, `fixtures.ts`, `visual.spec.ts`, `playwright.config.ts`,
`next.config.ts`, `src/components/shell`, `src/app`, `src/lib`; also `src/server`, `src/proxy.ts`, `src/features/world`,
`src/features/social/types.ts`, `workers`, `deploy`, `.github`. `/api/world*` passes the same access gate
(`refuseUnauthorized`, `readWriteRequest`). So fixture, shell and harness of the before and after images are the same files.

R2G(4) named main `8199150` as the current base. It is rebound to `0ecd727`: 8199150 lacks the ANA-48 World navigation entry,
so its shell is no longer the current one. The requirements are kept and the identity of fixture and shell is added.
ANA-48's cover-image vision call (`src/server/world/vision.ts`, off without `ANTHROPIC_API_KEY`) arrives from main; this change
adds no external processing, and the AC6 statement is bound to the ANA-39 diff.

## Integration with LIVE-01 (PR #12)

PR #12 (head `c0917c8`) changes the Social API route, access gate, proxy, packaging and CI. This change touches none
of them; the only shared files are e2e specs (`journeys.spec.ts` untouched; `visual.spec.ts` untouched). Either merge
order keeps PR #12's fail-closed access model intact; the second PR must be re-validated on the new base (R4M).

## Local environment note

The container's preinstalled Chromium (1194) is older than the pinned Playwright browser; local runs used an uncommitted
config override pointing at it. Under it, one ANA-38 assertion (`5.2k` vs `5.2K`, ICU compact-number casing) fails
identically on the base and the candidate. CI's pinned browser is authoritative.
