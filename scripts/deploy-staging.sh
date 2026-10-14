#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p env
SECRETS_FILE="env/staging.secrets.env"
RUNTIME_FILE="env/staging.runtime.env"
INTEGRATIONS_FILE="env/staging.integrations.env"
WEB_FILE="env/staging.web.env"

# Cloudflare Quick Tunnel support was retired after the permanent staging DNS,
# VPS Nginx route and Let's Encrypt certificate were installed.
for file in "$SECRETS_FILE" "$RUNTIME_FILE" "$INTEGRATIONS_FILE" "$WEB_FILE"; do
  if [[ ! -s "$file" ]]; then
    printf 'Missing staging environment file: %s\n' "$file" >&2
    exit 1
  fi
done

compose() {
  docker compose \
    --env-file "$SECRETS_FILE" \
    --env-file "$RUNTIME_FILE" \
    --env-file "$INTEGRATIONS_FILE" \
    --env-file "$WEB_FILE" \
    -f docker-compose.staging.yml \
    "$@"
}

compose config --quiet

# Celery worker and beat run by default; --without-workers is the explicit
# opt-out. --with-workers is accepted for older runbooks.
case "${1:-}" in
  ""|--with-workers) with_workers=1 ;;
  --without-workers) with_workers=0 ;;
  *) echo "Usage: $0 [--without-workers]" >&2; exit 2 ;;
esac

# Startup runs migrations, so keep a restorable copy of the current database.
BACKUP_DIR="${STAGING_BACKUP_DIR:-/opt/backups/chemisttasker}"
if docker ps --format '{{.Names}}' | grep -qx chemisttasker_postgres_staging; then
  mkdir -p "$BACKUP_DIR"
  backup="$BACKUP_DIR/staging-predeploy-$(date -u +%Y%m%dT%H%M%SZ).dump"
  ( umask 077; docker exec chemisttasker_postgres_staging \
      pg_dump -U chemisttasker_staging -d chemisttasker_staging -Fc > "$backup" )
  printf 'DB_BACKUP=%s\n' "$backup"
  # Keep the ten most recent pre-deploy dumps; other backups are untouched.
  ls -1t "$BACKUP_DIR"/staging-predeploy-*.dump | tail -n +11 | xargs -r rm -f --
fi

if [[ "$with_workers" == "1" ]]; then
  compose --profile workers up -d --build --wait --wait-timeout 300
else
  compose up -d --build --wait --wait-timeout 300
  compose --profile workers stop celery_worker celery_beat >/dev/null 2>&1 || true
fi

# The gateway resolves its upstreams and reads the bind-mounted staging.conf
# only at start. Restart (never recreate) it: a restart keeps its address on
# shared_backend_network, which the production-owned shared Nginx depends on.
compose restart gateway
for _ in $(seq 1 30); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' chemisttasker_gateway_staging)" == "healthy" ]] && break
  sleep 2
done

staging_url="https://staging.chemisttasker.com.au"
curl -fsS --max-time 20 "$staging_url/" >/dev/null
curl -fsS --max-time 20 "$staging_url/health/" >/dev/null

# Keep credentials exclusively in the staging server's ignored env directory.
TEST_USERS_FILE="env/staging.test-users.json"
if [[ -L "$TEST_USERS_FILE" ]]; then
  echo "Refusing symlinked staging credentials." >&2
  exit 1
fi
if [[ ! -f "$TEST_USERS_FILE" ]]; then
  umask 077
  python3 - "$TEST_USERS_FILE" <<'PY'
import json
import os
import secrets
import sys

personas = ("owner", "organization_admin", "pharmacist", "intern",
            "technician", "assistant", "student", "explorer")
accounts = {
    key: {"email": key + "@staging.chemisttasker.test",
          "password": secrets.token_urlsafe(30)}
    for key in personas
}
with os.fdopen(os.open(sys.argv[1], os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600), "w") as output:
    json.dump(accounts, output, indent=2)
    output.write("\n")
PY
fi
chmod 600 "$TEST_USERS_FILE"
# Wait for successful migrations before this step; never print credentials.
compose exec -T web python manage.py shell -c \
  'from testing.staging_test_data import seed_from_stdin; seed_from_stdin()' \
  < "$TEST_USERS_FILE"

printf 'STAGING_URL=%s\n' "$staging_url"
compose ps
