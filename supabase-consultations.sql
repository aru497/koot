-- ════════════════════════════════════════════════════════════════
--  Koott — 1:1 consultation requests
--  Run in Supabase Dashboard → SQL Editor. Safe to re-run.
--
--  A student fills the "Book a free 1:1 call" form (koott-consult.js).
--  The browser calls the `book-consultation` Edge Function, which inserts
--  here with the service-role key (bypassing RLS) and emails you.
--
--  No fake data: every column except id/created_at/status is nullable and
--  stays NULL/blank when the student leaves a field empty.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.consultations (
  id             bigint generated always as identity primary key,
  created_at     timestamptz not null default now(),
  name           text,
  email          text,
  phone          text,
  study_level    text,        -- e.g. Undergraduate / Postgraduate / Not decided
  field_interest text,        -- free text: what they want to study
  message        text,        -- what they need help with
  preferred_time text,        -- when they'd like to be contacted
  source_page    text,        -- which koott page the request came from
  user_id        uuid,        -- Supabase auth user id if signed in, else NULL
  status         text not null default 'new'  -- new / contacted / closed
);

create index if not exists consultations_created_idx on public.consultations (created_at desc);
create index if not exists consultations_status_idx  on public.consultations (status);

-- RLS ON with NO public policies: the browser never reads/writes this table
-- directly. Only the Edge Function (service-role key) inserts, and only you
-- (dashboard / service role) read. anon + authenticated get nothing.
alter table public.consultations enable row level security;

-- Make sure the anon/authenticated roles can't touch it via PostgREST.
revoke all on public.consultations from anon, authenticated;
