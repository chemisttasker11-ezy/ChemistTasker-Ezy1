#!/usr/bin/env bash
set -euo pipefail
umask 077

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
frontend_only=0; with_workers=1
expected_sha="${STAGING_EXPECTED_SHA:-}"
while (($#)); do
  case "$1" in
    --frontend-only) frontend_only=1 ;;
    --without-workers) with_workers=0 ;;
    --with-workers) with_workers=1 ;;
    --expected-sha) shift; expected_sha="${1:-}" ;;
    *) echo 'Usage: deploy-staging.sh --expected-sha FULL_SHA [--frontend-only|--without-workers]' >&2; exit 2 ;;
  esac
  shift
done
[[ "$expected_sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'A full STAGING_EXPECTED_SHA or --expected-sha is required.' >&2; exit 2; }
[[ "$(git rev-parse HEAD)" == "$expected_sha" ]] || { echo 'Expected SHA does not match checkout.' >&2; exit 1; }
[[ -z "$(git status --porcelain)" ]] || { echo 'Refusing a dirty deployment checkout.' >&2; exit 1; }

OPS_DIR="${STAGING_OPS_DIR:-/opt/apps/chemisttasker-staging-ops}"
[[ ! -L "$OPS_DIR" && ! -L "$OPS_DIR/deploy.lock" && ! -L "$OPS_DIR/deployed.commit" ]] || { echo 'Refusing symlinked release state.' >&2; exit 1; }
mkdir -p "$OPS_DIR"
chmod 700 "$OPS_DIR"
exec 9>"$OPS_DIR/deploy.lock"
flock -n 9 || { echo 'Another staging deployment holds the release lock.' >&2; exit 1; }
attempt_dir="$(mktemp -d "$OPS_DIR/release-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX")"
phase=preflight; web_started=0; workers_started=0; backup=''
finish() {
  code=$?
  trap - EXIT
  set +e
  printf '%s\n' "$phase" > "$attempt_dir/phase"
  if ((code)); then
    printf '%s\n' "$code" > "$attempt_dir/failed.exit"
    # Request graceful cleanup only for services this release started. Never force
    # a migration/task to stop; its external effects may already have committed.
    services=()
    if ((workers_started)); then services+=(celery_beat celery_worker); fi
    if ((web_started)); then services+=(web); fi
    for service in "${services[@]}"; do
      id="$(compose --profile workers ps --all -q "$service")"
      if [[ -n "$id" ]]; then docker kill --signal=TERM "$id" >/dev/null 2>&1; fi
    done
    echo "Release failed in phase $phase; inspect private record $attempt_dir. No DB restore was attempted." >&2
  fi
  exit "$code"
}
trap finish EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

SECRETS_FILE=env/staging.secrets.env
RUNTIME_FILE=env/staging.runtime.env
INTEGRATIONS_FILE=env/staging.integrations.env
WEB_FILE=env/staging.web.env
for file in "$SECRETS_FILE" "$RUNTIME_FILE" "$INTEGRATIONS_FILE" "$WEB_FILE"; do
  [[ -s "$file" && ! -L "$file" ]] || { echo "Missing or symlinked staging environment file: $file" >&2; exit 1; }
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
  docker compose --env-file "$SECRETS_FILE" --env-file "$RUNTIME_FILE" \
    --env-file "$INTEGRATIONS_FILE" --env-file "$WEB_FILE" "${COMPOSE_FILES[@]}" "$@"
}
compose config --quiet
compose --profile release config --format json | python3 scripts/staging_provider_preflight.py
if [[ "$resource_budget" == 1 ]]; then
  compose --profile workers --profile release config --format json | python3 scripts/staging_resource_budget.py
fi
sha256sum "$SECRETS_FILE" "$RUNTIME_FILE" "$INTEGRATIONS_FILE" "$WEB_FILE" > "$attempt_dir/env.before"
container_state() {
  for name in "$@"; do
    if docker inspect -f '{{.Id}}' "$name" >/dev/null 2>&1; then
      printf '%s ' "$name"
      docker inspect -f '{{.Id}} {{.Image}} {{range $n, $v := .NetworkSettings.Networks}}{{$n}}={{$v.IPAddress}};{{end}}' "$name"
    fi
  done
}
protected_state() { container_state chemisttasker_postgres_staging chemisttasker_redis_staging; }
production_state() {
  container_state shared_nginx shared_redis chemisttasker_backend_prod chemisttasker_frontend_prod chemisttasker_celery_prod chemisttasker_celery_beat_prod
}
protected_state > "$attempt_dir/protected.before"
production_state > "$attempt_dir/production.before"
application_images() {
  for service in web celery_worker celery_beat frontend landing; do
    id="$(compose ps --all -q "$service")"
    if [[ -n "$id" ]]; then printf '%s ' "$service"; docker inspect -f '{{.Id}} {{.Image}}' "$id"; fi
  done
}
application_images > "$attempt_dir/previous-images"
gateway_id="$(compose ps --all -q gateway)"
gateway_networks=''
if [[ -n "$gateway_id" && "$(docker inspect -f '{{.State.Running}}' "$gateway_id")" == true ]]; then
  gateway_networks="$(docker inspect -f '{{range $name, $network := .NetworkSettings.Networks}}{{$name}}={{$network.IPAddress}}/{{$network.GlobalIPv6Address}};{{end}}' "$gateway_id")"
fi

# Test the CHECKED-OUT file, not a running container's possibly stale bind inode.
# Host aliases avoid requiring healthy/live upstream DNS during recovery.
gateway_image="$(compose config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["gateway"]["image"])')"
docker run --rm --network none --memory 128m --cpus 0.5 --pids-limit 64 \
  --add-host web:127.0.0.1 --add-host frontend:127.0.0.1 --add-host landing:127.0.0.1 \
  --mount "type=bind,source=$ROOT_DIR/nginx/staging.conf,target=/etc/nginx/conf.d/default.conf,readonly" \
  --entrypoint nginx "$gateway_image" -t
if ((!frontend_only)); then
  run_migrations="$(compose --profile release config --format json | python3 -c 'import json,sys; print(json.load(sys.stdin)["services"]["migration"]["environment"].get("RUN_MIGRATIONS", ""))')"
  [[ "$run_migrations" == 1 ]] || { echo 'Migration execution is disabled; explicitly resolve the refreshed database state before backend release.' >&2; exit 1; }
  if docker inspect -f '{{.Id}}' chemisttasker_staging_migrate >/dev/null 2>&1; then
    echo 'A prior migration container exists (running or stopped); inspect and reconcile it before another release.' >&2; exit 1
  fi
fi

if ((frontend_only)); then
  web_id="$(compose ps --all -q web)"
  [[ -n "$web_id" && "$(docker inspect -f '{{.State.Running}}' "$web_id")" == true ]] || {
    echo 'Frontend-only release requires running web for gateway DNS; complete backend recovery first.' >&2; exit 1;
  }
fi

check_protected_policy() {
  policy="$(docker exec chemisttasker_redis_staging redis-cli --raw CONFIG GET maxmemory-policy | tail -n 1)"
  [[ "$policy" == noeviction ]] || { echo 'Protected Redis must use noeviction; complete docs/ops/REDIS_ROLE_ISOLATION.md before retrying.' >&2; exit 1; }
}
if ((!frontend_only)); then check_protected_policy; fi

phase=build
if ((frontend_only)); then compose build frontend landing; else compose build web frontend landing; fi

if ((!frontend_only)); then
  docker ps --format '{{.Names}}' | grep -qx chemisttasker_postgres_staging || { echo 'A running staging database is required before backend release.' >&2; exit 1; }
  check_protected_policy
  BACKUP_DIR="${STAGING_BACKUP_DIR:-/opt/backups/chemisttasker}"
  mkdir -p "$BACKUP_DIR"
  python3 scripts/staging_backup_preflight.py "$BACKUP_DIR"
  phase=quiesce
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
      running="$(docker inspect -f '{{.State.Running}}' "$id")"
      exit_code="$(docker inspect -f '{{.State.ExitCode}}' "$id")"
      oom="$(docker inspect -f '{{.State.OOMKilled}}' "$id")"
      [[ "$running" == false && "$oom" == false && ( "$exit_code" == 0 || "$exit_code" == 143 ) ]] || {
        echo "Writer $service has not stopped safely; it was NOT force-killed. Reconcile before continuing." >&2; exit 1;
      }
    fi
  done
  phase=backup
  partial="$(mktemp "$BACKUP_DIR/staging-predeploy-$(date -u +%Y%m%dT%H%M%SZ)-XXXXXX.dump.partial")"
  docker exec chemisttasker_postgres_staging pg_dump -U chemisttasker_staging -d chemisttasker_staging -Fc > "$partial"
  docker exec -i chemisttasker_postgres_staging pg_restore --list < "$partial" >/dev/null
  docker exec -i chemisttasker_postgres_staging pg_restore --file=/dev/null < "$partial"
  backup="${partial%.partial}"
  mv "$partial" "$backup"
  printf 'DB_BACKUP=%s\n' "$backup"
  python3 - "$BACKUP_DIR" <<'PY'
from pathlib import Path
import sys
root = Path(sys.argv[1]).resolve()
files = sorted((p for p in root.glob('staging-predeploy-*.dump') if p.is_file() and not p.is_symlink()), key=lambda p: p.stat().st_mtime, reverse=True)
for path in files[10:]:
    assert path.resolve().parent == root
    path.unlink()
PY
  [[ "$(git rev-parse HEAD)" == "$expected_sha" && -z "$(git status --porcelain)" ]] || { echo 'Source changed during build.' >&2; exit 1; }
  sha256sum -c "$attempt_dir/env.before" >/dev/null
  compose up -d --no-recreate --wait --wait-timeout 300 postgres redis redis_cache
  phase=migration
  # No web health deadline and no trap-driven kill can interrupt this one-shot owner.
  printf '%s\n' "$phase" > "$attempt_dir/phase"
  echo "Migration output is retained privately in $attempt_dir/migration.log"
  compose --profile release run -T --rm --no-deps --name chemisttasker_staging_migrate migration < /dev/null > "$attempt_dir/migration.log" 2>&1
  phase=web
  web_started=1
  compose up -d --no-deps --wait --wait-timeout 300 web
fi

phase=frontend
compose up -d --no-deps --wait --wait-timeout 300 frontend landing
phase=gateway
if [[ -n "$gateway_id" ]]; then
  compose restart gateway
  test "$(compose ps --all -q gateway)" = "$gateway_id"
  current_gateway_networks="$(docker inspect -f '{{range $name, $network := .NetworkSettings.Networks}}{{$name}}={{$network.IPAddress}}/{{$network.GlobalIPv6Address}};{{end}}' "$gateway_id")"
  if [[ -n "$gateway_networks" ]]; then
    [[ "$current_gateway_networks" == "$gateway_networks" ]] || { echo 'Gateway address drift; validate the shared route before reopening traffic.' >&2; exit 1; }
  else
    echo 'WARNING: gateway was stopped; verify recovered addresses through the required public smoke.' >&2
  fi
else
  compose up -d --no-deps --wait --wait-timeout 300 gateway
fi
for _ in $(seq 1 30); do
  [[ "$(docker inspect -f '{{.State.Health.Status}}' chemisttasker_gateway_staging)" == healthy ]] && break
  sleep 2
done
[[ "$(docker inspect -f '{{.State.Health.Status}}' chemisttasker_gateway_staging)" == healthy ]] || { echo 'Staging gateway did not become healthy.' >&2; exit 1; }

phase=smoke
staging_url=https://staging.chemisttasker.com.au
bash scripts/smoke-staging.sh "$staging_url"
# Frontend-only releases must not reseed accounts or update backend data.
if [[ "$frontend_only" == "0" ]]; then
phase=seed
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
fi


phase=preservation
sha256sum -c "$attempt_dir/env.before" >/dev/null
protected_state > "$attempt_dir/protected.after"
cmp "$attempt_dir/protected.before" "$attempt_dir/protected.after"
production_state > "$attempt_dir/production.after"
if ! cmp -s "$attempt_dir/production.before" "$attempt_dir/production.after"; then
  echo 'WARNING: production/shared identity drift observed; staging did not target those services. Review private release evidence.' >&2
fi
[[ "$(git rev-parse HEAD)" == "$expected_sha" && -z "$(git status --porcelain)" ]] || { echo 'Source changed during release.' >&2; exit 1; }
if ((!frontend_only && with_workers)); then
  phase=workers
  workers_started=1
  compose --profile workers up -d --no-deps --wait --wait-timeout 300 celery_worker
  compose --profile workers up -d --no-deps --wait --wait-timeout 300 celery_beat
fi
sha256sum -c "$attempt_dir/env.before" >/dev/null
[[ "$(git rev-parse HEAD)" == "$expected_sha" && -z "$(git status --porcelain)" ]] || { echo 'Source changed before recording release.' >&2; exit 1; }
application_images > "$attempt_dir/current-images"
compose ps
phase=record
python3 - "$attempt_dir" "$expected_sha" "$backup" "$frontend_only" <<'PY'
from pathlib import Path
import json, os, sys
root = Path(sys.argv[1])
record = {'sha': sys.argv[2], 'backup': sys.argv[3] or None, 'frontend_only': sys.argv[4] == '1',
          'previous_images': (root/'previous-images').read_text().splitlines(),
          'current_images': (root/'current-images').read_text().splitlines(),
          'protected_state': (root/'protected.after').read_text().splitlines(),
          'production_before': (root/'production.before').read_text().splitlines(),
          'production_after': (root/'production.after').read_text().splitlines(), 'status': 'passed'}
(root/'release.json').write_text(json.dumps(record, indent=2)+'\n')
temporary = root.parent/'deployed.commit.tmp'
temporary.write_text(sys.argv[2]+'\n')
os.replace(temporary, root.parent/'deployed.commit')
PY
phase=complete
printf 'STAGING_URL=%s\nRELEASE_RECORD=%s\n' "$staging_url" "$attempt_dir/release.json"
