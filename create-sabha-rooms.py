#!/usr/bin/env python3
"""
Create one Sabha room per Koott community, then print the
community_id -> sabha_room_id map to paste into koott-config.js (SABHA_ROOMS).

Sabha rooms have integer ids (no slugs) and the bot API only accepts
{name, type}, so we create rooms by name and capture the returned ids.
Re-running is safe: existing rooms (matched by name) are reused, not duplicated.

USAGE (fill in the bot key from Sabha → admin → bots → "Copy bot key"):

  SABHA_HOST=https://chat.koott.live \
  SABHA_BOT_KEY=12-aBcdEf123456 \
  SUPABASE_URL=https://pahgngtyfeletfpbavhf.supabase.co \
  SUPABASE_KEY=sb_publishable_lEcUmg-6b0tOdFe2c2JaCA_IzqzOBlb \
  python3 create-sabha-rooms.py

Requires only Python 3 (standard library). No pip installs.
"""
import json
import os
import sys
import urllib.request
import urllib.error

SABHA_HOST = os.environ.get("SABHA_HOST", "").rstrip("/")
BOT_KEY = os.environ.get("SABHA_BOT_KEY", "")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "").rstrip("/")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY", "")
ROOM_TYPE = os.environ.get("SABHA_ROOM_TYPE", "open")  # open = everyone auto-joins

def die(msg):
    print("ERROR: " + msg, file=sys.stderr)
    sys.exit(1)

for name, val in [("SABHA_HOST", SABHA_HOST), ("SABHA_BOT_KEY", BOT_KEY),
                  ("SUPABASE_URL", SUPABASE_URL), ("SUPABASE_KEY", SUPABASE_KEY)]:
    if not val:
        die("missing env var %s (see the usage comment at the top of this file)" % name)

def request(url, method="GET", headers=None, body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, method=method, headers=headers or {})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            raw = r.read().decode()
            return r.status, (json.loads(raw) if raw.strip() else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw
    except urllib.error.URLError as e:
        die("could not reach %s — %s" % (url, e))

# 1. Pull the real community list from Supabase.
print("Fetching communities from Supabase…", file=sys.stderr)
status, communities = request(
    SUPABASE_URL + "/rest/v1/communities?select=id,name,cat&order=sort",
    headers={"apikey": SUPABASE_KEY, "authorization": "Bearer " + SUPABASE_KEY},
)
if status != 200 or not isinstance(communities, list):
    die("Supabase returned %s: %s" % (status, communities))
if not communities:
    die("no communities found — run supabase-interest-circles.sql / your seed first")
print("  found %d communities" % len(communities), file=sys.stderr)

bot_headers = {"authorization": "Bearer " + BOT_KEY, "content-type": "application/json"}

# 2. List rooms the bot can already see, so re-runs don't duplicate.
status, existing = request(SABHA_HOST + "/api/bots/rooms", headers=bot_headers)
if status == 403:
    die("Sabha rejected the bot key (403). Check SABHA_BOT_KEY is the full '<id>-<token>' value.")
if status != 200 or not isinstance(existing, list):
    # Any other failure (401/500/HTML error) must halt — otherwise dedup is
    # skipped and a re-run would create a full duplicate set of rooms.
    die("could not list existing Sabha rooms (%s): %s" % (status, existing))
existing_by_name = {}
if isinstance(existing, list):
    for room in existing:
        if isinstance(room, dict) and room.get("name"):
            existing_by_name[room["name"].strip().lower()] = room.get("id")
print("  %d rooms already exist in Sabha" % len(existing_by_name), file=sys.stderr)

# 3. Create a room per community (reuse if a room with the same name exists).
mapping = {}
created, reused, failed = 0, 0, 0
for c in communities:
    cid, cname = c.get("id"), (c.get("name") or "").strip()
    if not cid or not cname:
        continue
    key = cname.lower()
    if key in existing_by_name and existing_by_name[key]:
        mapping[cid] = existing_by_name[key]
        reused += 1
        print("  ~ reused  %-18s -> room %s (%s)" % (cid, existing_by_name[key], cname), file=sys.stderr)
        continue
    status, room = request(
        SABHA_HOST + "/api/bots/rooms", method="POST",
        headers=bot_headers, body={"name": cname, "type": ROOM_TYPE},
    )
    if status in (200, 201) and isinstance(room, dict) and room.get("id"):
        mapping[cid] = room["id"]
        existing_by_name[key] = room["id"]
        created += 1
        print("  + created %-18s -> room %s (%s)" % (cid, room["id"], cname), file=sys.stderr)
    else:
        failed += 1
        print("  ! FAILED  %-18s (%s): %s %s" % (cid, cname, status, room), file=sys.stderr)

print("\nDone: %d created, %d reused, %d failed.\n" % (created, reused, failed), file=sys.stderr)

# 4. Print the map for koott-config.js (stdout only — easy to copy/redirect).
print("Paste this as SABHA_ROOMS in koott-config.js:\n", file=sys.stderr)
print(json.dumps(mapping, indent=2, ensure_ascii=False))
