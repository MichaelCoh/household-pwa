-- Calendar sync simplification
-- ─────────────────────────────────────────────────────────────────
-- Earlier work added a multi-tier sync stack: Google Calendar OAuth (two-way),
-- ICS export/import, imported-events mirror, and per-event/per-source toggles.
-- The product direction is now a single-purpose, one-way subscription from the
-- app to the user's native phone calendar via webcal://. This migration drops
-- everything that supported the now-removed flows; it is idempotent and safe
-- to re-run.

-- Drop tables that only existed for Google two-way sync, ICS import, and the
-- multi-source sync history view.
DROP TABLE IF EXISTS imported_calendar_events;
DROP TABLE IF EXISTS calendar_secrets;
DROP TABLE IF EXISTS calendar_sync_log;

-- Drop event/task columns that backed Google mirroring and per-event sync opt-out.
ALTER TABLE events DROP COLUMN IF EXISTS sync_to_phone;
ALTER TABLE events DROP COLUMN IF EXISTS google_event_id;
ALTER TABLE events DROP COLUMN IF EXISTS google_calendar_id;
ALTER TABLE events DROP COLUMN IF EXISTS last_pushed_at;

ALTER TABLE tasks  DROP COLUMN IF EXISTS sync_to_phone;
ALTER TABLE tasks  DROP COLUMN IF EXISTS google_event_id;
ALTER TABLE tasks  DROP COLUMN IF EXISTS google_calendar_id;
ALTER TABLE tasks  DROP COLUMN IF EXISTS last_pushed_at;

-- Drop the now-unused Google fields from calendar_connections. We keep the
-- table itself because it stores the webcal feed_token (one row per user,
-- provider='webcal').
ALTER TABLE calendar_connections DROP COLUMN IF EXISTS google_email;
ALTER TABLE calendar_connections DROP COLUMN IF EXISTS google_calendars;
ALTER TABLE calendar_connections DROP COLUMN IF EXISTS google_token_expires_at;
ALTER TABLE calendar_connections DROP COLUMN IF EXISTS privacy_acknowledged_at;

-- Remove any stale non-webcal rows (Google connections that may have been
-- created before this migration). Webcal rows keep their feed_token and
-- continue to power active subscriptions.
DELETE FROM calendar_connections WHERE provider <> 'webcal';
