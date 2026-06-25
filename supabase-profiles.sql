-- ════════════════════════════════════════════════════════════════
--  Koott — student matching profiles (Phase 1 of profile matching)
--  Run in Supabase SQL editor. Safe to re-run.
--
--  NOTE: a `public.profiles` table already exists (id, email, full_name,
--  avatar_url) and is READABLE BY ANY AUTHENTICATED USER. We must NOT put
--  matching/consent data there — it would expose every student's field &
--  destination regardless of consent. So the sensitive data lives here, in
--  its own table with strict own-row RLS, and is shared with peers ONLY
--  through discoverable_peers() (opt-in, public fields only).
--
--  Privacy by design:
--   - RLS: a student reads/writes ONLY their own row. No public read.
--   - Discovery is OPT-IN (`discoverable` defaults false).
--   - Peers see only name + avatar + field + destination + stage via
--     discoverable_peers() — never email/phone.
--   - No fake data: every field nullable, stays blank if unknown.
-- ════════════════════════════════════════════════════════════════

create table if not exists public.student_profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  field            text,        -- field-circle id e.g. 'field-it' (maps to a Sabha room)
  field_label      text,        -- human label e.g. 'IT & Software'
  field_text       text,        -- what the student typed, e.g. 'computer science'
  study_level      text,        -- target qualification e.g. 'master'
  destination_city text,        -- slug e.g. 'newcastle' (null until known)
  destination_uni  text,        -- e.g. 'uon' (null until known)
  intake           text,        -- e.g. '2025-feb' (null until known)
  stage            text,        -- deciding | applied | arriving | arrived
  interests        text[] not null default '{}',
  location_pref    text,        -- flexible | regional
  -- consent
  discoverable     boolean not null default false,  -- opt-in: let others find me
  allow_dms        boolean not null default false,  -- opt-in: let matches message me
  consent_at       timestamptz                       -- when discovery was turned on
);

-- keep updated_at fresh
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

drop trigger if exists student_profiles_touch on public.student_profiles;
create trigger student_profiles_touch before update on public.student_profiles
  for each row execute function public.touch_updated_at();

-- ── RLS: own row only (no public read) ──────────────────────────
alter table public.student_profiles enable row level security;

drop policy if exists "sp own read"   on public.student_profiles;
drop policy if exists "sp own insert" on public.student_profiles;
drop policy if exists "sp own update" on public.student_profiles;

create policy "sp own read"   on public.student_profiles
  for select using (auth.uid() = id);
create policy "sp own insert" on public.student_profiles
  for insert with check (auth.uid() = id);
create policy "sp own update" on public.student_profiles
  for update using (auth.uid() = id) with check (auth.uid() = id);

-- ── Privacy-safe peer discovery (Phase 2's matcher builds on this) ──
-- Returns ONLY opted-in students' PUBLIC fields (name/avatar from profiles +
-- field/destination/stage), never the caller, never email. SECURITY DEFINER
-- so it can read across rows while RLS keeps the table locked to own-row.
create or replace function public.discoverable_peers()
returns table (
  id               uuid,
  full_name        text,
  avatar_url       text,
  field            text,
  field_label      text,
  destination_city text,
  destination_uni  text,
  intake           text,
  stage            text,
  interests        text[],
  allow_dms        boolean
)
language sql stable security definer set search_path = public as $$
  select sp.id, p.full_name, p.avatar_url, sp.field, sp.field_label,
         sp.destination_city, sp.destination_uni, sp.intake, sp.stage,
         sp.interests, sp.allow_dms
  from public.student_profiles sp
  left join public.profiles p on p.id = sp.id
  where sp.discoverable = true
    and sp.id <> auth.uid();
$$;

grant execute on function public.discoverable_peers() to authenticated;

create index if not exists student_profiles_discoverable_idx on public.student_profiles (discoverable) where discoverable = true;
create index if not exists student_profiles_field_idx on public.student_profiles (field);
