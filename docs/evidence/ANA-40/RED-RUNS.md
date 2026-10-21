# ANA-40 — Fail-first and canary evidence

A test is trusted only after it has been seen failing on code that has the defect. Test names are quoted without the
`health: ` prefix; numbers are omitted because they shift as tests are added.

## Fail-first (new tests run against the base implementation)

Both runs used the new `test/worker.test.mjs` (68 tests at that point) with `src/` of base `c7b2c06`:

| Run | Setup | Result |
|---|---|---|
| A | base `src/`, migrations without `0002_token_health.sql` | 18 failed / 68: every new test except "no new trigger …" |
| B | base `src/`, migrations with `0002_token_health.sql` | 16 failed / 68: as A, minus "migrations apply in file order …" (needs 0002, green once it exists) and "a refresh result for the old token …" (the base already guards the refresh write) |

Tests that are green on the base by design were proven by a canary instead (below): "no new trigger …" (M11),
"migrations apply in file order …" (red in run A), "a refresh result for the old token …" (red in run A, M2, M3, M15),
and "a failed refresh never reverts a REAUTH_REQUIRED set for the same token meanwhile", added after the implementation
(M7).

## Canaries (behaviour broken on purpose, file restored, sha256 checked afterwards)

Run on the final implementation, 69 tests, with `npm test` per mutation. Each mutation replaces exactly one pattern
(two for M14) and the runner refuses a pattern that does not occur exactly once.

| Mutation | Red (target) |
|---|---|
| M1 `/me` health write not bound to the checked ciphertext | "a /me result for the old token never touches a token re-authorized during the Meta call" |
| M2 refresh failure write (`mark`) not bound to the ciphertext | "a refresh result for the old token …"; existing "expired token is marked REAUTH_REQUIRED, but a concurrent re-authorization is never clobbered" |
| M3 refresh success write not bound to the ciphertext | "a refresh result for the old token …"; existing "a successful refresh never overwrites a token re-authorized concurrently" |
| M4 36 h boundary `>` instead of `>=` | "36 h boundary …"; "persistent UNVERIFIABLE turns UNVERIFIED …" |
| M5 cron calls `/me` after every refresh result | "Meta 190 at /me …"; "Meta 190 at a refresh-day refresh …"; "an expired token …"; "refresh day makes exactly one Meta call …"; "a refresh result for the old token …" |
| M6 callback `ON CONFLICT` path does not reset health | "a successful OAuth callback is fresh at once …" |
| M7 failed refresh writes the stale status back (base behaviour) | "a failed refresh never reverts a REAUTH_REQUIRED …" |
| M8 late `/me` result not limited to a `CONNECTED` row | "a late /me OK never revives a row …" |
| M9 code 190 at `/me` classified as UNVERIFIABLE | "Meta 190 at /me …"; "status contract …" |
| M10 `/me` accepts any `user_id` | "a different, missing or numeric user_id at /me …" |
| M11 a second cron trigger in `wrangler.toml` | "no new trigger …" |
| M12 status ignores freshness (base behaviour) | "cron /me OK …"; "36 h boundary …"; "persistent UNVERIFIABLE …"; "a successful POST /admin/refresh …"; "UNVERIFIED does not block reads …" |
| M13 Meta calls without the 10 s timeout signal | "cron /me OK …" (asserts the `AbortSignal` on the `/me` call) |
| M14 callback health reset moved to a separate, non-atomic `UPDATE` after the batch | "a successful OAuth callback is fresh at once …" (the one token write runs inside the batch and carries the reset) |
| M15 cron calls `/me` after a lost refresh write (`CONCURRENT_UPDATE`) | "a refresh result for the old token …" (asserts the call list is only the refresh) |

Every mutation turned at least its target red; all 15 left `src/index.mjs` and `wrangler.toml` byte-identical after
restore. M13–M15 and the assertions they kill were added after an adversarial review found them missing.

A first version of M7 replaced the call with `'CONNECTED'` inside a single-quoted string; the syntax error crashed the
whole file, which looks like a kill but proves nothing. It was replaced by the base call
`mark(reauth?'REAUTH_REQUIRED':row.connection_status, …)`, which turned only its target red.

## Review repair: four coverage gaps (R1–R4)

A read-only review of `8914a71` found mutations the 69-test suite let survive and an unasserted atomicity guard. Two tests
were added and three strengthened (71 tests); `src/` is unchanged. Each mutant ran in a disposable copy of
`workers/instagram-oauth` (worktree `src/index.mjs` sha256 checked unchanged after every batch), once with the suite
of `8914a71` and once with the repaired suite. The runner refuses a pattern that does not occur exactly once or a
mutant that does not parse. Unmutated control: 69/69 and 71/71 green.

| Mutant | Suite of `8914a71` (69) | Repaired suite (71): red |
|---|---|---|
| R1 refresh classifies codes 10/200 as `REAUTH_REQUIRED` | green 69/69 (survived) | "permission codes 10/200 and other non-190 refresh failures …" (`connection_status` `REAUTH_REQUIRED`, `last_check_result` `TOKEN_INVALID` for code 10) |
| R2a 24 h guard removed | 1 red: existing "refresh: not due, too young, due …" (direct call only) | that test and "24 h refresh guard …" (24 h − 1 s: refresh called instead of `/me`) |
| R2b 24 h guard `<=` instead of `<` | green 69/69 (survived) | "24 h refresh guard …" (exactly 24 h: `/me` instead of the refresh) |
| R3a `token-health` event logs `https://graph.instagram.com/v26.0/me?fields=user_id` | green 69/69 (survived) | "no secret, token, code, state or invite ever appears in logs (whole suite)" and the file-level `after()` guard |
| R3b `token-refresh` event logs `/refresh_access_token?grant_type=ig_refresh_token` (no scheme) | green 69/69 (survived) | the same two |
| R4a refresh health reset moved into a separate `UPDATE` guarded by the new ciphertext | green 69/69 (survived: same end state, not atomic) | "refresh day makes exactly one Meta call …" and "a successful POST /admin/refresh …" (2 token writes, expected 1) |
| R4b the same, guarded by the old ciphertext | 2 red (health never written) | the same two plus "24 h refresh guard …" |

A read-only adversarial review of that first repair (3 lenses, each finding verified by a skeptic) confirmed two
weaker-than-claimed guards: the log capture turned object and `Error` arguments into `[object Object]` / `Name: message`,
and the token-write capture saw only `run()` with upper-case, unquoted SQL. Both were tightened in the test file (full
`util.inspect` capture of non-string arguments; every non-`SELECT` statement touching `instagram_tokens` via `run()`,
`first()`, `all()` or `batch()`; the exact `SET` list of the rotating `UPDATE`; protocol-relative and bare host URLs).
The final suite (71) was run against all mutants above again (same results) and against these:

| Mutant | First repair (71) | Final suite (71): red |
|---|---|---|
| R3c URL inside an object argument (`console.error('…', {url})`) | green (survived) | the two log guards |
| R3d URL as `Error` `cause` | green (survived) | the two log guards |
| R3e bare host with path `graph.instagram.com/v26.0/me` | green (survived) | the two log guards |
| R3f protocol-relative `//graph.instagram.com/v26.0/me` | green (survived) | the two log guards |
| R4c extra token write after the rotation via `first()` | green (survived) | "refresh day …" and "a successful POST /admin/refresh …" (2 token writes) |
| R4d the same via `all()` | green (survived) | the same two |
| R4e the same via `run()`, lower-case `update` | green (survived) | the same two |
| R4f the same via `run()`, quoted `"instagram_tokens"` | green (survived) | the same two |
| R4g rotating `UPDATE` self-assigns `last_check_at`/`last_health_ok_at`, a second `UPDATE` sets them | red | the same two |

The first R3a run also showed the pre-existing flaky test "concurrent callbacks of one invitation …" red; two R3a
reruns showed only the two log-guard failures, and three control runs were 71/71. That flake is out of scope.

## Migration backward compatibility (R2G 4)

`docs/evidence/ANA-40/backcompat-check.sh` carries its own canaries and exits 2 when one of them does not fail: a changed
0001; six forbidden 0002 forms (NOT NULL, DEFAULT, CHECK, UPDATE, TRIGGER, DROP); and a 0002 that drops
`last_refresh_error`, which must turn the base suite red. Its output on the candidate SHA is recorded with the R2G
evidence.
