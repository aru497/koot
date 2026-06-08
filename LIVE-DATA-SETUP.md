# Koott — Live Data Setup

This wires the **Course Advisor** and **Communities search** to live Supabase tables, with a
server-side function that refreshes the data from **real Australian government sources**.

## What changed

Before, the advisor's occupations/universities and the community list were hardcoded arrays in
the HTML. Now they live in Supabase and the pages query them in real time.

**Four tables** (created by `supabase-data.sql`):

| Table | Holds | Real source |
|---|---|---|
| `occupations` | Skills shortage roles, ANZSCO, keywords, growth, jobs | Jobs & Skills Australia — Skills Priority List |
| `salaries` | Min/median/max salary per occupation | ABS Employee Earnings / LMIP |
| `courses` | CRICOS universities, fees, IELTS, QS rank, regional flag | CRICOS register |
| `communities` | City / university / stage chat communities | Koott's own list |

All four are **public-read** (so the advisor works with no login) and **write-protected** — only
the Edge Function (service role) can change them, never the browser.

## Why a server-side sync (and not direct API calls from the page)

A static site **can't** reliably call these gov sources from the browser:

- **ABS** requires an API key you apply for by email — can't be exposed in client code.
- **data.gov.au** calls from a browser are usually blocked by **CORS**.
- **CRICOS** has no clean public live API.

So the real pattern is: a Supabase **Edge Function** fetches the data server-side (no CORS, key
stays secret) and writes it into the tables; the site just reads Supabase. That's what
`supabase/functions/sync-gov-data/` does.

---

## Step 1 — Create the tables + seed data

Supabase → **SQL Editor** → New query → paste all of **`supabase-data.sql`** → **Run**.
(Run `supabase-schema.sql` first if you haven't — it creates the auth/chat tables.)

This seeds the four tables with the real gov-sourced values already in the app, so the advisor and
community search work **immediately**. The sync function below keeps them fresh.

## Step 2 — Deploy the sync function

You need the Supabase CLI (`npm i -g supabase`, or `brew install supabase/tap/supabase`).

```bash
cd Koott
supabase login
supabase functions deploy sync-gov-data --project-ref pahgngtyfeletfpbavhf
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically. Then set the extra
secrets:

```bash
# the data.gov.au resource id for the Skills Priority List table (see Step 3)
supabase secrets set SPL_RESOURCE_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx --project-ref pahgngtyfeletfpbavhf
# a random string so only you can trigger the function
supabase secrets set SYNC_SECRET=$(openssl rand -hex 16) --project-ref pahgngtyfeletfpbavhf
```

(Don't have the CLI? You can also paste `index.ts` into Supabase Dashboard → **Edge Functions** →
Create function, and set the same secrets under the function's settings.)

## Step 3 — Find the Skills Priority List resource id

1. Go to https://data.gov.au and search **"Skills Priority List"**.
2. Open the current dataset from **Jobs and Skills Australia**, click the occupation-list resource
   (CSV), and copy its **Resource ID** (a UUID shown on the resource page / in the API snippet).
3. That's the value for `SPL_RESOURCE_ID` above.

The function matches gov rows to your occupations by **ANZSCO code** and updates the shortage
status — it never deletes your curated keywords/courses. Column names vary between dataset
versions; the function already tries the common ones and skips anything it can't map.

## Step 4 — Run it, and schedule it

Trigger once to confirm it works:

```bash
curl -s -X POST \
  "https://pahgngtyfeletfpbavhf.supabase.co/functions/v1/sync-gov-data" \
  -H "x-sync-secret: YOUR_SYNC_SECRET"
```

You'll get back JSON like `{"ok":true,"results":[{"source":"SkillsPriorityList","records":456,"updated":16}]}`.

**Schedule weekly** — Supabase Dashboard → **Edge Functions → sync-gov-data → Cron** (or use
`pg_cron`), e.g. `0 6 * * 1` (Mondays 6am). Add the `x-sync-secret` header in the schedule config.

## Optional — ABS salaries

To pull live salaries: request an ABS Data API key (https://www.abs.gov.au → Data API), then set
`ABS_API_KEY` and `ABS_DATAFLOW` secrets and complete the mapping in `syncAbsSalaries()` (the
function has the call stubbed with guidance). Until then, `salaries` uses the seeded values.

---

## How the pages use it

- **`advisor.html`** → on load, `loadGovData()` fetches `occupations` + `salaries` + `courses` in
  one go; the keyword search and course matching run on that live data. If Supabase is unreachable
  it shows a clear "couldn't reach the live database" message instead of broken results.
- **`communities.html`** → `loadCommunities()` populates the list from the `communities` table; the
  search box queries it live (`ilike`, debounced) on every keystroke.
