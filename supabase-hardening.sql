-- ════════════════════════════════════════════════════════════════
--  Koott — security hardening: rate limiting + leads lockdown
--  Run AFTER supabase-agent.sql. Idempotent — safe to re-run.
--  Addresses the 2026-06-26 audit: advisor denial-of-wallet,
--  Resend exhaustion, and the anon-floodable leads table.
-- ════════════════════════════════════════════════════════════════

-- ── Generic fixed-window rate limiter ───────────────────────────
-- One row per bucket. An atomic upsert increments hits within the
-- current window, or resets to 1 once the window has elapsed.
-- Returns TRUE when the call is allowed (hits <= max), FALSE when over.
create table if not exists public.rate_limits (
  bucket       text primary key,
  window_start timestamptz not null default now(),
  hits         integer     not null default 0
);
-- RLS on, no policies ⇒ unreachable via PostgREST; only the
-- service role (which bypasses RLS) and the definer function touch it.
alter table public.rate_limits enable row level security;

create or replace function public.hit_rate_limit(
  p_bucket text, p_max integer, p_window_secs integer
) returns boolean
language plpgsql
security definer set search_path = public
as $$
declare
  v_now  timestamptz := now();
  v_hits integer;
begin
  insert into public.rate_limits as rl (bucket, window_start, hits)
    values (p_bucket, v_now, 1)
  on conflict (bucket) do update
    set hits = case when rl.window_start < v_now - make_interval(secs => p_window_secs)
                    then 1 else rl.hits + 1 end,
        window_start = case when rl.window_start < v_now - make_interval(secs => p_window_secs)
                    then v_now else rl.window_start end
  returning rl.hits into v_hits;
  return v_hits <= p_max;
end;
$$;

-- Only the Edge Functions (service role) may call it — never anon/authenticated.
revoke all on function public.hit_rate_limit(text, integer, integer) from public;
revoke all on function public.hit_rate_limit(text, integer, integer) from anon, authenticated;
grant execute on function public.hit_rate_limit(text, integer, integer) to service_role;

-- Optional housekeeping: prune stale buckets (run from pg_cron if available).
-- delete from public.rate_limits where window_start < now() - interval '2 days';

-- ── Lock down LEADS ─────────────────────────────────────────────
-- Remove the anon/authenticated direct-INSERT path (the PostgREST flood
-- vector). The advisor-agent Edge Function writes leads with the service
-- role, which bypasses RLS, so capture is unaffected. Admin SELECT stays.
drop policy if exists "capture a lead" on public.leads;
