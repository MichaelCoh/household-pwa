-- Helper: check if current user is owner or has can_remove_members in a given household
-- Uses SECURITY DEFINER to bypass RLS and avoid recursion
CREATE OR REPLACE FUNCTION can_manage_household_members(hid text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members
    WHERE user_id = auth.uid()
      AND household_id = hid
      AND (role = 'owner' OR can_remove_members = true)
  );
$$;

CREATE OR REPLACE FUNCTION is_household_owner(hid text)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM household_members
    WHERE user_id = auth.uid()
      AND household_id = hid
      AND role = 'owner'
  );
$$;

-- Fix DELETE policies
DROP POLICY IF EXISTS "hm_delete_own" ON household_members;
DROP POLICY IF EXISTS "hm_delete_self" ON household_members;
DROP POLICY IF EXISTS "hm_delete_managed" ON household_members;

CREATE POLICY "hm_delete_self" ON household_members
  FOR DELETE USING (user_id = auth.uid());

CREATE POLICY "hm_delete_managed" ON household_members
  FOR DELETE USING (
    can_manage_household_members(household_id)
    AND user_id != auth.uid()
    AND role != 'owner'
  );

-- Fix UPDATE policies
DROP POLICY IF EXISTS "hm_update_own" ON household_members;
DROP POLICY IF EXISTS "hm_update_self" ON household_members;
DROP POLICY IF EXISTS "hm_update_managed" ON household_members;

CREATE POLICY "hm_update_self" ON household_members
  FOR UPDATE USING (user_id = auth.uid());

CREATE POLICY "hm_update_managed" ON household_members
  FOR UPDATE USING (
    is_household_owner(household_id)
  );
