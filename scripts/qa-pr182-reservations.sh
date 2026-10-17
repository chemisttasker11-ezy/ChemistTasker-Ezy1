#!/usr/bin/env bash
# Dedicated senior package verification: run only against a disposable checkout/DB.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
echo "PR182 exact source: $(git rev-parse HEAD)"
git diff --check
test -z "$(git status --porcelain)" || { echo "Working tree must be clean"; exit 2; }
: "${SECRET_KEY:=qa-pr182-local-only}"
: "${ADMIN_URL:=admin/}"
export SECRET_KEY ADMIN_URL
export EMAIL_HOST_USER="${EMAIL_HOST_USER:-qa@example.test}"
export EMAIL_HOST_PASSWORD="${EMAIL_HOST_PASSWORD:-qa-placeholder}"
export DEFAULT_FROM_EMAIL="${DEFAULT_FROM_EMAIL:-qa@example.test}"
export RECAPTCHA_SECRET_KEY="${RECAPTCHA_SECRET_KEY:-qa-placeholder}"
export AZURE_OCR_ENDPOINT="${AZURE_OCR_ENDPOINT:-https://example.test}"
export AZURE_OCR_KEY="${AZURE_OCR_KEY:-qa-placeholder}"
export SCRAPINGBEE_API_KEY="${SCRAPINGBEE_API_KEY:-qa-placeholder}"
export MOBILEMESSAGE_USERNAME="${MOBILEMESSAGE_USERNAME:-qa-placeholder}"
export MOBILEMESSAGE_PASSWORD="${MOBILEMESSAGE_PASSWORD:-qa-placeholder}"
export MOBILEMESSAGE_SENDER="${MOBILEMESSAGE_SENDER:-ChemistTasker}"
python3 backend/manage.py check --settings=core.contract_test_settings
python3 backend/manage.py makemigrations --check --dry-run --settings=core.contract_test_settings
python3 backend/manage.py test shifts.test_reservations shifts.test_distribution_boundaries shifts.test_deletion_safety shifts.test_access_escalation_contract workforce.tests.test_roster_escalation billing.tests.StripeWebhookIdempotencyTests core.test_task_contracts --settings=core.contract_test_settings --verbosity=2 --noinput
# Explicit opt-in: never point this at production/staging.
if [ "${PR182_TEST_POSTGRES:-0}" = "1" ]; then
  test "${LOCAL_DB_NAME:-}" = "chemisttasker_ci" || { echo "Expected dedicated chemisttasker_ci database"; exit 3; }
  test "${LOCAL_DB_HOST:-}" = "127.0.0.1" || { echo "PostgreSQL must be disposable localhost service"; exit 3; }
  python3 backend/manage.py migrate --noinput --settings=core.postgres_test_settings
  python3 backend/manage.py test shifts.test_reservations_postgres shifts.test_reservations billing.tests.StripeWebhookIdempotencyTests --settings=core.postgres_test_settings --verbosity=2 --noinput
fi
echo "PR182 targeted tests completed."
