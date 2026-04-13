-- ── Children Phase 2: Activities, Homework/Exams, Sleep Logs ─────────────

-- Fixed weekly activity schedule
CREATE TABLE IF NOT EXISTS child_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  household_id text NOT NULL,
  name text NOT NULL,
  day_of_week smallint NOT NULL CHECK (day_of_week >= 0 AND day_of_week <= 6),
  start_time time NOT NULL,
  end_time time,
  location text DEFAULT '',
  notes text DEFAULT '',
  reminder_minutes int DEFAULT 30,
  color text DEFAULT '#6C63FF',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE child_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household access" ON child_activities FOR ALL USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);

-- Activity exceptions: cancellations or one-off events on a specific date
CREATE TABLE IF NOT EXISTS activity_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  activity_id uuid REFERENCES child_activities(id) ON DELETE CASCADE,
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  household_id text NOT NULL,
  exception_date date NOT NULL,
  type text NOT NULL DEFAULT 'cancelled', -- 'cancelled' | 'one_time'
  title text,
  notes text DEFAULT '',
  start_time time,
  location text DEFAULT '',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE activity_exceptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household access" ON activity_exceptions FOR ALL USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);

-- Homework & exams tracker
CREATE TABLE IF NOT EXISTS child_homework (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  household_id text NOT NULL,
  type text NOT NULL DEFAULT 'homework',     -- 'homework' | 'exam'
  subject text NOT NULL,
  description text DEFAULT '',
  due_date date NOT NULL,
  status text DEFAULT 'pending',             -- pending | in_progress | done
  prep_status text DEFAULT 'not_started',    -- for exams: not_started | studying | ready
  grade text DEFAULT '',                     -- filled after exam
  created_at timestamptz DEFAULT now()
);

ALTER TABLE child_homework ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household access" ON child_homework FOR ALL USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);

-- Sleep logs (toddler range and above)
CREATE TABLE IF NOT EXISTS child_sleep_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  household_id text NOT NULL,
  sleep_date date NOT NULL,
  bedtime time,
  wake_time time,
  nap_minutes int DEFAULT 0,
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now(),
  UNIQUE (child_id, sleep_date)
);

ALTER TABLE child_sleep_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household access" ON child_sleep_logs FOR ALL USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);
