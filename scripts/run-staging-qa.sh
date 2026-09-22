#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

run_id="${GITHUB_RUN_ID:-local}-${GITHUB_RUN_ATTEMPT:-1}"
backend_image="chemisttasker-qa-backend:${run_id}"
qa_network="chemisttasker-qa-${run_id}"
pg_container="chemisttasker-qa-postgres-${run_id}"

cleanup() {
  docker rm -f "$pg_container" >/dev/null 2>&1 || true
  docker network rm "$qa_network" >/dev/null 2>&1 || true
  docker image rm "$backend_image" >/dev/null 2>&1 || true
}
trap cleanup EXIT

echo "== JavaScript / TypeScript QA =="
docker run --rm   -v "$ROOT_DIR:/src:ro"   -e CI=1   node:22-bookworm   bash -lc '
    set -euo pipefail
    cp -a /src /work
    cd /work

    cd shared-core
    npm ci
    npm run typecheck
    npm run test:ci
    npm run build
    mkdir -p ../.qa-artifacts
    npm pack --pack-destination ../.qa-artifacts

    cd ../frontend_web
    npm ci
    npm install --no-save --package-lock=false --ignore-scripts ../.qa-artifacts/chemisttasker-shared-core-1.1.1.tgz
    npx tsc --noEmit
    node --test scripts/auth-flow.test.mjs
    VITE_API_URL=http://127.0.0.1:8000 VITE_API_BASE_URL=http://127.0.0.1:8000 npx vite build

    cd landing_next
    npm ci
    npm install --no-save --package-lock=false --ignore-scripts ../../.qa-artifacts/chemisttasker-shared-core-1.1.1.tgz
    npm run typecheck
    npm run build

    cd ../../frontend_mobile
    npm ci
    npm install --no-save --package-lock=false --ignore-scripts ../.qa-artifacts/chemisttasker-shared-core-1.1.1.tgz
    npm run lint
    npx tsc --noEmit

    cd ..
    node scripts/audit-shared-core-boundary.mjs --strict
    node scripts/audit-architecture-boundaries.mjs
  '

echo "== Backend QA =="
docker build -t "$backend_image" backend

common_env=(
  -e WAIT_FOR_REDIS=0
  -e RUN_MIGRATIONS=0
  -e COLLECT_STATIC=0
  -e SECRET_KEY=qa-only-secret-key
  -e ADMIN_URL=admin/
  -e EMAIL_HOST_USER=qa@example.test
  -e EMAIL_HOST_PASSWORD=qa-placeholder
  -e DEFAULT_FROM_EMAIL=qa@example.test
  -e RECAPTCHA_SECRET_KEY=qa-placeholder
  -e AZURE_OCR_ENDPOINT=https://example.test
  -e AZURE_OCR_KEY=qa-placeholder
  -e SCRAPINGBEE_API_KEY=qa-placeholder
  -e MOBILEMESSAGE_USERNAME=qa-placeholder
  -e MOBILEMESSAGE_PASSWORD=qa-placeholder
  -e MOBILEMESSAGE_SENDER=ChemistTasker
)

backend_run() {
  docker run --rm "${common_env[@]}" "$backend_image" "$@"
}

backend_run python manage.py check --settings=core.contract_test_settings
backend_run python manage.py makemigrations --check --dry-run --settings=core.contract_test_settings
backend_run python manage.py test users.tests billing.tests --settings=core.contract_test_settings
backend_run python manage.py test marketplace.tests ethical_marketplace.tests --settings=core.contract_test_settings
backend_run python manage.py test public_hub.tests --settings=public_hub.test_settings
backend_run python manage.py test client_profile.test_membership_application_integrity client_profile.test_invoice_integrity --settings=core.contract_test_settings
backend_run python manage.py test workforce.tests worker_finance.tests --settings=core.contract_test_settings
backend_run python manage.py test worker_finance.tests --settings=worker_finance.tests.settings

echo "== PostgreSQL migration / concurrency QA =="
# GitHub Actions provides the healthy PostgreSQL service on localhost.
# Backend tests stay containerised; host networking lets that container use
# the same proven database service as the canonical consolidation workflow.
docker run --rm \
  --network host \
  "${common_env[@]}" \
  -e USE_PROD_DB=False \
  -e LOCAL_DB_NAME=chemisttasker_ci \
  -e LOCAL_DB_USER=postgres \
  -e LOCAL_DB_PASSWORD=postgres \
  -e LOCAL_DB_HOST=127.0.0.1 \
  -e LOCAL_DB_PORT=5432 \
  "$backend_image" \
  python manage.py migrate --noinput --settings=core.postgres_test_settings

docker run --rm \
  --network host \
  "${common_env[@]}" \
  -e USE_PROD_DB=False \
  -e LOCAL_DB_NAME=chemisttasker_ci \
  -e LOCAL_DB_USER=postgres \
  -e LOCAL_DB_PASSWORD=postgres \
  -e LOCAL_DB_HOST=127.0.0.1 \
  -e LOCAL_DB_PORT=5432 \
  "$backend_image" \
  python manage.py test client_profile.test_postgres_concurrency --settings=core.postgres_test_settings

echo "== Tauri / Rust QA =="
docker run --rm   -v "$ROOT_DIR:/src:ro"   rust:1-bookworm   bash -lc '
    set -euo pipefail
    apt-get update
    apt-get install -y --no-install-recommends       build-essential       libayatana-appindicator3-dev       libgtk-3-dev       librsvg2-dev       libssl-dev       libwebkit2gtk-4.1-dev       libxdo-dev       patchelf
    cp -a /src/frontend_web/src-tauri /work
    cd /work
    CARGO_TARGET_DIR=/tmp/chemisttasker-cargo-target /usr/local/cargo/bin/cargo test --locked
  '

echo "QA_SUITE=PASS"
