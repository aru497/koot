-- ════════════════════════════════════════════════════════════════
--  Koott — Interest circles (connect students by course/field)
--  Run AFTER supabase-schema.sql, supabase-data.sql, supabase-agent.sql.
--  Safe to re-run.
--
--  Adds per-field community "circles" so the AI advisor can drop a
--  matched student straight into a room with others exploring the
--  same course/field. The advisor maps an occupation's category
--  (IT, Healthcare, …) to one of these circle ids.
--
--  NOTE: live chat for every community now happens in Sabha (see
--  SABHA-SETUP.md), not in Koott's own `messages` table. These rows
--  exist only so the circle appears in the communities directory and
--  so create-sabha-rooms.py can create a matching Sabha room. We do
--  NOT seed any messages — new rooms start genuinely empty.
-- ════════════════════════════════════════════════════════════════

-- ── 1. The interest circles (cat = 'field') ─────────────────────
-- members starts at 0 on purpose — we never seed fake counts.
insert into public.communities (id, cat, icon, name, members, sort) values
  ('field-it',       'field','💻','IT & Software',            0, 30),
  ('field-health',   'field','🏥','Healthcare & Nursing',     0, 31),
  ('field-eng',      'field','⚙️','Engineering',              0, 32),
  ('field-biz',      'field','📊','Business & Commerce',       0, 33),
  ('field-edu',      'field','📚','Education & Teaching',      0, 34),
  ('field-social',   'field','🤝','Social Work & Community',   0, 35),
  ('field-creative', 'field','🎨','Creative & Design',         0, 36),
  ('field-science',  'field','🔬','Science & Research',        0, 37),
  ('field-agri',     'field','🌿','Agriculture & Environment', 0, 38),
  ('field-hosp',     'field','🍽️','Hospitality & Tourism',     0, 39)
on conflict (id) do update
  set cat = excluded.cat, icon = excluded.icon, name = excluded.name, sort = excluded.sort;

-- ── 2. Honest social proof: how many leads matched into a field ──
-- leads is admin-read-only, so expose just an aggregate count via a
-- SECURITY DEFINER function. Maps an occupation category -> count of
-- leads whose matched occupation is in that category.
create or replace function public.field_interest_count(p_cat text)
returns int
language sql stable security definer set search_path = public
as $$
  select count(*)::int
  from public.leads l
  join public.occupations o on o.id = l.matched_occupation_id
  where o.cat = p_cat;
$$;

grant execute on function public.field_interest_count(text) to anon, authenticated;
