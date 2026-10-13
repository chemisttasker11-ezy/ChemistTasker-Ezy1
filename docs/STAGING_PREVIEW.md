# ChemistTasker staging preview

This repository is the **staging repository**. Its `main` branch is the source of truth for the preview environment. Production is deployed from a completely separate repository.

## Isolation

The staging stack uses its own PostgreSQL database, Redis instance, media/static/verification volumes, Docker network and container names. It does not connect to the production PostgreSQL database or the production `shared_redis` service.

The public preview is provided by a Cloudflare Quick Tunnel, so the initial staging setup does not require a DNS change or a production Nginx change. The generated `trycloudflare.com` URL is HTTPS. If the tunnel container is recreated the URL can change; a permanent `staging.chemisttasker.com.au` hostname can be added later.

Email, SMS, Stripe, OCR, ScrapingBee and Azure storage stay disconnected unless the
optional server-side files below exist, so preview activity cannot trigger real
messages, payments, paid lookups or production file writes by accident.

Mobile OTP has no test bypass: with MobileMessage credentials in
`env/staging.api.env`, staging sends real SMS codes exactly like local; without
them, requesting a mobile code returns 502. The seeded synthetic users are already
mobile-verified, so they never need an SMS.

To enable real email delivery with the same SMTP account as local, put
`EMAIL_HOST_USER`, `EMAIL_HOST_PASSWORD` and `DEFAULT_FROM_EMAIL` in the ignored
server-side file `env/staging.email.env`. Alternatively, set
`STAGING_EMAIL_ENV_FILE` to the path of the existing backend `.env` before running
`scripts/deploy-staging.sh`. The deployment reads only those three mail settings;
staging retains its own database and service configuration. The backend and email
worker receive the same values. Keep this file on the staging server; the source
sync preserves `env/` but never uploads local credentials from Git.

For full integration testing, `env/staging.api.env` (or `STAGING_API_ENV_FILE`)
can supply OCR, ScrapingBee, MobileMessage, Azure account credentials and Stripe
test credentials from the backend `.env`. Stripe live keys are rejected by the
deployment script. Azure storage stays disabled in staging so test uploads keep
using staging's own volume. Browser Maps and reCAPTCHA keys, including the
matching backend reCAPTCHA secret, remain in `env/staging.integrations.env`.

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

## Synthetic test users in staging

The private staging PostgreSQL database is chemisttasker_staging and is not
reachable directly from the contractor frontend. It stays inside the isolated
staging Docker network. Never publish port 5432 or import customer data.

Once Staging Preview deploys on the OVH self-hosted runner and migrations pass,
the deployment provisions eight synthetic logins: Owner, Organisation Admin,
Pharmacist, Intern, Technician, Assistant, Student and Explorer, with one fictional
organisation, two fictional pharmacies and accepted staff memberships. The four
Other Staff profiles use the corresponding role subtypes. The operation is
idempotent and refuses collisions with non-demo accounts.

Distinct, randomly generated credentials are stored only on the OVH server in
/opt/apps/chemisttasker-staging/env/staging.test-users.json (permissions 0600).
An authorised server operator should obtain the relevant credentials and
provide them privately to the frontend developer. Never commit or print the
passwords in CI, PR comments or documentation. Staging users bypass only email
and mobile OTP setup via preseeded verification flags; no real licence or
identity verification has been performed.

After a successful deployment, the developer uses the normal staging HTTPS API
via localhost:3000 (Next) and localhost:5173 (Vite). Database access is not
required for frontend login. If deployment remains queued because the OVH
self-hosted runner is offline, the accounts cannot yet be considered available.

## Review workflow

1. Make proposed changes in this staging repository.
2. Commit them to this repository's `main` branch.
3. Let the Staging Preview workflow deploy them.
4. Open the preview URL from the workflow summary and review/test.
5. Iterate here until approved.
6. Only after approval, transfer the approved changes to the separate production repository.

Temporary feature branches are still fine for large or risky work, but there is no permanent `staging` branch because the repository itself is staging.

Do not use the staging database as a production-data copy. If realistic test data is needed, restore a sanitised dataset into the staging PostgreSQL volume instead.
