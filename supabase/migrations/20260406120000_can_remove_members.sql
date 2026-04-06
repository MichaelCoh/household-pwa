ALTER TABLE household_members
  ADD COLUMN IF NOT EXISTS can_remove_members boolean DEFAULT false;
