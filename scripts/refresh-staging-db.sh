#!/usr/bin/env bash
set -euo pipefail
umask 077
trap 'exit 129' HUP

usage() {
  echo "Usage: $0 --expected-sha FULL_SHA --confirm-production-data /opt/backups/chemisttasker/<backup>.dump" >&2
  exit 2
}
expected_sha="${STAGING_EXPECTED_SHA:-}"
backup_path=''
while (($#)); do
  case "$1" in
    --expected-sha)
      (($# >= 2)) || usage
      expected_sha="$2"; shift 2 ;;
    --confirm-production-data)
      (($# >= 2)) || usage
      backup_path="$2"; shift 2 ;;
    *) usage ;;
  esac
done
[[ -n "$backup_path" ]] || usage
case "$backup_path" in
  /opt/backups/chemisttasker/*.dump) ;;
  *) echo "Backup must be under /opt/backups/chemisttasker and end in .dump" >&2; exit 2 ;;
esac

test -s "$backup_path"

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

[[ "$expected_sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'A full STAGING_EXPECTED_SHA or --expected-sha is required.' >&2; exit 2; }
check_reviewed_source() {
  [[ "$(git rev-parse HEAD)" == "$expected_sha" ]] || { echo 'Expected SHA does not match refresh checkout.' >&2; exit 1; }
  [[ -z "$(git status --porcelain)" ]] || { echo 'Refusing a dirty refresh checkout.' >&2; exit 1; }
}
check_reviewed_source

# Share the release lock: a destructive data refresh must never overlap deployment.
OPS_DIR="${STAGING_OPS_DIR:-/opt/apps/chemisttasker-staging-ops}"
[[ ! -L "$OPS_DIR" && ! -L "$OPS_DIR/deploy.lock" ]] || { echo "Refusing symlinked release lock." >&2; exit 1; }
(umask 077; mkdir -p "$OPS_DIR")
chmod 700 "$OPS_DIR"
exec 9>"$OPS_DIR/deploy.lock"
flock -n 9 || { echo "Another staging maintenance/release holds the lock." >&2; exit 1; }

SECRETS_FILE="env/staging.secrets.env"
RUNTIME_FILE="env/staging.runtime.env"
INTEGRATIONS_FILE="env/staging.integrations.env"
WEB_FILE="env/staging.web.env"

for file in "$SECRETS_FILE" "$RUNTIME_FILE" "$INTEGRATIONS_FILE" "$WEB_FILE"; do
  test -s "$file" || { echo "Missing staging environment file: $file" >&2; exit 1; }
done

# Explicit shell-level acknowledgement after representative-load acceptance.
resource_budget="${STAGING_RESOURCE_BUDGET_APPROVED:-0}"
[[ "$resource_budget" == 0 || "$resource_budget" == 1 ]] || { echo 'STAGING_RESOURCE_BUDGET_APPROVED must be 0 or 1.' >&2; exit 1; }
COMPOSE_FILES=(-f docker-compose.staging.yml)
if [[ "$resource_budget" == 1 ]]; then COMPOSE_FILES+=(-f docker-compose.staging.resources.yml); fi

# Do not silently remove accepted limits when an operator omits the overlay flag.
if [[ "$resource_budget" == 0 ]]; then
  running_names="$(docker ps --all --format '{{.Names}}')"
  retained_names="$(printf '%s\n' "$running_names" | grep -E '^chemisttasker_(postgres_staging|redis_staging|backend_staging|celery_staging|celery_beat_staging|frontend_staging|public_staging|gateway_staging|staging_migrate)$' || true)"
  if [[ -n "$retained_names" ]]; then
    mapfile -t retained <<< "$retained_names"
    limits="$(docker inspect -f '{{.HostConfig.Memory}} {{.HostConfig.NanoCpus}} {{.HostConfig.PidsLimit}}' "${retained[@]}")"
    if printf '%s\n' "$limits" | awk '($1+0)>0 || ($2+0)>0 || ($3+0)>0 {found=1} END {exit !found}'; then
      echo 'Existing staging limits detected. Use STAGING_RESOURCE_BUDGET_APPROVED=1 or a reviewed runtime-limit rollback; refusing implicit limit removal.' >&2
      exit 1
    fi
  fi
fi

compose() {
  docker compose \
    --env-file "$SECRETS_FILE" \
    --env-file "$RUNTIME_FILE" \
    --env-file "$INTEGRATIONS_FILE" \
    --env-file "$WEB_FILE" \
    "${COMPOSE_FILES[@]}" \
    "$@"
}

compose --profile release config --format json | python3 scripts/staging_provider_preflight.py
if [[ "$resource_budget" == 1 ]]; then
  compose --profile workers --profile release config --format json | python3 scripts/staging_resource_budget.py
fi

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
restore_input="/tmp/production-refresh-${timestamp}-$$.dump"
partial=''; input_staged=0
cleanup_refresh() {
  # Never leave an unvalidated rollback archive or a staged production copy behind.
  if [[ -n "$partial" ]]; then rm -f "$partial"; fi
  if ((input_staged)); then docker exec chemisttasker_postgres_staging rm -f "$restore_input" >/dev/null 2>&1 || true; fi
}
trap cleanup_refresh EXIT

mkdir -p "$rollback_dir"
chmod 700 "$rollback_dir"

if docker inspect -f '{{.Id}}' chemisttasker_staging_migrate >/dev/null 2>&1; then
  echo 'A prior migration/static container exists (running or stopped); inspect and reconcile it before refreshing data.' >&2; exit 1
fi
gateway_id="$(compose ps --all -q gateway)"
[[ -n "$gateway_id" ]] || { echo "DB refresh requires the existing staging gateway; install it in a separate maintenance step." >&2; exit 1; }
[[ "$(docker inspect -f '{{.State.Running}}' "$gateway_id")" == true ]] || {
  echo "Start and verify the existing gateway before a destructive DB refresh; no data was changed." >&2; exit 1;
}
gateway_networks="$(docker inspect -f '{{range $name, $network := .NetworkSettings.Networks}}{{$name}}={{$network.IPAddress}}/{{$network.GlobalIPv6Address}};{{end}}' "$gateway_id")"
compose up -d --no-recreate --wait postgres redis redis_cache
# Queue/security state must be protected before changing application topology.
policy="$(docker exec chemisttasker_redis_staging redis-cli --raw CONFIG GET maxmemory-policy | tail -n 1)"
[[ "$policy" == noeviction ]] || { echo 'Protected Redis must use noeviction; complete docs/ops/REDIS_ROLE_ISOLATION.md before retrying.' >&2; exit 1; }
# Build and stage the complete input before pausing writers or destroying schema.
compose build web frontend landing
check_reviewed_source
policy="$(docker exec chemisttasker_redis_staging redis-cli --raw CONFIG GET maxmemory-policy | tail -n 1)"
[[ "$policy" == noeviction ]] || { echo 'Protected Redis policy changed during build; see docs/ops/REDIS_ROLE_ISOLATION.md.' >&2; exit 1; }
python3 scripts/staging_backup_preflight.py "$rollback_dir" "$backup_path"
input_staged=1
docker cp "$backup_path" "chemisttasker_postgres_staging:$restore_input"
docker exec chemisttasker_postgres_staging pg_restore --list "$restore_input" >/dev/null
docker exec chemisttasker_postgres_staging pg_restore --file=/dev/null "$restore_input"
check_reviewed_source
# Drain writers without force-killing a task or an in-flight request before backup.
grace="${STAGING_STOP_TIMEOUT:-120}"
[[ "$grace" =~ ^[1-9][0-9]*$ && "$grace" -le 3600 ]] || { echo 'Invalid writer grace period.' >&2; exit 1; }
for service in celery_beat celery_worker web; do
  id="$(compose --profile workers ps --all -q "$service")"
  if [[ -n "$id" && "$(docker inspect -f '{{.State.Running}}' "$id")" == true ]]; then
    docker kill --signal=TERM "$id" >/dev/null
    for ((waited=0; waited<grace; waited++)); do
      [[ "$(docker inspect -f '{{.State.Running}}' "$id")" == false ]] && break
      sleep 1
    done
    [[ "$(docker inspect -f '{{.State.Running}}' "$id")" == false
       && "$(docker inspect -f '{{.State.OOMKilled}}' "$id")" == false ]] || {
      echo "Writer $service did not stop safely; no force-kill or restore was attempted." >&2; exit 1;
    }
    code="$(docker inspect -f '{{.State.ExitCode}}' "$id")"
    [[ "$code" == 0 || "$code" == 143 ]] || { echo "Writer $service exited abnormally; reconcile before restoring." >&2; exit 1; }
  fi
done
compose stop gateway landing frontend

partial="$(mktemp "$rollback_dir/staging-before-production-refresh-${timestamp}-XXXXXX.dump.partial")"
docker exec chemisttasker_postgres_staging \
  pg_dump --format=custom --compress=9 --no-owner --no-acl \
  --username=chemisttasker_staging --dbname=chemisttasker_staging \
  > "$partial"
# Confirm the rollback archive is readable before destroying the staging schema.
docker exec -i chemisttasker_postgres_staging pg_restore --list < "$partial" >/dev/null
docker exec -i chemisttasker_postgres_staging pg_restore --file=/dev/null < "$partial"
rollback_path="${partial%.partial}"
mv "$partial" "$rollback_path"
echo "Rollback backup: $rollback_path"
check_reviewed_source

docker exec chemisttasker_postgres_staging \
  psql --username=chemisttasker_staging --dbname=chemisttasker_staging \
  --set ON_ERROR_STOP=1 \
  --command="DROP SCHEMA IF EXISTS public CASCADE;"

docker exec chemisttasker_postgres_staging \
  pg_restore --exit-on-error --no-owner --no-acl \
  --username=chemisttasker_staging --dbname=chemisttasker_staging \
  "$restore_input"
docker exec chemisttasker_postgres_staging rm "$restore_input"
input_staged=0

bash scripts/reconcile-staging-migration-history.sh

set_runtime_value STAGING_RUN_MIGRATIONS 0

docker exec chemisttasker_postgres_staging \
  psql --username=chemisttasker_staging --dbname=chemisttasker_staging \
  --set ON_ERROR_STOP=1 --tuples-only --no-align \
  --command="SELECT 'users=' || count(*) FROM users_user
             UNION ALL SELECT 'pharmacies=' || count(*) FROM client_profile_pharmacy
             UNION ALL SELECT 'memberships=' || count(*) FROM client_profile_membership;"

# Prepare current static assets without applying schema changes to restored data.
compose --profile release run -T --rm --no-deps --name chemisttasker_staging_migrate -e RUN_MIGRATIONS=0 migration < /dev/null
compose up -d --no-deps --wait --wait-timeout 300 web frontend landing
compose start gateway
test "$(compose ps --all -q gateway)" = "$gateway_id"
current_gateway_networks="$(docker inspect -f '{{range $name, $network := .NetworkSettings.Networks}}{{$name}}={{$network.IPAddress}}/{{$network.GlobalIPv6Address}};{{end}}' "$gateway_id")"
if [[ "$current_gateway_networks" != "$gateway_networks" ]]; then
  printf 'Gateway address changed. Expected: %s Observed: %s. Validate the shared proxy route before serving traffic.\n' "$gateway_networks" "$current_gateway_networks" >&2
  exit 1
fi

echo "Restored production data into the isolated staging PostgreSQL container."
echo "Automatic migrations and Celery workers remain disabled."
for _ in $(seq 1 30); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' "$gateway_id")" == healthy ]] && break
  sleep 2
done
[[ "$(docker inspect -f '{{.State.Health.Status}}' "$gateway_id")" == healthy ]] || { echo 'Staging gateway did not become healthy after refresh.' >&2; exit 1; }
bash scripts/smoke-staging.sh https://staging.chemisttasker.com.au
check_reviewed_source
compose ps
