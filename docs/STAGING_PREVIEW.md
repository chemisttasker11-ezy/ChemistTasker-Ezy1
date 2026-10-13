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
row counts for users, pharmacies and memberships. It sets
`STAGING_RUN_MIGRATIONS=0` and leaves Celery stopped. Repair and rehearse the
migration history before changing that value to `1`.

The staging database now contains personal production data. Restrict VPS access
and do not download its dumps into this repository.

## GitHub Actions runner

The optional self-hosted workflow deploys to
`/opt/apps/chemisttasker-staging`. Configure its runner with the
`chemisttasker-staging` label and Docker access. The workflow preserves the
ignored `env/` directory between deployments.
