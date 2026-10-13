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
`/opt/apps/chemisttasker-staging/env/`:

- `staging.secrets.env`
- `staging.runtime.env`
- `staging.integrations.env`
- `staging.web.env`
- `staging.mobile.env`, used only for Expo staging builds

The deployment script reads them without printing secret values. They are not
stored in Git.

Prepare the provider files on Windows from the legacy production env files:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\prepare-staging-env.ps1
```

The script copies the backend, web and mobile settings into ignored staging
files. It changes the mobile URLs to the staging domain. It also keeps SMTP in
console mode, so staging cannot send email to copied production users.

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

The script validates Compose, builds the images, waits for container health,
checks the public site and backend health endpoint, then prints container
status.

This command leaves Celery workers stopped. After the database migrations have
passed and outbound task behavior has been reviewed, start them with:

```bash
bash scripts/deploy-staging.sh --with-workers
```

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

## GitHub Actions runner

The optional self-hosted workflow deploys to
`/opt/apps/chemisttasker-staging`. Configure its runner with the
`chemisttasker-staging` label and Docker access. The workflow preserves the
ignored `env/` directory between deployments.

Once the runner shows **Idle** in GitHub, every push to this repository's
`main` branch redeploys staging automatically.

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
port 5173. Database access is not required for frontend login. If deployment
remains queued because the OVH self-hosted runner is offline, the accounts are
not yet available.

## Review workflow

1. Make proposed changes in this staging repository.
2. Commit them to this repository's `main` branch.
3. Let the staging deployment workflow deploy them.
4. Open the staging URL from the workflow summary and test it.
5. Iterate here until approved.
6. Only after approval, transfer the approved changes to the separate production repository.

Temporary feature branches are still fine for large or risky work. There is no
permanent `staging` branch because this repository is the staging repository.

Prefer synthetic or sanitised data. If the reviewed production-data refresh
procedure is used, apply the access restrictions and migration controls above.
