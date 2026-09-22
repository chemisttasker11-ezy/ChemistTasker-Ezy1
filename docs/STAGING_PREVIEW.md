# ChemistTasker staging preview

The `staging` branch is the review environment. It is deliberately separate from `main`.

## Isolation

The staging stack uses its own PostgreSQL database, Redis instance, media/static/verification volumes, Docker network and container names. It does not connect to the production PostgreSQL database or the production `shared_redis` service.

The public preview is provided by a Cloudflare Quick Tunnel, so the initial staging setup does not require a DNS change or a production Nginx change. The generated `trycloudflare.com` URL is HTTPS. If the tunnel container is recreated the URL can change; a permanent `staging.chemisttasker.com.au` hostname can be added later.

Third-party services are intentionally blank in staging by default: email, SMS, Stripe, OCR, ScrapingBee and Azure storage are not connected. This prevents staging activity from triggering real external actions.

## One-time self-hosted runner setup

GitHub-hosted staging jobs did not start, so staging uses a self-hosted GitHub Actions runner on the existing OVH server. This avoids GitHub-hosted runner capacity/minute limits and does not require storing the OVH private SSH key in GitHub.

In the repository, open:

`Settings -> Actions -> Runners -> New self-hosted runner -> Linux -> x64`

On the OVH server, follow GitHub's displayed installation commands as the existing `ubuntu` user. When running the configuration command, add:

`--name chemisttasker-staging --labels chemisttasker-staging`

Install/start it as a service using the commands GitHub displays.

The runner user must be able to run Docker without sudo. The existing VPS setup already configures the `ubuntu` user in the Docker group.

The workflow deploys the isolated stack to:

`/opt/apps/chemisttasker-staging`

Server-generated staging database/Django secrets live under the ignored `env/` directory in that staging folder and are preserved between deployments.

Once the runner shows **Idle** in GitHub, the queued **Staging Preview** workflow can run. Every later push to `staging` redeploys the preview automatically.

## Review workflow

1. Make proposed changes on `staging` only.
2. Let the Staging Preview workflow deploy them.
3. Open the preview URL from the workflow summary and review/test.
4. Iterate on `staging` until approved.
5. Only after approval, move the approved code to `main`.

Do not use the staging database as a production-data copy. If realistic test data is needed, restore a sanitised dataset into the staging PostgreSQL volume instead.
