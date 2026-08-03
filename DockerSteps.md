# ChemistTasker Docker, Redis, Celery, and VPS Workflow

This file covers the practical commands for running ChemistTasker locally and on the VPS.

ChemistTasker has:

```text
Django + DRF + Channels   backend/API/WebSockets
Daphne                    ASGI web server
Celery worker             async email, notifications, OCR, billing, verification jobs
Celery Beat               scheduled jobs
Redis                     shared VPS Redis, separated by DB numbers and key prefix
Supabase Postgres         production database
Azure Blob/OCR            storage/OCR providers, still used for now
Nginx                     shared VPS HTTPS reverse proxy
React web                 three Vite dev servers in dev; built and served by Nginx in production
Expo mobile               Expo dev server in dev; EAS builds outside Compose
```

## Redis DB Layout

In development, ChemistTasker uses its own Redis container.

In production on the VPS, ChemistTasker uses the shared Redis container on `shared_backend_network` with separated Redis databases:

```text
REDIS_URL              redis://shared_redis:6379/0   generic app Redis fallback
CHANNEL_REDIS_URL      redis://shared_redis:6379/1   Django Channels/WebSockets
CELERY_BROKER_URL      redis://shared_redis:6379/2   Celery task broker
CELERY_RESULT_BACKEND  redis://shared_redis:6379/3   Celery result backend
DJANGO_CACHE_URL       redis://shared_redis:6379/4   Django cache/rate-limit store
REDIS_KEY_PREFIX       chemisttasker:prod
```

Reason: one shared Redis process is simpler to operate, but DB separation plus `REDIS_KEY_PREFIX` keeps ChemistTasker away from other lightweight apps.

## Dev Without Docker

Use this when running the backend directly on Windows.

Start Redis-compatible local service:

```powershell
Start-Service -Name Memurai
```

Backend:

```powershell
cd C:\code\chemisttasker\backend
.\venv\Scripts\python.exe -m pip install -r requirements.txt
.\venv\Scripts\python.exe manage.py migrate
.\venv\Scripts\python.exe manage.py runserver 0.0.0.0:8000
```

Celery worker:

```powershell
cd C:\code\chemisttasker\backend
.\venv\Scripts\celery.exe -A core worker -l INFO -Q email,default,notifications,ocr,billing --pool=solo
```

Celery Beat:

```powershell
cd C:\code\chemisttasker\backend
.\venv\Scripts\celery.exe -A core beat -l INFO
```

Frontend web dev servers:

```powershell
cd C:\code\chemisttasker\frontend_web
npm run dev:5173
npm run dev:5174
npm run dev:5175
```

Expo mobile:

```powershell
cd C:\code\chemisttasker\frontend_mobile
set REACT_NATIVE_PACKAGER_HOSTNAME=192.168.1.9
npx expo start --dev-client --lan --clear
```

Stripe webhook listener:

```powershell
cd C:\code\chemisttasker
docker compose -f docker-compose.dev.yml up stripe
```

Open:

```text
http://127.0.0.1:8000/
http://localhost:5173/
```

## Dev With Docker

Use this when Docker should run backend, Redis, Celery worker, Celery Beat, Stripe CLI, the three web dev servers, and Expo.

Start dev stack:

```powershell
cd C:\code\chemisttasker
docker compose -f docker-compose.dev.yml up --build
```

Start in background:

```powershell
docker compose -f docker-compose.dev.yml up -d --build
```

Stop:

```powershell
docker compose -f docker-compose.dev.yml down
```

Watch logs:

```powershell
docker compose -f docker-compose.dev.yml logs -f web celery_worker celery_beat redis
```

Run Django commands:

```powershell
docker compose -f docker-compose.dev.yml exec web python manage.py check
docker compose -f docker-compose.dev.yml exec web python manage.py migrate
docker compose -f docker-compose.dev.yml exec web python manage.py shell
```

Open shell:

```powershell
docker compose -f docker-compose.dev.yml exec web bash
```

Recreate containers after env changes:

```powershell
docker compose -f docker-compose.dev.yml up -d --build --force-recreate
```

Dev Docker replaces the old pile of manual commands. React web runs on ports 5173, 5174, and 5175. Expo runs on Metro port 8081.

## Production With Docker

Production Compose runs:

```text
web
celery_worker
celery_beat
frontend
```

Shared VPS infrastructure must already provide:

```text
shared_redis on shared_backend_network
shared nginx/certbot on shared_backend_network
TLS certificates
```

Shared Nginx proxies to the ChemistTasker containers:

```text
chemisttasker_backend_prod:8000
chemisttasker_frontend_prod:80
```

Production app folder:

```bash
/opt/apps/chemisttasker
```

Start or update shared VPS infrastructure:

```bash
cd /opt/apps/chemisttasker
docker compose -f docker-compose.infra.yml --env-file env/web.prod.env up -d
```

First start:

```bash
cd /opt/apps/chemisttasker
docker compose --env-file env/web.prod.env up -d --build
docker ps
```

Update after pulling code:

```bash
cd /opt/apps/chemisttasker
git pull
docker compose --env-file env/web.prod.env up -d --build
docker ps
```

Force recreate after changing env files:

```bash
cd /opt/apps/chemisttasker
docker compose --env-file env/web.prod.env up -d --build --force-recreate
```

Production logs:

```bash
docker compose logs -f web celery_worker celery_beat frontend
```

Production health:

```bash
curl -I https://chemisttasker.com.au/health/
curl -I http://chemisttasker.com.au/
docker ps
sudo nginx -t
sudo certbot renew --dry-run
```

Expected:

```text
HTTPS health: 200 OK
HTTP site: 301 redirect to HTTPS
web: healthy
celery_worker: healthy
frontend: running
```

## Required Production Env

Production uses:

```text
env/backend.prod.env
env/web.prod.env
```

Important values:

```env
DJANGO_SETTINGS_MODULE=core.settings
DEBUG=False
SECRET_KEY=...
PROD_DB=postgresql://...
USE_PROD_DB=True

ADMIN_URL=...
ALLOWED_HOSTS=chemisttasker.com.au,www.chemisttasker.com.au,localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=https://chemisttasker.com.au,https://www.chemisttasker.com.au
CSRF_TRUSTED_ORIGINS=https://chemisttasker.com.au,https://www.chemisttasker.com.au
FRONTEND_BASE_URL=https://chemisttasker.com.au
BACKEND_BASE_URL=https://chemisttasker.com.au

EMAIL_HOST_USER=...
EMAIL_HOST_PASSWORD=...
DEFAULT_FROM_EMAIL=...

STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...

AZURE_ACCOUNT_NAME=...
AZURE_ACCOUNT_KEY=...
AZURE_CONTAINER=...
USE_AZURE_STORAGE=True
AZURE_OCR_ENDPOINT=...
AZURE_OCR_KEY=...
```

`env/backend.prod.env` is loaded by backend, Celery worker, and Celery Beat. `env/web.prod.env` is passed to Docker Compose for frontend build args.

Verify env keys without printing secret values:

```bash
grep -E '^[A-Za-z_][A-Za-z0-9_]*=' /opt/apps/chemisttasker/env/backend.prod.env | cut -d= -f1
```

## Nginx and Certificates

ChemistTasker no longer runs its own production Nginx container. The shared VPS Nginx should include a site config based on:

```text
nginx/templates/default.conf.template
```

That config assumes shared Nginx is attached to `shared_backend_network` and can resolve:

```text
chemisttasker_backend_prod
chemisttasker_frontend_prod
```

The shared Nginx should proxy `/api/`, `/health/`, `/ws/`, the admin path, `/static/`, and `/media/` to `chemisttasker_backend_prod:8000`, and proxy the site root to `chemisttasker_frontend_prod:80`.

Certbot and certificate renewal belong to the shared VPS Nginx setup, not to the ChemistTasker app Compose.

## Celery Commands

Registered tasks:

```powershell
cd C:\code\chemisttasker\backend
.\venv\Scripts\celery.exe -A core inspect registered
```

Celery report:

```powershell
.\venv\Scripts\celery.exe -A core report
```

Start all queues locally:

```powershell
.\venv\Scripts\celery.exe -A core worker -l INFO -Q email,default,notifications,ocr,billing --pool=solo
```

Start Beat locally:

```powershell
.\venv\Scripts\celery.exe -A core beat -l INFO
```

Inspect active tasks in Docker:

```bash
docker compose exec celery_worker celery -A core inspect active
docker compose exec celery_worker celery -A core inspect reserved
docker compose exec celery_worker celery -A core inspect scheduled
```

Ping worker:

```bash
docker compose exec celery_worker celery -A core inspect ping
```

Restart only Celery:

```bash
docker compose restart celery_worker celery_beat
```

Tail Celery logs:

```bash
docker compose logs -f celery_worker celery_beat
```

## Redis Commands

Ping shared Redis from the app network:

```bash
docker run --rm --network shared_backend_network redis:8-alpine redis-cli -h shared_redis ping
```

Check DB sizes:

```bash
docker run --rm --network shared_backend_network redis:8-alpine redis-cli -h shared_redis INFO keyspace
```

Open Redis CLI:

```bash
docker run --rm -it --network shared_backend_network redis:8-alpine redis-cli -h shared_redis
```

Select a DB:

```redis
SELECT 2
DBSIZE
KEYS *
```

Flush a dev Redis DB only:

```powershell
docker compose -f docker-compose.dev.yml exec redis redis-cli -n 2 FLUSHDB
```

Do not run `FLUSHALL` in production.

## Useful Docker Commands

Build production:

```bash
docker compose build
```

Start production:

```bash
docker compose up -d
```

Stop production:

```bash
docker compose down
```

Rebuild one service:

```bash
docker compose up -d --build web
docker compose up -d --build celery_worker
```

Run one-off Django command:

```bash
docker compose run --rm web python manage.py check
docker compose run --rm web python manage.py migrate
docker compose run --rm web python manage.py collectstatic --noinput
```

Fix static volume permissions if needed:

```bash
docker compose run --rm --user root --entrypoint "" web chown -R appuser:appuser /app/staticfiles
docker compose up -d
```

Remove stopped containers:

```bash
docker container prune
```

Remove unused images:

```bash
docker image prune
```

## Queues

Current queue names:

```text
email
default
notifications
ocr
billing
```

Current worker command:

```bash
celery -A core worker -l INFO -Q email,default,notifications,ocr,billing --concurrency=2
```

Windows/dev worker command:

```powershell
celery -A core worker -l INFO -Q email,default,notifications,ocr,billing --pool=solo
```

Email rate limit:

```env
EMAIL_TASK_RATE_LIMIT=30/m
```

## Files

```text
docker-compose.yml          production backend stack
docker-compose.infra.yml    shared VPS Redis, Nginx, and certbot
docker-compose.dev.yml      local Docker dev backend stack
backend/Dockerfile          production backend image
backend/Dockerfile.dev      dev backend image
backend/entrypoint.sh       waits for Redis, migrations, collectstatic, then starts command
backend/.dockerignore       excludes venv, env files, media, staticfiles, caches from image
backend/core/celery.py      Celery app
backend/core/task_queue.py  temporary compatibility wrapper for old async_task call sites
frontend_web/Dockerfile     production React build image
nginx/templates             site template for the shared VPS Nginx
certbot/www                 legacy/local ACME webroot placeholder; production certbot belongs to shared Nginx
env                         ignored real env files, never commit this folder
```

## Known Cleanup Left

- Eventually remove `backend/core/task_queue.py` by converting old `async_task(...)` calls to direct Celery task calls.
- Repair/sync `frontend_web/package-lock.json` and switch the frontend Dockerfile back to `npm ci` when the lockfile is clean.
- Add other lightweight apps by attaching them to `shared_backend_network` and adding their Nginx site templates to the shared Nginx template folder.
