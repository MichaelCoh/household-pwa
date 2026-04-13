-- Family role on household members: 'parent' or 'child'
-- Determines data-entry permissions in the Children section
ALTER TABLE household_members
  ADD COLUMN IF NOT EXISTS family_role text DEFAULT NULL;

COMMENT ON COLUMN household_members.family_role IS 'parent | child — used for Children section permissions';
