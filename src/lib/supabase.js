import { createClient } from '@supabase/supabase-js'

const rawUrl = import.meta.env.VITE_SUPABASE_URL
const rawKey = import.meta.env.VITE_SUPABASE_ANON_KEY

export const isSupabaseConfigured = Boolean(
  rawUrl && String(rawUrl).trim() && rawKey && String(rawKey).trim(),
)

// Valid-shaped placeholders so imports never throw; App gates on isSupabaseConfigured.
const SUPABASE_URL = isSupabaseConfigured
  ? String(rawUrl).trim()
  : 'http://127.0.0.1:1'
const SUPABASE_ANON_KEY = isSupabaseConfigured
  ? String(rawKey).trim()
  : 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
})

// Catch PASSWORD_RECOVERY before React mounts (PKCE fires during init)
export let isPasswordRecovery = false
export function clearPasswordRecovery() { isPasswordRecovery = false }
if (isSupabaseConfigured) {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') isPasswordRecovery = true
  })
}
try {
  const h = window.location.hash.substring(1)
  const hp = new URLSearchParams(h)
  if (hp.get('type') === 'recovery') isPasswordRecovery = true
} catch { /* ignore */ }

export const getUser = async () => {
  if (!isSupabaseConfigured) return null
  const { data: { user } } = await supabase.auth.getUser()
  return user
}

/* ── SCHEMA — run this ONCE in Supabase SQL Editor ─────────────────────────

create table shopping_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  household_id text not null,
  name text not null,
  emoji text default '🛒',
  color text default '#00BFA5',
  notes text default '',
  created_at timestamptz default now()
);

create table shopping_items (
  id uuid primary key default gen_random_uuid(),
  list_id uuid references shopping_lists(id) on delete cascade,
  household_id text not null,
  name text not null,
  qty integer default 1,
  unit text default '',
  category text default 'General',
  notes text default '',
  checked boolean default false,
  created_at timestamptz default now()
);

create table tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  household_id text not null,
  title text not null,
  priority text default 'medium',
  due_date date,
  notes text default '',
  assigned_to text,
  done boolean default false,
  done_at timestamptz,
  created_at timestamptz default now(),
  recurrence text default 'none',
  recurrence_interval int default 1,
  recurrence_weekday smallint,
  reminder_enabled boolean default false,
  reminder_time time
);

create table events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  household_id text not null,
  title text not null,
  date date not null,
  time text,
  color text default '#5B6AF0',
  notes text default '',
  created_at timestamptz default now()
);

create table expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  household_id text not null,
  description text not null,
  amount numeric not null,
  category text default 'Other',
  type text default 'expense',
  date date not null,
  created_at timestamptz default now()
);

create table household_members (
  id uuid primary key default gen_random_uuid(),
  household_id text not null,
  user_id uuid references auth.users(id) on delete cascade,
  display_name text,
  role text default 'member',
  joined_at timestamptz default now(),
  unique(household_id, user_id)
);

alter table shopping_lists enable row level security;
alter table shopping_items enable row level security;
alter table tasks enable row level security;
alter table events enable row level security;
alter table expenses enable row level security;
alter table household_members enable row level security;

create policy "household access" on shopping_lists for all using (
  household_id in (select household_id from household_members where user_id = auth.uid())
);
create policy "household access" on shopping_items for all using (
  household_id in (select household_id from household_members where user_id = auth.uid())
);
create policy "household access" on tasks for all using (
  household_id in (select household_id from household_members where user_id = auth.uid())
);
create policy "household access" on events for all using (
  household_id in (select household_id from household_members where user_id = auth.uid())
);
create policy "household access" on expenses for all using (
  household_id in (select household_id from household_members where user_id = auth.uid())
);
create policy "household access" on household_members for all using (
  household_id in (select household_id from household_members where user_id = auth.uid())
);

─────────────────────────────────────────────────────────────────────────── */
