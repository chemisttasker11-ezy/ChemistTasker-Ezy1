# ChemistTasker staging deployment

The staging application runs at `https://staging.chemisttasker.com.au` on the
ChemistTasker VPS. DNS points the hostname to the VPS. The shared Nginx
container terminates TLS and forwards requests to the isolated staging gateway.

## Cloudflare preview retirement

The repository previously used a Cloudflare Quick Tunnel for temporary preview
URLs. That path was retired after the permanent DNS record, Nginx route and
Let's Encrypt certificate were installed. The staging deployment no longer
starts `cloudflared`, discovers a random hostname or rewrites its runtime env.

## Isolation

The staging stack keeps its own containers, Redis instance, volumes and Docker
network. Its gateway joins `shared_backend_network` only so the shared Nginx
container can reach it.

Database selection comes from the staging backend configuration. Do not point
staging at a production database until the migration graph has been checked and
a recoverable backup exists.

## Environment files

The server keeps these ignored files under
`/opt/apps/chemisttasker-staging/env/` (directory `0700`, files `0600`). Each
file holds only the keys `docker-compose.staging.yml` actually reads, and no
key appears in more than one file:

| File | Contents |
| --- | --- |
| `staging.secrets.env` | Server-generated `STAGING_POSTGRES_PASSWORD` and `STAGING_DJANGO_SECRET_KEY` |
| `staging.runtime.env` | Origin and behaviour switches: `STAGING_PUBLIC_URL`, `STAGING_ALLOWED_HOSTS`, `STAGING_RUN_MIGRATIONS`, `STAGING_MOBILE_OTP_DISPLAY_IN_APP`, `STAGING_EMAIL_BACKEND`, `STAGING_USE_AZURE_STORAGE` |
| `staging.integrations.env` | Third-party credentials: reCAPTCHA secret, SMTP, Azure storage/OCR, ScrapingBee, MobileMessage, Stripe **test** keys |
| `staging.web.env` | Browser build keys: `VITE_Maps_API_KEY`, `VITE_RECAPTCHA_SITE_KEY` |
| `staging.mobile.env` | Expo staging builds only; not read by the server stack |
| `staging.test-users.json` | Generated synthetic-user credentials |

Production-only values (production `SECRET_KEY`, `PROD_DB`, admin path,
security flags) do not belong in these files; staging sets its own security
flags in the Compose file. The deployment script reads the files without
printing secret values. They are not stored in Git.

Deployment logs, release markers and one-off scripts belong in
`/opt/apps/chemisttasker-staging-ops/`, not in `env/`.

Prepare the provider files on Windows from the legacy production env files:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-staging-env.ps1
```

The script copies the backend, web and mobile settings into ignored staging
files. It changes the mobile URLs to the staging domain and starts SMTP in
console mode. On the server, `STAGING_EMAIL_BACKEND` in `staging.runtime.env`
decides whether staging sends real email; it is currently the SMTP backend at
the owner's request, so remember that the database contains copied production
users.

`staging.runtime.env` must contain the permanent origin:

```dotenv
STAGING_PUBLIC_URL=https://staging.chemisttasker.com.au
STAGING_ALLOWED_HOSTS=staging.chemisttasker.com.au
```

## Deployment

From `/opt/apps/chemisttasker-staging`, run:

```bash
bash scripts/deploy-staging.sh
```

The script validates Compose, dumps the staging database to
`/opt/backups/chemisttasker/staging-predeploy-*.dump` (the ten newest are
kept), builds the images, waits for container health, restarts the gateway,
checks the public site and backend health endpoint, then prints container
status. Then run the smoke test:

```bash
bash scripts/smoke-staging.sh https://staging.chemisttasker.com.au
```

Celery worker and beat start by default. To deploy without them:

```bash
bash scripts/deploy-staging.sh --without-workers
```

The gateway is restarted, never recreated. The production-owned shared Nginx
resolves the gateway address only when it loads, so a recreated gateway with a
new address would leave staging unreachable until shared Nginx reloads. Keep
the `gateway` service definition unchanged unless that reload is planned.

## Production data refresh

Production backups live under `/opt/backups/chemisttasker`, outside the Git
repositories. Use a PostgreSQL custom-format dump of the `public` schema.

Refresh the isolated staging database with a reviewed backup:

```bash
bash scripts/refresh-staging-db.sh \
  --confirm-production-data \
  /opt/backups/chemisttasker/legacy-production-public-YYYYMMDDTHHMMSSZ.dump
```

The refresh script creates a rollback dump of the current staging database,
stops the application containers, restores the production data, and prints
row counts for users, pharmacies and memberships. It also removes the verified
legacy `pharmacy_hub.0001_initial` history collision while the hub tables still
have their legacy `client_profile_*` names. It sets
`STAGING_RUN_MIGRATIONS=0` and leaves Celery stopped. Repair and rehearse the
migration history before changing that value to `1`.

The staging database now contains personal production data. Restrict VPS access
and do not download its dumps into this repository.

## Manual deployments only

GitHub does not deploy staging. The self-hosted deployment workflow was
removed and no runner is registered; `Staging QA` still runs the test suite on
GitHub-hosted runners. An operator updates the staging checkout to the
reviewed commit over SSH and runs `scripts/deploy-staging.sh`. Record the
deployed commit in `/opt/apps/chemisttasker-staging-ops/`.

## Search engines

The staging gateway sends `X-Robots-Tag: noindex, nofollow`, serves a
`Disallow: /` robots file and returns 404 for `/sitemap.xml`. These rules live
only in `nginx/staging.conf`; production is unaffected.

## Local frontend development against staging

The frontend developer runs Next on `http://localhost:3000` or Vite on
`http://localhost:5173` against the staging API. Both origins are in the
staging `CORS_ALLOWED_ORIGINS` and `CSRF_TRUSTED_ORIGINS`; keep them there.

## Synthetic test users in staging

The private staging PostgreSQL database is `chemisttasker_staging` and is not
reachable directly from the contractor frontend. It stays inside the isolated
staging Docker network. Never publish port 5432.

After migrations pass, the deployment provisions eight synthetic logins:
Owner, Organisation Admin, Pharmacist, Intern, Technician, Assistant, Student
and Explorer. It also creates one fictional organisation, two fictional
pharmacies and accepted staff memberships. The four Other Staff profiles use
the corresponding role subtypes. The operation is idempotent and refuses
collisions with non-demo accounts.

Distinct, randomly generated credentials are stored only on the OVH server in
`/opt/apps/chemisttasker-staging/env/staging.test-users.json` with permissions
`0600`. An authorised server operator should obtain the relevant credentials
and provide them privately to the frontend developer. Never commit or print
the passwords in CI, pull request comments or documentation. Staging users
bypass only email and mobile OTP setup through preseeded verification flags.
No real licence or identity verification has been performed.

After a successful deployment, the developer uses the normal staging HTTPS API
from the local Next application on port 3000 or the local Vite application on
port 5173. Database access is not required for frontend login.

## Review workflow

1. Make proposed changes in this staging repository.
2. Commit them to this repository's `main` branch.
3. Deploy the reviewed commit manually (see *Deployment*).
4. Run the smoke test and open the staging URL to test it.
5. Iterate here until approved.
6. Only after approval, transfer the approved changes to the separate production repository.

Temporary feature branches are still fine for large or risky work. There is no
permanent `staging` branch because this repository is the staging repository.

Prefer synthetic or sanitised data. If the reviewed production-data refresh
procedure is used, apply the access restrictions and migration controls above.
