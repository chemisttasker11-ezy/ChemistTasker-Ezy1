# AHPRA desktop verification: staging deployment handover

This file is for a Claude Code session on the staging server. It assumes no
other context. Work through the steps in order. Each step ends with a done
check. Stop and ask the owner when a step says so or a check fails.

Never print, paste or commit a token, a real AHPRA registration number or
personal data. Show values only as lengths or yes/no.

## 1. What this release is

Public-platform pharmacists, interns and pharmacy owners are checked against
the AHPRA public register from a desktop PC that the owner runs. A Chrome
extension on that desktop is the primary verifier. A Python bridge on the same
desktop, which drives a Claude Code session, is the fallback and also repairs
the extension when it breaks. Both connect to
`wss://staging.chemisttasker.com.au/ws/ahpra-verifier/` with one shared token.
The server stores only the token's SHA-256 hash. Members of pharmacies or
organisations never need AHPRA. The release adds three additive migrations:
`client_profile` 0081, 0082, 0083 and 0084.

## 2. Owner decisions (already made, do not reopen)

- Staging holds test accounts only, so real emails are fine.
- The admin email is `Admin@chemisttasker.com.au`.
- ScrapingBee AHPRA lookups are paused on staging and stay paused. Checks
  queued under ScrapingBee are ignored.
- A plain token stored on the desktop is accepted for staging.
- Which code to deploy (the branch or `main`) is the owner's call. Ask if you
  were not told.

Note: `docs/STAGING_PREVIEW.md` says the staging database once held copied
production users and that staging sends real SMTP email. The owner says it
now holds test accounts only. If you see real-looking users, tell the owner
before you continue.

## 3. Ground rules on this server

- Checkout: `/opt/apps/chemisttasker-staging`. Env files:
  `/opt/apps/chemisttasker-staging/env/` (directory `0700`, files `0600`).
- Run every command below from `/opt/apps/chemisttasker-staging`.
- Deploy only with `bash scripts/deploy-staging.sh` (workers start by default).
  Never use `--frontend-only` for this release: it has backend code and
  migrations.
- The deploy script backs up the database first, to
  `/opt/backups/chemisttasker/staging-predeploy-*.dump`, and prints
  `DB_BACKUP=<path>`.
- Write deployment notes to `/opt/apps/chemisttasker-staging-ops/`.
- Define this helper in your shell. It is the same Compose call the deploy
  script uses:

```bash
compose() {
  docker compose \
    --env-file env/staging.secrets.env \
    --env-file env/staging.runtime.env \
    --env-file env/staging.integrations.env \
    --env-file env/staging.web.env \
    -f docker-compose.staging.yml "$@"
}
```

## 4. Record the current state

```bash
cd /opt/apps/chemisttasker-staging
git status --short
git rev-parse HEAD | tee /opt/apps/chemisttasker-staging-ops/ahpra-predeploy-sha.txt
git remote -v
grep -h '^STAGING_RUN_MIGRATIONS=' env/*.env
```

Done check: the working tree is clean, the SHA is saved, and you know whether
`STAGING_RUN_MIGRATIONS` is `1`, `0` or unset (unset means `1`). If the tree
is not clean, stop and ask the owner.

## 5. Get the code

The deploy script deploys whatever is checked out. It does not care about the
branch name. Use the path the owner chose.

**Path A: deploy the branch `codex/ahpra-queue` directly.** The owner must
push it to `origin` first.

```bash
git fetch origin codex/ahpra-queue
git checkout --detach origin/codex/ahpra-queue
```

**Path B: deploy `main` after the pull request is merged.**

```bash
git checkout main
git pull --ff-only origin main
```

Done check (both paths):

```bash
git rev-parse HEAD
git merge-base --is-ancestor 278f891b HEAD && echo "has AHPRA release"
ls backend/client_profile/migrations | grep -E '^008[1234]_'
```

You see `has AHPRA release` and the four files `0081_ahpra_check.py`,
`0082_ahpra_check_stages.py`, `0083_owner_ahpra_switched_to_manager.py`, `0084_ahpra_check_public_recheck.py`.

## 6. Migrations

### If `STAGING_RUN_MIGRATIONS` is `1` (or unset)

Do nothing here. The web container runs `migrate` on start, and the deploy
script backs up the database first. Go to step 7.

### If `STAGING_RUN_MIGRATIONS` is `0`

The migration history may need repair, so rehearse on a copy first. Do not
touch the real database.

```bash
backup=/opt/backups/chemisttasker/ahpra-rehearsal-$(date -u +%Y%m%dT%H%M%SZ).dump
( umask 077; docker exec chemisttasker_postgres_staging \
    pg_dump -U chemisttasker_staging -d chemisttasker_staging -Fc > "$backup" )
docker exec chemisttasker_postgres_staging createdb -U chemisttasker_staging ahpra_rehearsal
docker exec -i chemisttasker_postgres_staging \
  pg_restore -U chemisttasker_staging -d ahpra_rehearsal --no-owner < "$backup"
compose build web
compose run --rm --no-deps -e LOCAL_DB_NAME=ahpra_rehearsal \
  -e RUN_MIGRATIONS=0 -e COLLECT_STATIC=0 web sh -c \
  'python manage.py check_content_migrations && python manage.py migrate --plan && python manage.py migrate --noinput && python manage.py showmigrations client_profile | tail -5'
docker exec chemisttasker_postgres_staging dropdb -U chemisttasker_staging ahpra_rehearsal
```

Done check: `migrate` exits 0 and `showmigrations` shows `[X]` for 0081, 0082
0083 and 0084. Then **stop and report to the owner**. Change
`STAGING_RUN_MIGRATIONS` to `1` in `env/staging.runtime.env` only when the
owner approves. If the rehearsal fails, report the error lines and stop.

## 7. Environment settings

`docker-compose.staging.yml` reads these names. Each key must live in exactly
one env file.

| Key | File | Value |
| --- | --- | --- |
| `AHPRA_VERIFIER_TOKEN_SHA256` | `staging.secrets.env` | 64 hex characters sent by the owner |
| `STAGING_ADMIN_EMAILS` | `staging.runtime.env` | `Admin@chemisttasker.com.au` |
| `STAGING_AHPRA_TEST_LOOKUP_ENABLED` | `staging.runtime.env` | `1` |
| `STAGING_AHPRA_SOURCE` | none yet | leave unset for now (default `scrapingbee`) |

The owner generates the token on the desktop and sends you only the hash
(section 14). Never ask for the plain token.

First see what is already set (names only, no values):

```bash
grep -o -E '^(AHPRA_VERIFIER_TOKEN_SHA256|STAGING_ADMIN_EMAILS|ADMIN_EMAILS|STAGING_AHPRA_SOURCE|STAGING_AHPRA_TEST_LOOKUP_ENABLED)=' env/*.env
```

Compose reads `STAGING_ADMIN_EMAILS`, not `ADMIN_EMAILS`. If you find a plain
`ADMIN_EMAILS=` line, tell the owner; it has no effect on staging.

Then add the missing lines with an editor (keep each file `0600`):

```dotenv
# env/staging.secrets.env
AHPRA_VERIFIER_TOKEN_SHA256=<64 hex characters from the owner>

# env/staging.runtime.env
STAGING_ADMIN_EMAILS=Admin@chemisttasker.com.au
STAGING_AHPRA_TEST_LOOKUP_ENABLED=1
```

Done check:

```bash
grep -E '^AHPRA_VERIFIER_TOKEN_SHA256=[0-9a-f]{64}$' env/staging.secrets.env >/dev/null && echo "hash ok"
stat -c '%a %n' env/*.env
```

You see `hash ok`, and every file is `600`.

## 8. Deploy and smoke

```bash
bash scripts/deploy-staging.sh
bash scripts/smoke-staging.sh https://staging.chemisttasker.com.au
```

Done check: the deploy prints `DB_BACKUP=...` and `STAGING_URL=...`, all
containers are up and healthy, and the smoke test prints `SMOKE_TESTS=PASS`.
Record the new SHA:

```bash
git rev-parse HEAD | tee /opt/apps/chemisttasker-staging-ops/ahpra-deployed-sha.txt
compose exec -T web python manage.py showmigrations client_profile | tail -4
```

`showmigrations` shows `[X]` for 0081, 0082, 0083 and 0084.

## 9. Confirm the settings inside the containers

This prints only lengths and yes/no, never values:

```bash
for c in chemisttasker_backend_staging chemisttasker_celery_staging chemisttasker_celery_beat_staging; do
  docker exec "$c" python -c 'import os; e=os.environ.get; print("'"$c"'", "hash_len=%d" % len(e("AHPRA_VERIFIER_TOKEN_SHA256","")), "admins=%s" % bool(e("ADMIN_EMAILS")), "source=%s" % e("AHPRA_SOURCE"), "test_page=%s" % e("AHPRA_TEST_LOOKUP_ENABLED"))'
done
```

Done check: all three lines show `hash_len=64 admins=True source=scrapingbee test_page=1`.

## 10. Prove the websocket before switching the source

Save this probe as `/opt/apps/chemisttasker-staging-ops/ahpra_ws_probe.py`:

```python
"""Probe the AHPRA verifier websocket. Usage: AHPRA_PROBE_TOKEN=... python ahpra_ws_probe.py"""
import asyncio
import json
import os

import websockets

URL = os.environ.get("AHPRA_PROBE_URL", "wss://staging.chemisttasker.com.au/ws/ahpra-verifier/")


async def probe(token):
    try:
        async with websockets.connect(URL, open_timeout=15) as ws:
            await ws.send(json.dumps({"type": "hello", "token": token, "agent": "staging-probe", "kind": "bridge"}))
            reply = json.loads(await asyncio.wait_for(ws.recv(), 15))
            return reply.get("type")
    except websockets.ConnectionClosed as exc:
        return "closed %s" % (exc.rcvd.code if exc.rcvd else None)
    except Exception as exc:
        return "handshake failed: %s: %s" % (type(exc).__name__, exc)


async def main():
    print("wrong token:", await probe("wrong-token-for-probe"))
    token = os.environ.get("AHPRA_PROBE_TOKEN")
    if token:
        print("right token:", await probe(token))


asyncio.run(main())
```

Expected results:

- `wrong token: closed 4401`. This alone proves the Nginx upgrade path works
  and the web container has the hash.
- `right token: ready`. Only someone with the plain token can run this part,
  so the **owner** runs it on the desktop (it has Python and `websockets`):
  `$env:AHPRA_PROBE_TOKEN = '<token>'; python ahpra_ws_probe.py`.

Run the wrong-token half from the server in a throwaway container, so nothing
is installed on the host:

```bash
docker run --rm -i python:3.12-slim sh -c \
  'pip install -q websockets==13.1 && python -' \
  < /opt/apps/chemisttasker-staging-ops/ahpra_ws_probe.py
```

Done check: you see `wrong token: closed 4401`, and the owner reports
`right token: ready`.

The probe says hello as a bridge. The queue is empty before the source switch,
so this is harmless. If a check is ever handed to the probe, it goes back to
the queue after 5 minutes.

### If the probe fails

- `handshake failed ... 403`: the web container has no hash. Recheck steps 7 to 9.
- `handshake failed ... 400`, `426` or `502`: the WebSocket upgrade is lost in
  front of the staging gateway. The staging gateway itself
  (`nginx/staging.conf`, in this repo) already passes upgrades:

  ```nginx
  location /ws/ {
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection $connection_upgrade_staging;
      proxy_read_timeout 3600s;
      proxy_send_timeout 3600s;
      proxy_pass http://chemisttasker_backend_staging;
  }
  ```

  So the gap is the shared, production-owned Nginx vhost for
  `staging.chemisttasker.com.au`, which is outside this repo. Find it:

  ```bash
  docker ps --format '{{.Names}}' | grep -i nginx
  docker exec <shared-nginx-container> grep -rln 'staging.chemisttasker.com.au' /etc/nginx
  ```

  It needs this block inside the `server` for the staging domain, using the
  same `proxy_pass` target as its existing `location /`:

  ```nginx
  location /ws/ {
      proxy_pass <same target as location />;
      proxy_http_version 1.1;
      proxy_set_header Upgrade $http_upgrade;
      proxy_set_header Connection "upgrade";
      proxy_set_header Host $host;
      proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
      proxy_read_timeout 3600s;
      proxy_send_timeout 3600s;
  }
  ```

  This Nginx also serves production. **Ask the owner before editing it.**
  Copy the file first, then run `nginx -t` and `nginx -s reload` inside that
  container. Rerun the probe.

## 11. Switch the source to desktop

1. Ask the owner to confirm both desktop verifiers (extension and bridge) are
   connected. You can see their connections in the web log:

   ```bash
   docker logs --since 30m chemisttasker_backend_staging 2>&1 | grep -c 'ahpra-verifier'
   ```

2. Add to `env/staging.runtime.env`:

   ```dotenv
   STAGING_AHPRA_SOURCE=desktop
   ```

3. Redeploy web, worker and beat, then smoke:

   ```bash
   bash scripts/deploy-staging.sh
   bash scripts/smoke-staging.sh https://staging.chemisttasker.com.au
   ```

Done check: rerun the step 9 loop. All three lines show `source=desktop`.
The owner sees the desktop verifiers reconnect (they reconnect by themselves
after the web restart).

## 12. Hidden staff test page

- URL: `https://staging.chemisttasker.com.au/admin/ahpra-test-lookup/` (the
  admin path on staging is `admin/`; the URL name is
  `otpadmin:ahpra_test_lookup`). It is not linked anywhere.
- Access: a staff account that has passed admin OTP. Everyone else gets the
  admin login. With the setting off it returns 404.
- Use: enter a PHA number (PHA plus 10 digits), optional first and last name,
  and the role. Submit. The check goes to the connected desktop verifiers. The
  page lists the last 20 test checks with the lookup outcome and the decision.
  Reload after about a minute. "Delete" removes all test checks. Test checks
  never touch a real profile.
- Done check: one lookup with a number the owner supplies comes back with an
  outcome. Do not write that number anywhere.
- Secret URL for the owner (no login, max 30 lookups an hour, same setting):
  1. On the server: `python3 -c "import secrets;print(secrets.token_urlsafe(32))"`.
  2. Put `AHPRA_TEST_LOOKUP_KEY=<key>` in `env/staging.secrets.env`.
  3. Redeploy web: `bash scripts/deploy-staging.sh`.
  4. Give the owner `https://staging.chemisttasker.com.au/api/v1/ahpra-test/<key>/`.
  A missing, short (under 32 characters) or wrong key returns 404.
- Turn it off: set `STAGING_AHPRA_TEST_LOOKUP_ENABLED=0` in
  `env/staging.runtime.env` and redeploy. The page then returns 404.
- Delete it later (a code change, done in the repo, not on the server):
  - `backend/onboarding/ahpra_test_lookup.py`
  - `backend/onboarding/test_ahpra_test_lookup.py`
  - `backend/onboarding/templates/admin/ahpra_test_lookup.html` and
    `ahpra_test_lookup_body.html` next to it
  - `backend/onboarding/templates/onboarding/ahpra_test_lookup_public.html`
  - the `ahpra-test-key-lookup` route in `backend/onboarding/urls.py` and its
    name in `backend/onboarding/middleware.py`
  - the `get_urls` override in `backend/core/admin_site.py`
  - `AHPRA_TEST_LOOKUP_ENABLED` and `AHPRA_TEST_LOOKUP_KEY` in `backend/core/settings.py`
  - the `AHPRA_TEST_LOOKUP_ENABLED` and `AHPRA_TEST_LOOKUP_KEY` lines in `docker-compose.staging.yml`
  - `STAGING_AHPRA_TEST_LOOKUP_ENABLED` in `env/staging.runtime.env` and
    `AHPRA_TEST_LOOKUP_KEY` in `env/staging.secrets.env`

## 13. Rollback

Remove the `STAGING_AHPRA_SOURCE=desktop` line from
`env/staging.runtime.env` (the default is `scrapingbee`, which stays paused),
then:

```bash
bash scripts/deploy-staging.sh
bash scripts/smoke-staging.sh https://staging.chemisttasker.com.au
```

Done check: the step 9 loop shows `source=scrapingbee`.

Rolling the code back to the release before this one is also safe without
reversing migrations 0081-0084 (0084 only adds a choice value). Older code never reads or writes the
`AhpraCheck` table (0081 creates it, 0082 only adds columns to it), and the one
new column on an existing table, `owneronboarding.ahpra_switched_to_manager`
(0083), has a database default of `false`, so owner rows inserted by older code
still save. Keep the env change above as the first step either way.

The migrations stay. For a full restore, use the `DB_BACKUP` dump from step 8 and
the SHA saved in step 4, only with the owner's approval.

## 14. Desktop side (done on the owner's PC, not by you)

The owner does these. Details: `scripts/ahpra_verifier/README.md`, section
"Always-on desktop", and `scripts/ahpra_extension/README.md`.

1. Generate the token and its hash once, keep the token on the desktop, send
   only the `SHA256` line to the server session:

   ```powershell
   python -c "import secrets,hashlib; t=secrets.token_urlsafe(32); print('TOKEN', t); print('SHA256', hashlib.sha256(t.encode()).hexdigest())"
   ```

2. Chrome extension options: URL
   `wss://staging.chemisttasker.com.au/ws/ahpra-verifier/` and the token.
3. Copy `scripts/ahpra_verifier/start_bridge.example.bat` to
   `start_bridge.bat` (git-ignored) and fill in the token, paths and agent
   name. Run it from a stable checkout.
4. Scheduled tasks: the bridge at logon with a 1-minute restart on failure,
   and the Chrome keep-open watchdog (`keep_chrome_open.ps1`) every minute.
5. A separate clean repair worktree, set as `AHPRA_REPAIR_WORKTREE`.
6. Power settings: never sleep or hibernate on AC power; stay signed in.
7. Run the right-token probe from section 10 and report `ready`.

## 15. Report back to the owner

- [ ] SHA before and after (step 4 and step 8), and which path (A or B)
- [ ] `STAGING_RUN_MIGRATIONS` value; rehearsal result if it was `0`
- [ ] `DB_BACKUP` path printed by the deploy
- [ ] 0081, 0082, 0083, 0084 shown as applied
- [ ] Whether `ADMIN_EMAILS` (plain) was found in any env file
- [ ] Smoke test result after each deploy
- [ ] Step 9 output for all three containers (lengths and yes/no only)
- [ ] Wrong-token probe result; whether the shared Nginx needed a change
- [ ] Source switched to `desktop` (yes/no) and when
- [ ] Test page reachable for staff, and one lookup outcome
- [ ] Anything that failed, with the error lines
