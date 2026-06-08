# Koott — Setup & Deploy

Your site is now wired to **Supabase** (Postgres + Auth + Realtime). Communities chat
is real and live; Google sign-in is real. The four pages stay static and deploy to **Vercel**.

Your project is already filled in (`koott-config.js`):

- Project URL: `https://pahgngtyfeletfpbavhf.supabase.co`
- Publishable key: `sb_publishable_…` (safe to ship — Row Level Security protects the data)

There are exactly **4 setup steps**. Do them in order.

---

## 1. Create the database tables

Supabase Dashboard → **SQL Editor** → **New query** → paste the entire contents of
[`supabase-schema.sql`](./supabase-schema.sql) → **Run**.

This creates `profiles`, `memberships`, `messages`, the row-level-security policies, the
realtime publication, and a few welcome messages. It's safe to re-run.

Then run [`supabase-data.sql`](./supabase-data.sql) the same way — it creates the live
`occupations`, `salaries`, `courses`, and `communities` tables that power the **Course Advisor**
and **Communities search**, seeded with the real gov-sourced data. Full details (and the optional
server-side gov-data sync function) are in **[`LIVE-DATA-SETUP.md`](./LIVE-DATA-SETUP.md)**.

---

## 2. Turn on Google sign-in

You need a Google OAuth client, then paste it into Supabase.

**a) Google Cloud Console** (https://console.cloud.google.com) → APIs & Services →
**Credentials** → Create Credentials → **OAuth client ID** → *Web application*.

- **Authorized JavaScript origins:** add `http://localhost:5173` and your Vercel URL
  (e.g. `https://koott.vercel.app`) once you have it.
- **Authorized redirect URI:** add this exact Supabase callback:

  ```
  https://pahgngtyfeletfpbavhf.supabase.co/auth/v1/callback
  ```

  Copy the **Client ID** and **Client secret**.

**b) Supabase Dashboard** → **Authentication** → **Sign In / Providers** → **Google** →
enable it, paste the Client ID and Client secret → **Save**.

---

## 3. Tell Supabase where your site lives

Supabase Dashboard → **Authentication** → **URL Configuration**:

- **Site URL:** `http://localhost:5173` (for now; switch to your Vercel URL after deploy)
- **Redirect URLs:** add both of these (the `/**` wildcard covers every page):

  ```
  http://localhost:5173/**
  https://YOUR-APP.vercel.app/**
  ```

Sign-in returns the user to whatever page they clicked "Sign in" on, so the wildcard matters.

---

## 4. Test locally, then deploy

**Run it locally** (any static server works):

```bash
cd Koott
python3 -m http.server 5173
# open http://localhost:5173
```

Click **Sign in with Google** on the Communities page. After signing in you should see your
name + avatar in the nav, be able to **join** a community, and **send a message** that appears
instantly. Open a second browser to watch messages arrive live.

### Deploy to Vercel

There are no build steps and no environment variables to set — it's a static site, and the
Supabase URL + publishable key live in `koott-config.js` (which is safe to ship). Pick **one**
of the two routes below.

#### Route A — Command line (fastest)

1. **Install the CLI** (needs Node.js installed first):

   ```bash
   npm i -g vercel
   ```

2. **Log in** (opens your browser to confirm):

   ```bash
   vercel login
   ```

3. **Deploy a preview** from inside the project folder:

   ```bash
   cd Koott
   vercel
   ```

   First run asks a few questions — accept the defaults:
   - *Set up and deploy?* → **Y**
   - *Which scope?* → your account
   - *Link to existing project?* → **N**
   - *Project name?* → `koott` (or anything)
   - *In which directory is your code?* → `.` (just press Enter)
   - *Modify settings?* → **N**

   It prints a preview URL like `https://koott-abc123.vercel.app`.

4. **Promote to production:**

   ```bash
   vercel --prod
   ```

   This prints your real URL, e.g. `https://koott.vercel.app`. **Copy it.**

#### Route B — Import from GitHub

The Vercel "New Project" screen only offers **Import Git Repository** (or v0) — there's no
drag-a-folder option anymore. So this route needs the project on GitHub first.

1. Create a new GitHub repo (e.g. `koott`) and push this folder to it:

   ```bash
   cd Koott
   git init
   git add .
   git commit -m "Koott site"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/koott.git
   git push -u origin main
   ```

2. In Vercel → **Add New… → Project**, your `koott` repo now appears under **Import Git
   Repository** → click **Import**.
3. Framework Preset **Other**, no build command, no env vars → **Deploy**. You get a
   `https://YOUR-APP.vercel.app` URL. **Copy it.** Every future `git push` redeploys automatically.

If you don't want to deal with Git, use **Route A (CLI)** above — it's the simpler path.

#### After you have the production URL (REQUIRED — sign-in won't work until you do this)

Go back into the two consoles and add your new `https://YOUR-APP.vercel.app` URL:

1. **Google Cloud Console** → Credentials → your OAuth client → add
   `https://YOUR-APP.vercel.app` under **Authorized JavaScript origins** → Save.
2. **Supabase** → Authentication → **URL Configuration**:
   - **Site URL** → `https://YOUR-APP.vercel.app`
   - **Redirect URLs** → add `https://YOUR-APP.vercel.app/**` → Save.

Wait ~1 minute for Google to propagate, then open your live site and test **Sign in with
Google**. Done — real auth and real-time chat, live on the internet.

> **Redeploying later:** Route A → run `vercel --prod` again. Route B with Git → just
> `git push`. Route B with drag-and-drop → re-upload the folder. Your URL stays the same, so
> you don't need to touch Google/Supabase again.

---

## How it's built

| Piece | Where |
|---|---|
| Supabase URL + key (the only config) | `koott-config.js` |
| Google sign-in / session / nav | `koott-auth.js` (`window.koottAuth`) |
| Database schema + security rules | `supabase-schema.sql` |
| Real-time community chat | `communities.html` |
| Static pages | `index.html`, `advisor.html`, `tools.html` |
| Vercel settings | `vercel.json` |

**Security:** the publishable key is meant to live in the browser. All access is gated by
Row Level Security — users can only read messages, post as themselves, and only in communities
they've joined. Never add a `sb_secret_…` key to these files.

## Notes & next steps

- **Communities & channels** are a fixed list in `communities.html` (`COMMS` / `CHANNELS`).
  Messages, memberships, and profiles are the live data in Postgres.
- **Reactions** are display-only right now (shown on seeded/welcome posts). Making them
  clickable would need a `reactions` table + toggle logic — easy to add later.
- **Member counts** shown per community are still the original static numbers; wire them to
  `count(*)` on `memberships` if you want them live.
