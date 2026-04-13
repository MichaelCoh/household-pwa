-- מניעת שליחה כפולה של תזכורת push לאותה משימה באותו יום (אזור זמן מטופל ב-Edge)
create table if not exists public.task_reminder_sent (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  fire_date date not null,
  sent_at timestamptz not null default now(),
  unique (task_id, fire_date)
);

create index if not exists idx_task_reminder_sent_fire on public.task_reminder_sent (fire_date);

alter table public.task_reminder_sent enable row level security;

-- אין policies ל-anon/authenticated — רק service_role (Edge) יכול לגשת

comment on table public.task_reminder_sent is 'סימון שתזכורת push נשלחה למשימה ביום מסוים (מנוע dispatch-task-reminders)';
