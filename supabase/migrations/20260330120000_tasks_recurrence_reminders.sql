-- משימות חוזרות + תזכורות (הרץ ב-Supabase SQL Editor אם אין CLI)
alter table public.tasks
  add column if not exists recurrence text default 'none';

alter table public.tasks
  add column if not exists recurrence_interval int default 1;

alter table public.tasks
  add column if not exists recurrence_weekday smallint null;

alter table public.tasks
  add column if not exists reminder_enabled boolean default false;

alter table public.tasks
  add column if not exists reminder_time time null;

comment on column public.tasks.recurrence is 'none | daily | weekly | monthly | yearly | custom';
comment on column public.tasks.recurrence_interval is 'every N days (custom) or multiplier for weekly';
comment on column public.tasks.recurrence_weekday is '0=Sun..6=Sat for weekly';
