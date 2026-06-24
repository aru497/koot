# Koott × Sabha — go-live runbook

Everything in code is done. These are the steps only you can run (they need
your Sabha server, your Supabase token, and admin clicks). Do them **in order** —
each unlocks the next.

Key facts that shaped this (verified against Sabha's source):
- Sabha rooms are **integer ids** (`/rooms/3`), there are **no slugs** — so we
  create rooms, capture their ids, and store a `community_id → room_id` map.
- Re-skinning is done by pasting **custom CSS** in Sabha's admin.
- The **first SSO login becomes admin** only if `AUTO_BOOTSTRAP=true` is set.

---

## 1. Deploy the SSO Edge Function (Supabase)

On your Mac, from the repo, with your Supabase token (`sbp_…`):

```bash
cd ~/Documents/Claude/Projects/Koott

# Secrets the function needs. SABHA_SSO_SECRET MUST equal SSO_SECRET in Sabha's .env
# (copy it from the droplet: `grep ^SSO_SECRET= ~/.env` on the server).
SUPABASE_ACCESS_TOKEN=sbp_… ~/.local/bin/supabase secrets set \
  SABHA_SSO_SECRET=<paste-your-SSO_SECRET-here> \
  SABHA_HOST=https://chat.koott.live \
  KOOTT_HOST=https://koott.live \
  --project-ref pahgngtyfeletfpbavhf

SUPABASE_ACCESS_TOKEN=sbp_… ~/.local/bin/supabase functions deploy sabha-sso \
  --project-ref pahgngtyfeletfpbavhf --no-verify-jwt
```

---

## 2. Turn on SSO admin bootstrap (Sabha server)

SSH to the droplet (`ssh root@170.64.162.238`), then:

```bash
cd ~
# Add the one missing line so your first SSO login becomes the admin.
grep -q '^AUTO_BOOTSTRAP=' .env || echo 'AUTO_BOOTSTRAP=true' >> .env
docker compose up -d --force-recreate
```

Your `.env` already has `AUTH_METHOD=sso`, `SSO_PROVIDER_URL=https://koott.live/sso.html`,
and the matching `SSO_SECRET`, so nothing else changes here.

---

## 3. Ship koott.live

`koott-config.js` now points `SABHA_HOST` at `https://chat.koott.live`. Commit and
push so Vercel deploys (the SSO bridge `sso.html` must be live for step 4):

```bash
git add -A && git commit -m "Sabha chat integration + 1:1 consultations" && git push
```

---

## 4. Become admin & create the rooms

1. Sign in to **koott.live** with Google (so you have a Koott session).
2. Visit **https://chat.koott.live** → it redirects through SSO and logs you in.
   Because of `AUTO_BOOTSTRAP`, **this first login makes you the Sabha admin.**
3. In Sabha, create a bot: **account/admin → Bots → New**, then copy its **bot key**
   (looks like `12-aBcd1234EfGh`).
4. Back on your Mac, create one room per community and get the id map:

```bash
cd ~/Documents/Claude/Projects/Koott
SABHA_HOST=https://chat.koott.live \
SABHA_BOT_KEY=PASTE-BOT-KEY-HERE \
SUPABASE_URL=https://pahgngtyfeletfpbavhf.supabase.co \
SUPABASE_KEY=sb_publishable_lEcUmg-6b0tOdFe2c2JaCA_IzqzOBlb \
python3 create-sabha-rooms.py
```

It prints a JSON map. Paste it into `koott-config.js` as `SABHA_ROOMS`, e.g.:

```js
SABHA_ROOMS: { "field-it": 3, "syd": 4, "monash": 5, "feb-intake": 6 },
```

Then `git commit -am "map Sabha rooms" && git push`. Now every community
deep-links into its Sabha room.

---

## 5. Re-skin Sabha to look like Koott

In Sabha as admin, go to **`/accounts/custom_styles/edit`** and paste the entire
contents of **`koott-sabha-theme.css`**, then save. Also upload `koott-mark.svg`
(exported as PNG) at **`/accounts/edit`** for the logo.

> If the Inter font doesn't load, Sabha's content-security-policy is blocking
> Google Fonts — the theme still works, it just falls back to the system font.

---

## 6. 1:1 consultations (email you each request)

1. **SQL**: paste `supabase-consultations.sql` into Supabase → SQL Editor → Run.
2. **Resend key**: sign up free at resend.com, create an API key (`re_…`). This is
   the same `RESEND_API_KEY` Sabha wants too.
3. **Secrets + deploy**:

```bash
SUPABASE_ACCESS_TOKEN=sbp_… ~/.local/bin/supabase secrets set \
  RESEND_API_KEY=re_… \
  CONSULT_TO_EMAIL=aru497@gmail.com \
  --project-ref pahgngtyfeletfpbavhf

SUPABASE_ACCESS_TOKEN=sbp_… ~/.local/bin/supabase functions deploy book-consultation \
  --project-ref pahgngtyfeletfpbavhf --no-verify-jwt
```

The floating **"Free 1:1 call"** button is already on every page. Submissions are
saved to the `consultations` table **and** emailed to you.

> Resend note: until you verify the koott.live domain in Resend, emails send from
> `onboarding@resend.dev` and Resend only delivers them to **your own Resend
> account email**. Verify the domain (add the DNS records Resend gives you) to send
> from `hello@koott.live` and to any address. The request is always saved either way.

---

## Security note

The `SSO_SECRET` was shown on screen during setup. It only signs the Koott↔Sabha
handshake (low stakes), but to rotate it later: generate a new one
(`openssl rand -hex 32`), update **both** Sabha's `.env` (`SSO_SECRET`) and the
Supabase secret (`SABHA_SSO_SECRET`), then restart Sabha + redeploy `sabha-sso`.
