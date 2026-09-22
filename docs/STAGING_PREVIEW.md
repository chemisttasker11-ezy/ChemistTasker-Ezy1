# ChemistTasker staging preview

The `staging` branch is the review environment. It is deliberately separate from `main`.

## Isolation

The staging stack uses its own PostgreSQL database, Redis instance, media/static/verification volumes, Docker network and container names. It does not connect to the production PostgreSQL database or the production `shared_redis` service.

The public preview is provided by a Cloudflare Quick Tunnel, so the first staging setup does not require a DNS change or a production Nginx change. The generated `trycloudflare.com` URL is HTTPS. If the tunnel container is recreated the URL can change; a permanent `staging.chemisttasker.com.au` hostname can be added later.

Third-party services are intentionally blank in staging by default: email, SMS, Stripe, OCR, ScrapingBee and Azure storage are not connected. This prevents staging activity from triggering real external actions.

## One-time GitHub setup

Add these repository Actions secrets:

- `STAGING_SSH_HOST` — OVH server hostname or IP.
- `STAGING_SSH_USER` — SSH user that can run Docker Compose.
- `STAGING_SSH_KEY` — private SSH key for that restricted deployment user.

The server needs Docker with the Compose plugin, `openssl`, `curl` and `rsync`. The workflow syncs files to `~/chemisttasker-staging`; server-generated staging secrets live under its ignored `env/` directory and are preserved between deployments.

After the three secrets exist, run **Staging Preview** manually once from GitHub Actions. Every later push to `staging` redeploys the preview automatically.

## Review workflow

1. Make proposed changes on `staging` only.
2. Let the Staging Preview workflow deploy them.
3. Open the preview URL from the workflow summary and review/test.
4. Iterate on `staging` until approved.
5. Only after approval, move the approved code to `main`.

Do not use the staging database as a production-data copy. If realistic test data is needed, restore a sanitised dataset into the staging PostgreSQL volume instead.
