#!/usr/bin/env bash
set -euo pipefail

if [[ "${1:-}" != "--confirm-production-data" || -z "${2:-}" ]]; then
  echo "Usage: $0 --confirm-production-data /opt/backups/chemisttasker/<backup>.dump" >&2
  exit 2
fi

backup_path="$2"
case "$backup_path" in
  /opt/backups/chemisttasker/*.dump) ;;
  *) echo "Backup must be under /opt/backups/chemisttasker and end in .dump" >&2; exit 2 ;;
esac

test -s "$backup_path"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

SECRETS_FILE="env/staging.secrets.env"
RUNTIME_FILE="env/staging.runtime.env"
INTEGRATIONS_FILE="env/staging.integrations.env"
WEB_FILE="env/staging.web.env"

for file in "$SECRETS_FILE" "$RUNTIME_FILE" "$INTEGRATIONS_FILE" "$WEB_FILE"; do
  test -s "$file" || { echo "Missing staging environment file: $file" >&2; exit 1; }
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

set_runtime_value() {
  local name="$1"
  local value="$2"
  local temporary
  temporary="$(mktemp)"
  awk -v name="$name" -v value="$value" '
    BEGIN { found = 0 }
    $0 ~ "^" name "=" { print name "=" value; found = 1; next }
    { print }
    END { if (!found) print name "=" value }
  ' "$RUNTIME_FILE" > "$temporary"
  chmod 600 "$temporary"
  mv "$temporary" "$RUNTIME_FILE"
}

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
rollback_dir="/opt/backups/chemisttasker"
rollback_path="$rollback_dir/staging-before-production-refresh-${timestamp}.dump"

mkdir -p "$rollback_dir"
chmod 700 "$rollback_dir"

compose up -d postgres
compose stop gateway landing frontend celery_beat celery_worker web

docker exec chemisttasker_postgres_staging \
  pg_dump --format=custom --compress=9 --no-owner --no-acl \
  --username=chemisttasker_staging --dbname=chemisttasker_staging \
  > "$rollback_path"
chmod 600 "$rollback_path"

docker exec chemisttasker_postgres_staging \
  psql --username=chemisttasker_staging --dbname=chemisttasker_staging \
  --set ON_ERROR_STOP=1 \
  --command="DROP SCHEMA IF EXISTS public CASCADE;"

docker cp "$backup_path" chemisttasker_postgres_staging:/tmp/production-refresh.dump
docker exec chemisttasker_postgres_staging \
  pg_restore --exit-on-error --no-owner --no-acl \
  --username=chemisttasker_staging --dbname=chemisttasker_staging \
  /tmp/production-refresh.dump
docker exec chemisttasker_postgres_staging rm /tmp/production-refresh.dump

set_runtime_value STAGING_RUN_MIGRATIONS 0

docker exec chemisttasker_postgres_staging \
  psql --username=chemisttasker_staging --dbname=chemisttasker_staging \
  --set ON_ERROR_STOP=1 --tuples-only --no-align \
  --command="SELECT 'users=' || count(*) FROM users_user
             UNION ALL SELECT 'pharmacies=' || count(*) FROM client_profile_pharmacy
             UNION ALL SELECT 'memberships=' || count(*) FROM client_profile_membership;"

compose up -d --build postgres redis web frontend landing gateway
compose stop celery_beat celery_worker

echo "Restored production data into the isolated staging PostgreSQL container."
echo "Automatic migrations and Celery workers remain disabled."
echo "Rollback backup: $rollback_path"
compose ps
