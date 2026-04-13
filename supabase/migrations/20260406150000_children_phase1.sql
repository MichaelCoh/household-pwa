-- ── Children Phase 1: enriched profile, milestones, vaccinations ──────────

-- Extend children table
ALTER TABLE children
  ADD COLUMN IF NOT EXISTS date_of_birth date,
  ADD COLUMN IF NOT EXISTS allergies jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS medications jsonb DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS pediatrician_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS pediatrician_phone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS active_features jsonb DEFAULT '[]';

-- Milestones timeline
CREATE TABLE IF NOT EXISTS child_milestones (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  household_id text NOT NULL,
  milestone_date date NOT NULL,
  description text NOT NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE child_milestones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household access" ON child_milestones FOR ALL USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);

-- Vaccination log
CREATE TABLE IF NOT EXISTS child_vaccinations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  child_id uuid NOT NULL REFERENCES children(id) ON DELETE CASCADE,
  household_id text NOT NULL,
  vaccine_name text NOT NULL,
  given_date date,
  next_date date,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE child_vaccinations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "household access" ON child_vaccinations FOR ALL USING (
  household_id IN (SELECT household_id FROM household_members WHERE user_id = auth.uid())
);
