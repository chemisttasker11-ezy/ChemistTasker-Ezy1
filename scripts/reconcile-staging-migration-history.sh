#!/usr/bin/env bash
set -euo pipefail

container="${STAGING_POSTGRES_CONTAINER:-chemisttasker_postgres_staging}"
database="${STAGING_POSTGRES_DATABASE:-chemisttasker_staging}"
user="${STAGING_POSTGRES_USER:-chemisttasker_staging}"

record="$(docker exec "$container" psql --username="$user" --dbname="$database" --tuples-only --no-align --command="SELECT app || '|' || name || '|' || applied FROM django_migrations WHERE app='pharmacy_hub' AND name='0001_initial';")"

if [[ -z "$record" ]]; then
  echo "No stale pharmacy_hub migration record found."
  exit 0
fi

new_table_count="$(docker exec "$container" psql --username="$user" --dbname="$database" --tuples-only --no-align --command="SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'pharmacy_hub_%';")"
legacy_table_count="$(docker exec "$container" psql --username="$user" --dbname="$database" --tuples-only --no-align --command="SELECT count(*) FROM pg_tables WHERE schemaname='public' AND tablename LIKE 'client_profile_pharmacyhub%';")"

if [[ "$new_table_count" -gt 0 ]]; then
  echo "The current pharmacy_hub migration is already applied."
  exit 0
fi

if [[ "$legacy_table_count" -eq 0 ]]; then
  echo "Refusing to change migration history because the physical hub schema is not the expected legacy layout." >&2
  exit 1
fi

docker exec "$container" psql \
  --username="$user" --dbname="$database" --set ON_ERROR_STOP=1 \
  --command="DELETE FROM django_migrations WHERE app='pharmacy_hub' AND name='0001_initial';"

echo "Removed the stale legacy migration record: $record"
echo "Django can now apply the current state-only pharmacy_hub migration."
