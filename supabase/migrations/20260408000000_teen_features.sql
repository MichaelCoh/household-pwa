-- ── Teen features: multi-day activities, hobbies, work shifts, pocket money ─

-- Multi-day support for child_activities
ALTER TABLE child_activities ADD COLUMN IF NOT EXISTS days_of_week jsonb DEFAULT '[]';

-- Teen hobbies & interests (replaces chugim for 16–18 range)
CREATE TABLE IF NOT EXISTS child_hobbies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  household_id text NOT NULL,
  name text NOT NULL,
  type text DEFAULT 'hobby',  -- hobby | work | volunteering | army_prep | other
  frequency_notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE child_hobbies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "household access" ON child_hobbies FOR ALL USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);

-- Work shifts log
CREATE TABLE IF NOT EXISTS child_work_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  household_id text NOT NULL,
  shift_date date NOT NULL,
  workplace text DEFAULT '',
  start_time time,
  end_time time,
  earnings numeric(8,2),
  notes text DEFAULT '',
  created_at timestamptz DEFAULT now()
);
ALTER TABLE child_work_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "household access" ON child_work_shifts FOR ALL USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);

-- Pocket money: allowance deposits + expense withdrawals + income
CREATE TABLE IF NOT EXISTS child_pocket_money (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  household_id text NOT NULL,
  type text NOT NULL DEFAULT 'expense',  -- allowance | expense | income
  amount numeric(8,2) NOT NULL,
  description text DEFAULT '',
  category text DEFAULT '',
  entry_date date NOT NULL,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE child_pocket_money ENABLE ROW LEVEL SECURITY;
CREATE POLICY "household access" ON child_pocket_money FOR ALL USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);

-- Army prep + driving log stored as JSON on children table
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS army_prep jsonb DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS driving_log jsonb DEFAULT '{}';
