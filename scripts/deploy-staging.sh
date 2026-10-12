#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p env
SECRETS_FILE="env/staging.secrets.env"
RUNTIME_FILE="env/staging.runtime.env"
INTEGRATIONS_FILE="env/staging.integrations.env"
PRODUCTION_ENV_DIR="${PRODUCTION_ENV_DIR:-/opt/apps/chemisttasker/env}"

# Permanent staging is the safe default. Temporary Cloudflare tunnels are opt-in.
STAGING_PREVIEW_MODE="${STAGING_PREVIEW_MODE:-0}"
case "$STAGING_PREVIEW_MODE" in
  0|1) ;;
  *) echo "STAGING_PREVIEW_MODE must be 0 (permanent) or 1 (temporary tunnel)" >&2; exit 2 ;;
esac

read_dotenv_value() {
  local file="$1"
  local key="$2"
  python3 - "$file" "$key" <<'PY'
import sys
from pathlib import Path

path = Path(sys.argv[1])
key = sys.argv[2]
if not path.exists():
    raise SystemExit(0)

for raw in path.read_text(encoding="utf-8").splitlines():
    line = raw.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    name, value = line.split("=", 1)
    if name.strip() != key:
        continue
    value = value.strip()
    if len(value) >= 2 and value[0] == value[-1] and value[0] in {"'", '"'}:
        value = value[1:-1]
    print(value)
    break
PY
}

if [[ ! -f "$SECRETS_FILE" ]]; then
  umask 077
  {
    printf 'STAGING_POSTGRES_PASSWORD=%q\n' "$(openssl rand -hex 24)"
    printf 'STAGING_DJANGO_SECRET_KEY=%q\n' "$(openssl rand -hex 48)"
  } > "$SECRETS_FILE"
fi

if [[ ! -f "$RUNTIME_FILE" ]]; then
  umask 077
  {
    printf 'STAGING_PUBLIC_URL=%q\n' "https://staging.chemisttasker.com.au"
    printf 'STAGING_ALLOWED_HOSTS=%q\n' "staging.chemisttasker.com.au"
  } > "$RUNTIME_FILE"
fi

if [[ ! -f "$INTEGRATIONS_FILE" ]]; then
  prod_web="$PRODUCTION_ENV_DIR/web.prod.env"
  prod_backend="$PRODUCTION_ENV_DIR/backend.prod.env"

  maps_key="$(read_dotenv_value "$prod_web" "VITE_Maps_API_KEY")"
  recaptcha_site_key="$(read_dotenv_value "$prod_web" "VITE_RECAPTCHA_SITE_KEY")"
  recaptcha_secret_key="$(read_dotenv_value "$prod_backend" "RECAPTCHA_SECRET_KEY")"

  if [[ -z "$maps_key" || -z "$recaptcha_site_key" || -z "$recaptcha_secret_key" ]]; then
    cat >&2 <<'EOF'
Staging browser integrations are not configured.
Create env/staging.integrations.env with:
  STAGING_WEB_MAPS_API_KEY
  STAGING_RECAPTCHA_SITE_KEY
  STAGING_RECAPTCHA_SECRET_KEY

No key value is written to Git, logs, or the workflow summary.
EOF
    exit 1
  fi

  umask 077
  {
    printf 'STAGING_WEB_MAPS_API_KEY=%q\n' "$maps_key"
    printf 'STAGING_RECAPTCHA_SITE_KEY=%q\n' "$recaptcha_site_key"
    printf 'STAGING_RECAPTCHA_SECRET_KEY=%q\n' "$recaptcha_secret_key"
  } > "$INTEGRATIONS_FILE"
fi

set -a
# shellcheck disable=SC1090
source "$SECRETS_FILE"
# shellcheck disable=SC1090
source "$RUNTIME_FILE"
# shellcheck disable=SC1090
source "$INTEGRATIONS_FILE"
set +a

if [[ "$STAGING_PREVIEW_MODE" == "0" ]]; then
  # Upgrade only the obsolete auto-generated tunnel/placeholder configuration.
  # Never replace an existing permanent or custom staging hostname.
  case "${STAGING_PUBLIC_URL:-}" in
    https://preview.invalid|https://*.trycloudflare.com)
      STAGING_PUBLIC_URL="https://staging.chemisttasker.com.au"
      STAGING_ALLOWED_HOSTS="staging.chemisttasker.com.au"
      umask 077
      {
        printf 'STAGING_PUBLIC_URL=%q\n' "$STAGING_PUBLIC_URL"
        printf 'STAGING_ALLOWED_HOSTS=%q\n' "$STAGING_ALLOWED_HOSTS"
      } > "$RUNTIME_FILE"
      export STAGING_PUBLIC_URL STAGING_ALLOWED_HOSTS
      ;;
  esac

  if [[ "${STAGING_PUBLIC_URL:-}" != https://* ]]; then
    echo "Permanent staging requires an HTTPS STAGING_PUBLIC_URL." >&2
    exit 1
  fi
  staging_host="${STAGING_PUBLIC_URL#https://}"
  case ",${STAGING_ALLOWED_HOSTS:-}," in
    *,"$staging_host",*) ;;
    *) echo "STAGING_ALLOWED_HOSTS must include $staging_host." >&2; exit 1 ;;
  esac
fi

: "${STAGING_WEB_MAPS_API_KEY:?STAGING_WEB_MAPS_API_KEY is required}"
: "${STAGING_RECAPTCHA_SITE_KEY:?STAGING_RECAPTCHA_SITE_KEY is required}"
: "${STAGING_RECAPTCHA_SECRET_KEY:?STAGING_RECAPTCHA_SECRET_KEY is required}"

compose() {
  if [[ "$STAGING_PREVIEW_MODE" == "1" ]]; then
    docker compose --profile preview -f docker-compose.staging.yml "$@"
  else
    docker compose -f docker-compose.staging.yml "$@"
  fi
}

# A permanent deployment must not keep a previously started quick tunnel alive.
if [[ "$STAGING_PREVIEW_MODE" == "0" ]]; then
  docker compose --profile preview -f docker-compose.staging.yml stop cloudflared >/dev/null 2>&1 || true
fi

compose up -d --build

target_url="$STAGING_PUBLIC_URL"
if [[ "$STAGING_PREVIEW_MODE" == "1" ]]; then
  preview_url=""
  for _ in $(seq 1 60); do
    preview_url="$(compose logs --no-color cloudflared 2>&1 | grep -Eo 'https://[-a-z0-9]+\.trycloudflare\.com' | tail -n 1 || true)"
    if [[ -n "$preview_url" ]]; then
      break
    fi
    sleep 2
  done

  if [[ -z "$preview_url" ]]; then
    echo "Could not discover the Cloudflare staging URL from cloudflared logs." >&2
    compose ps
    exit 1
  fi

  preview_host="${preview_url#https://}"
  export STAGING_PUBLIC_URL="$preview_url"
  export STAGING_ALLOWED_HOSTS="$preview_host"
  # Only the explicitly requested preview deploy uses a temporary hostname.
  # The permanent env/staging.runtime.env file is never overwritten by preview.
  compose up -d --build web landing celery_worker celery_beat gateway
  target_url="$preview_url"
fi

ready=0
for _ in $(seq 1 60); do
  if curl -fsS --max-time 10 "$target_url/" >/dev/null; then
    ready=1
    break
  fi
  sleep 2
done
if [[ "$ready" != "1" ]]; then
  echo "Staging health check failed at $target_url" >&2
  compose ps
  exit 1
fi

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

printf 'STAGING_URL=%s\n' "$target_url"
if [[ "$STAGING_PREVIEW_MODE" == "1" ]]; then
  printf 'PREVIEW_URL=%s\n' "$target_url"
fi
compose ps
