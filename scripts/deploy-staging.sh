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
if [[ "${1:-}" == "--with-workers" ]]; then
  compose --profile workers up -d --build --wait --wait-timeout 300
else
  compose up -d --build --wait --wait-timeout 300
  compose stop celery_worker celery_beat >/dev/null 2>&1 || true
fi

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
