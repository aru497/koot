-- ════════════════════════════════════════════════════════════════
--  Koott — AI advisor agent · leads · WhatsApp groups · admin
--  Run AFTER supabase-schema.sql and supabase-data.sql. Safe to re-run.
-- ════════════════════════════════════════════════════════════════

-- ── ADMINS ──────────────────────────────────────────────────────
-- Whoever's email is in here can see leads and approve WhatsApp groups.
create table if not exists public.admins (
  email      text primary key,
  created_at timestamptz not null default now()
);

-- ⬇️ CHANGE THIS to the Google email you sign in to Koott with.
insert into public.admins (email) values ('designcore777@gmail.com')
on conflict (email) do nothing;

-- Helper: is the currently signed-in user an admin?
create or replace function public.is_admin()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.admins a
    where lower(a.email) = lower(auth.jwt() ->> 'email')
  );
$$;

-- ── LEADS (email capture + what they want to study) ─────────────
create table if not exists public.leads (
  id                bigint generated always as identity primary key,
  email             text not null,
  study_interest    text,          -- their free-text answer
  region            text,          -- where they're from
  matched_title     text,          -- occupation the agent matched
  matched_occupation_id text,
  no_clear_interest boolean default false,
  user_id           uuid references auth.users(id) on delete set null,
  source            text default 'advisor',
  created_at        timestamptz not null default now()
);
create index if not exists leads_created_idx on public.leads (created_at desc);

alter table public.leads enable row level security;
-- Leads can be captured by the advisor-agent Edge Function (service role) OR,
-- if the function isn't deployed yet, directly from the browser (email gate).
-- Inserts are write-only for the public; only admins can READ leads back.
drop policy if exists "capture a lead" on public.leads;
create policy "capture a lead"
  on public.leads for insert to anon, authenticated
  with check (true);

drop policy if exists "admin reads leads" on public.leads;
create policy "admin reads leads"
  on public.leads for select to authenticated
  using (public.is_admin());

-- ── WHATSAPP GROUPS (user-submitted, admin-approved) ────────────
create table if not exists public.whatsapp_groups (
  id                  bigint generated always as identity primary key,
  community_id        text,        -- which region/community it belongs to
  title               text not null,
  invite_url          text not null,
  description         text,
  submitted_by_email  text,
  submitted_by        uuid references auth.users(id) on delete set null,
  status              text not null default 'pending',  -- pending | approved | rejected
  created_at          timestamptz not null default now(),
  reviewed_at         timestamptz
);
create index if not exists wa_status_idx on public.whatsapp_groups (status, community_id);

alter table public.whatsapp_groups enable row level security;

-- Signed-in users can submit a group (as themselves).
drop policy if exists "submit whatsapp group" on public.whatsapp_groups;
create policy "submit whatsapp group"
  on public.whatsapp_groups for insert to authenticated
  with check (auth.uid() = submitted_by);

-- Anyone can see APPROVED groups; admins can see everything (incl. pending).
drop policy if exists "read approved or admin" on public.whatsapp_groups;
create policy "read approved or admin"
  on public.whatsapp_groups for select to anon, authenticated
  using (status = 'approved' or public.is_admin());

-- Only admins can approve / reject (update status).
drop policy if exists "admin updates groups" on public.whatsapp_groups;
create policy "admin updates groups"
  on public.whatsapp_groups for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- Let admins delete spam submissions.
drop policy if exists "admin deletes groups" on public.whatsapp_groups;
create policy "admin deletes groups"
  on public.whatsapp_groups for delete to authenticated
  using (public.is_admin());
