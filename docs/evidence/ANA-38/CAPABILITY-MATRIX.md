# ANA-38 — Verified Instagram data capability matrix

Measured 2026-10-14 against the deployed worker `ana-instagram-oauth` version `dd385141` (built from `47f1f6c`), Instagram
API with Instagram Login, Graph `v26.0`, granted scopes `instagram_business_basic` and `instagram_business_manage_insights`.
One live snapshot (`max=50`). Recorded as states and counts only; no values, ids, captions or links.

| Capability | State | Evidence |
|---|---|---|
| Media list, cursor pagination | VERIFIED_LIVE | 50 of 50 requested returned, 2 pages, more available |
| Caption | VERIFIED_LIVE | present on 50 / 50 (displayed on localhost only; never stored, logged or committed) |
| Thumbnail URL | VERIFIED_LIVE | 49 / 50 |
| Permalink, timestamp, media type | VERIFIED_LIVE | 50 / 50 |
| `media_product_type` | VERIFIED_LIVE | 49 REELS, 1 FEED |
| `like_count`, `comments_count` fields | VERIFIED_LIVE | 50 / 50 |
| Per-post insights `reach, views, saved, shares, likes, comments, total_interactions` | VERIFIED_LIVE | all 7 `ok`, period `lifetime`, on 38 posts |
| Per-post insights beyond the call budget | NOT_FETCHED (by design) | 12 posts; 45-call budget per snapshot (Cloudflare free-plan sub-request limit) |
| Followers count, media count | VERIFIED_LIVE | `ok` |
| Account `reach, views, accounts_engaged, total_interactions`, 28-day total | VERIFIED_LIVE | all 4 `ok` |
| Account history / daily series | NOT_CONNECTED | no observation store (PostgreSQL does not exist) |
| Audience breakdowns | NOT_REQUESTED in this slice | — |
| Comment text / classification | UNSUPPORTED in this slice | no approved permission or data decision |
| Substack registrations, subscribers, link clicks, sales | NOT_CONNECTED | no source exists |
