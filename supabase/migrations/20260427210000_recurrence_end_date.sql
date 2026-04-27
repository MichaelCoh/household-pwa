-- Recurrence end-date — caps how long a recurring task/event keeps repeating.
--
-- A daily/weekly/monthly/yearly/custom task or event is normally open-ended:
-- once `due_date`/`date` is set, it repeats indefinitely on each anchor's
-- subsequent occurrences. With `recurrence_end_date` (inclusive), the
-- recurrence stops on that date — no occurrences shown in the calendar
-- past it, no reminders dispatched past it.
--
-- NULL means "no end date" (back-compat with all existing rows).

ALTER TABLE tasks  ADD COLUMN IF NOT EXISTS recurrence_end_date date;
ALTER TABLE events ADD COLUMN IF NOT EXISTS recurrence_end_date date;
