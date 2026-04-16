-- Global cache of shopping-item name → category decisions, populated by the
-- `categorize-item` Edge Function (Groq fallback).
--
-- The table is GLOBAL, not per-household — shopping vocabulary is universal
-- ("חלב" → Dairy is true for everyone), so sharing the cache cuts down on
-- AI calls dramatically across users.
--
-- Clients NEVER read or write this table directly. Access is restricted to
-- service_role (used by the Edge Function) via no-policy RLS.

create table if not exists shopping_item_categories (
  normalized_name text primary key,
  category        text        not null,
  source          text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

alter table shopping_item_categories enable row level security;
