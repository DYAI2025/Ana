-- ANA-40: freshness of the last successful base-token check (cron /me, refresh or OAuth callback).
-- Additive only: nullable columns without default and no backfill, so the running worker version keeps working
-- on this schema and an existing token reads as UNVERIFIED until the next successful check.
ALTER TABLE instagram_tokens ADD COLUMN last_check_at INTEGER;
ALTER TABLE instagram_tokens ADD COLUMN last_check_result TEXT;
ALTER TABLE instagram_tokens ADD COLUMN last_check_error_class TEXT;
ALTER TABLE instagram_tokens ADD COLUMN last_health_ok_at INTEGER;
ALTER TABLE instagram_tokens ADD COLUMN last_health_ok_source TEXT;
