#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p env
SECRETS_FILE="env/staging.secrets.env"
RUNTIME_FILE="env/staging.runtime.env"
INTEGRATIONS_FILE="env/staging.integrations.env"
PRODUCTION_ENV_DIR="${PRODUCTION_ENV_DIR:-/opt/apps/chemisttasker/env}"

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
    printf 'STAGING_PUBLIC_URL=%q\n' "https://preview.invalid"
    printf 'STAGING_ALLOWED_HOSTS=%q\n' "localhost,127.0.0.1,web"
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

: "${STAGING_WEB_MAPS_API_KEY:?STAGING_WEB_MAPS_API_KEY is required}"
: "${STAGING_RECAPTCHA_SITE_KEY:?STAGING_RECAPTCHA_SITE_KEY is required}"
: "${STAGING_RECAPTCHA_SECRET_KEY:?STAGING_RECAPTCHA_SECRET_KEY is required}"

compose() {
  docker compose -f docker-compose.staging.yml "$@"
}

compose up -d --build

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
if [[ "${STAGING_PUBLIC_URL:-}" != "$preview_url" || "${STAGING_ALLOWED_HOSTS:-}" != "$preview_host" ]]; then
  umask 077
  {
    printf 'STAGING_PUBLIC_URL=%q\n' "$preview_url"
    printf 'STAGING_ALLOWED_HOSTS=%q\n' "$preview_host"
  } > "$RUNTIME_FILE"
  export STAGING_PUBLIC_URL="$preview_url"
  export STAGING_ALLOWED_HOSTS="$preview_host"
  compose up -d --build landing web celery_worker celery_beat gateway
fi

for _ in $(seq 1 60); do
  if curl -fsS --max-time 10 "$preview_url/" >/dev/null; then
    break
  fi
  sleep 2
done

printf 'PREVIEW_URL=%s\n' "$preview_url"
compose ps
