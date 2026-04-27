-- Phone-calendar sync: Google Calendar (OAuth2) + webcal/ICS subscription + ICS import.
--
-- Tables:
--   calendar_connections — public-readable per-user metadata: provider, status, settings,
--     and Google account email. Subscription URL token lives here for fast lookup.
--   calendar_secrets     — service-role-only: OAuth refresh/access tokens. RLS denies
--     all access; only the google-calendar edge function (using SERVICE_ROLE_KEY) reads.
--   imported_calendar_events — events pulled from external calendars (Google or ICS).
--     Soft-deleted by setting deleted_at when source removes the event.
--   calendar_sync_log    — last N sync operations per user, for the Settings history view.
--
-- Extensions:
--   events  — sync metadata: google_event_id, google_calendar_id, sync_to_phone,
--             plus richer fields: end_date, end_time, all_day, recurrence,
--             reminder_minutes, location.
--   tasks   — sync metadata only (tasks already have due_date + recurrence + reminder_time).

-- ── calendar_connections ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_connections (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id    text NOT NULL,
  provider        text NOT NULL, -- 'google' | 'webcal' | 'ics'
  -- Google-specific
  google_email           text,
  google_calendars       jsonb  NOT NULL DEFAULT '[]', -- [{id,name,primary,color,enabled}]
  google_token_expires_at timestamptz,
  -- webcal-specific
  feed_token      text UNIQUE, -- crypto-random URL token (for /functions/v1/calendar-feed/<token>.ics)
  -- per-connection settings + status
  settings        jsonb  NOT NULL DEFAULT '{}'::jsonb,
  -- shape: {auto_sync_new: true, import_external: true, default_event_sync: true,
  --         source_prefs: {<source_id>: 'always_import'|'always_skip'|'ask'},
  --         suppress_app_notifications_when_synced: true}
  privacy_acknowledged_at timestamptz,
  status          text NOT NULL DEFAULT 'active', -- 'active' | 'error' | 'revoked'
  last_error      text,
  last_sync_at    timestamptz,
  connected_at    timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

CREATE INDEX IF NOT EXISTS calendar_connections_household_idx
  ON calendar_connections (household_id);
CREATE INDEX IF NOT EXISTS calendar_connections_feed_token_idx
  ON calendar_connections (feed_token) WHERE feed_token IS NOT NULL;

ALTER TABLE calendar_connections ENABLE ROW LEVEL SECURITY;

-- A user manages only their own connections.
CREATE POLICY "calendar_connections own" ON calendar_connections
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── calendar_secrets (service-role only) ────────────────────────────────────
-- RLS is enabled but no policies are created — clients cannot read/write.
-- Only the google-calendar edge function (using SERVICE_ROLE_KEY) accesses this.
CREATE TABLE IF NOT EXISTS calendar_secrets (
  connection_id   uuid PRIMARY KEY REFERENCES calendar_connections(id) ON DELETE CASCADE,
  refresh_token   text,
  access_token    text,
  scope           text,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE calendar_secrets ENABLE ROW LEVEL SECURITY;
-- (intentionally no policies)

-- ── imported_calendar_events ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS imported_calendar_events (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  household_id         text NOT NULL,
  imported_by_user_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  source               text NOT NULL,                -- 'google' | 'ics'
  source_event_id      text NOT NULL,                -- Google ID or ICS UID
  source_calendar_id   text,                         -- Google calendar id or ''
  source_calendar_name text,
  title                text NOT NULL,
  description          text DEFAULT '',
  location             text DEFAULT '',
  date                 date NOT NULL,                -- start date (local)
  time                 text,                         -- HH:MM or null for all-day
  end_date             date,
  end_time             text,
  all_day              boolean NOT NULL DEFAULT false,
  recurrence_rule      text,                         -- raw RRULE
  color                text DEFAULT '#7d8590',
  html_link            text,                         -- deep-link back into source
  raw                  jsonb NOT NULL DEFAULT '{}'::jsonb,
  deleted_at           timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE(household_id, source, source_calendar_id, source_event_id)
);

CREATE INDEX IF NOT EXISTS imported_calendar_events_household_date_idx
  ON imported_calendar_events (household_id, date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS imported_calendar_events_source_idx
  ON imported_calendar_events (source, source_calendar_id);

ALTER TABLE imported_calendar_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "household access" ON imported_calendar_events FOR ALL USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);

-- ── calendar_sync_log ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS calendar_sync_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  household_id    text NOT NULL,
  provider        text NOT NULL,                   -- 'google' | 'webcal' | 'ics'
  direction       text NOT NULL,                   -- 'pull' | 'push' | 'export' | 'import' | 'auth'
  status          text NOT NULL,                   -- 'success' | 'error' | 'partial'
  items_count     int  NOT NULL DEFAULT 0,
  error_message   text,
  synced_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS calendar_sync_log_user_synced_at_idx
  ON calendar_sync_log (user_id, synced_at DESC);

ALTER TABLE calendar_sync_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "calendar_sync_log own" ON calendar_sync_log
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── events: rich fields + sync metadata ─────────────────────────────────────
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_date         date;
ALTER TABLE events ADD COLUMN IF NOT EXISTS end_time         text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS all_day          boolean NOT NULL DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS location         text DEFAULT '';
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence       text DEFAULT 'none';
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_interval int DEFAULT 1;
ALTER TABLE events ADD COLUMN IF NOT EXISTS reminder_minutes int;       -- null = inherit/none
ALTER TABLE events ADD COLUMN IF NOT EXISTS sync_to_phone    boolean;   -- null = use connection default
ALTER TABLE events ADD COLUMN IF NOT EXISTS google_event_id  text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS google_calendar_id text;
ALTER TABLE events ADD COLUMN IF NOT EXISTS last_pushed_at   timestamptz;

CREATE INDEX IF NOT EXISTS events_google_event_id_idx
  ON events (google_event_id) WHERE google_event_id IS NOT NULL;

-- ── tasks: sync metadata ────────────────────────────────────────────────────
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS sync_to_phone     boolean;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS google_event_id   text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS google_calendar_id text;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS last_pushed_at    timestamptz;

CREATE INDEX IF NOT EXISTS tasks_google_event_id_idx
  ON tasks (google_event_id) WHERE google_event_id IS NOT NULL;
