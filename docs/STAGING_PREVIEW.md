# ChemistTasker staging preview

This repository is the **staging repository**. Its `main` branch is the source of truth for the preview environment. Production is deployed from a completely separate repository.

## Isolation

The staging stack uses its own PostgreSQL database, Redis instance, media/static/verification volumes, Docker network and container names. It does not connect to the production PostgreSQL database or the production `shared_redis` service.

The public preview is provided by a Cloudflare Quick Tunnel, so the initial staging setup does not require a DNS change or a production Nginx change. The generated `trycloudflare.com` URL is HTTPS. If the tunnel container is recreated the URL can change; a permanent `staging.chemisttasker.com.au` hostname can be added later.

Email, SMS, Stripe, OCR, ScrapingBee and Azure storage remain intentionally disconnected in staging by default so preview activity cannot trigger real messages, payments, paid lookups or production file writes.

## Browser integrations

The staging build requires all browser variables that the consolidated web applications actually use:

- Vite uses same-origin `/api`, the Maps/Places browser key, the reCAPTCHA site key and the public-site bridge flag.
- Next uses the exact preview origin for both site and platform URLs, plus the same Maps/Places browser key and reCAPTCHA site key.
- Django uses the matching reCAPTCHA secret and the exact preview origin for CORS/CSRF/frontend URLs.

Values are kept in ignored server-side files under `env/`; they are never committed.

On first deployment, `scripts/deploy-staging.sh` attempts to copy only these three values from the existing production env files without printing them:

- `VITE_Maps_API_KEY`
- `VITE_RECAPTCHA_SITE_KEY`
- `RECAPTCHA_SECRET_KEY`

It stores them as `env/staging.integrations.env`. A dedicated staging key pair can replace that file later without changing code.

Because the temporary preview hostname changes, Google-side restrictions must also allow the staging host:

- Google Maps browser key: allow the HTTPS referrer `https://*.trycloudflare.com`.
- reCAPTCHA: add `trycloudflare.com` to the allowed Domains list.
- For local consolidated development, also allow `http://localhost:3000` for the Maps browser key and add `localhost` to reCAPTCHA. Add `http://127.0.0.1:3000` as a Maps referrer if that hostname is used.

A permanent `staging.chemisttasker.com.au` origin is preferable later because it lets both Google services use a narrow, stable allowlist instead of the broad temporary tunnel domain.

## One-time self-hosted runner setup

Staging uses a self-hosted GitHub Actions runner on the existing OVH server. This avoids GitHub-hosted runner capacity/minute limits and does not require storing the OVH private SSH key in GitHub.

In this repository, open:

`Settings -> Actions -> Runners -> New self-hosted runner -> Linux -> x64`

On the OVH server, follow GitHub's displayed installation commands as the existing `ubuntu` user. When running the configuration command, add:

`--name chemisttasker-staging --labels chemisttasker-staging`

Install/start it as a service using the commands GitHub displays.

The runner user must be able to run Docker without sudo. The existing VPS setup already configures the `ubuntu` user in the Docker group.

The workflow deploys the isolated stack to:

`/opt/apps/chemisttasker-staging`

Server-generated staging database/Django secrets and browser-integration values live under the ignored `env/` directory in that staging folder and are preserved between deployments.

Once the runner shows **Idle** in GitHub, every push to this repository's `main` branch redeploys the preview automatically.

## Review workflow

1. Make proposed changes in this staging repository.
2. Commit them to this repository's `main` branch.
3. Let the Staging Preview workflow deploy them.
4. Open the preview URL from the workflow summary and review/test.
5. Iterate here until approved.
6. Only after approval, transfer the approved changes to the separate production repository.

Temporary feature branches are still fine for large or risky work, but there is no permanent `staging` branch because the repository itself is staging.

Do not use the staging database as a production-data copy. If realistic test data is needed, restore a sanitised dataset into the staging PostgreSQL volume instead.
