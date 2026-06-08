-- ═══════════════════════════════════════════════════════════════
--  Koott — Supabase schema (profiles · memberships · messages)
--  Run this ONCE in Supabase Dashboard → SQL Editor → New query.
--  Safe to re-run: everything is guarded with IF NOT EXISTS / OR REPLACE.
-- ═══════════════════════════════════════════════════════════════

-- ── 1. PROFILES ────────────────────────────────────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  full_name   text,
  avatar_url  text,
  created_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

drop policy if exists "profiles readable by authenticated" on public.profiles;
create policy "profiles readable by authenticated"
  on public.profiles for select
  to authenticated using (true);

drop policy if exists "users update own profile" on public.profiles;
create policy "users update own profile"
  on public.profiles for update
  to authenticated using (auth.uid() = id);

-- Auto-create a profile row whenever someone signs up (e.g. via Google).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name'),
    coalesce(new.raw_user_meta_data->>'avatar_url', new.raw_user_meta_data->>'picture')
  )
  on conflict (id) do update
    set email = excluded.email,
        full_name = excluded.full_name,
        avatar_url = excluded.avatar_url;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── 2. MEMBERSHIPS (which communities a user joined) ───────────
create table if not exists public.memberships (
  user_id      uuid not null references auth.users(id) on delete cascade,
  community_id text not null,
  created_at   timestamptz not null default now(),
  primary key (user_id, community_id)
);

alter table public.memberships enable row level security;

drop policy if exists "read own memberships" on public.memberships;
create policy "read own memberships"
  on public.memberships for select
  to authenticated using (auth.uid() = user_id);

drop policy if exists "join communities" on public.memberships;
create policy "join communities"
  on public.memberships for insert
  to authenticated with check (auth.uid() = user_id);

drop policy if exists "leave communities" on public.memberships;
create policy "leave communities"
  on public.memberships for delete
  to authenticated using (auth.uid() = user_id);

-- ── 3. MESSAGES ────────────────────────────────────────────────
create table if not exists public.messages (
  id           bigint generated always as identity primary key,
  community_id text not null,
  channel_id   text not null,
  channel_key  text generated always as (community_id || '__' || channel_id) stored,
  user_id      uuid references auth.users(id) on delete set null,
  author_name  text not null,
  body         text not null,
  reactions    jsonb not null default '[]'::jsonb,  -- read-only display (e.g. seeded/admin posts)
  created_at   timestamptz not null default now()
);

create index if not exists messages_channel_key_idx
  on public.messages (channel_key, created_at);

alter table public.messages enable row level security;

-- Any signed-in user can read messages (communities are public to members).
drop policy if exists "read messages" on public.messages;
create policy "read messages"
  on public.messages for select
  to authenticated using (true);

-- You can only post as yourself, and only in a community you've joined.
drop policy if exists "post messages" on public.messages;
create policy "post messages"
  on public.messages for insert
  to authenticated with check (
    auth.uid() = user_id
    and exists (
      select 1 from public.memberships m
      where m.user_id = auth.uid()
        and m.community_id = messages.community_id
    )
  );

-- ── 4. REALTIME ────────────────────────────────────────────────
-- Stream new messages to the browser. Ignores the "already a member"
-- error if you run this twice.
do $$
begin
  alter publication supabase_realtime add table public.messages;
exception
  when duplicate_object then null;
end $$;

-- ── 5. OPTIONAL SEED MESSAGES (welcome / demo content) ─────────
-- These run as the SQL owner (bypassing RLS), so user_id stays NULL.
-- Delete this block if you want every channel to start empty.
insert into public.messages (community_id, channel_id, author_name, body, reactions, created_at) values
  ('sydney','general','Admin 📣','Welcome to Sydney Students! Introduce yourself and let us know your intake. 🎉','[{"e":"🎉","n":8},{"e":"👋","n":5}]', now() - interval '2 hours'),
  ('sydney','general','Admin 📣','Tip: grab your Opal card at the 7-Eleven in the airport arrivals hall before you leave.','[{"e":"💡","n":12}]', now() - interval '1 hour'),
  ('deciding','general','Admin 📣','Still choosing a city or uni? Ask anything — regional 485 visa, costs, jobs near campus.','[{"e":"🤔","n":6}]', now() - interval '1 day'),
  ('housing','general','Admin 📣','Post rooms as: price · location · move-in date. No agents. Members only.','[]', now() - interval '2 days')
on conflict do nothing;
