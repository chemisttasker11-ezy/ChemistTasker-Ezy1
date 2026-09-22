#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

mkdir -p env
SECRETS_FILE="env/staging.secrets.env"
RUNTIME_FILE="env/staging.runtime.env"

if [[ ! -f "$SECRETS_FILE" ]]; then
  umask 077
  {
    printf 'STAGING_POSTGRES_PASSWORD=%s\n' "$(openssl rand -hex 24)"
    printf 'STAGING_DJANGO_SECRET_KEY=%s\n' "$(openssl rand -hex 48)"
  } > "$SECRETS_FILE"
fi

if [[ ! -f "$RUNTIME_FILE" ]]; then
  umask 077
  printf 'STAGING_PUBLIC_URL=https://preview.invalid\n' > "$RUNTIME_FILE"
fi

set -a
# shellcheck disable=SC1090
source "$SECRETS_FILE"
# shellcheck disable=SC1090
source "$RUNTIME_FILE"
set +a

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

if [[ "${STAGING_PUBLIC_URL:-}" != "$preview_url" ]]; then
  umask 077
  printf 'STAGING_PUBLIC_URL=%s\n' "$preview_url" > "$RUNTIME_FILE"
  export STAGING_PUBLIC_URL="$preview_url"
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
