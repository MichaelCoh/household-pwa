-- Soft-delete support for shopping_items.
--
-- Previously, "Clear done" hard-deleted checked rows, destroying all purchase
-- history. The regulars algorithm needs that history to detect frequent items.
-- Solution: add cleared_at; clearChecked now sets this timestamp instead of
-- deleting. Rows with cleared_at != NULL are invisible to the app UI but
-- remain available for the regulars / analytics queries.

ALTER TABLE shopping_items
  ADD COLUMN IF NOT EXISTS cleared_at timestamptz DEFAULT NULL;

-- Index so getItems (cleared_at IS NULL) stays fast on large lists.
CREATE INDEX IF NOT EXISTS shopping_items_cleared_at_idx
  ON shopping_items (list_id, cleared_at)
  WHERE cleared_at IS NULL;
