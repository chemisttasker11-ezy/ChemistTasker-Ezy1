#!/usr/bin/env bash
set -euo pipefail
: "${TESTED_SHA:?exact candidate required}"
: "${PG_SERVICE_CONTAINER:?disposable PostgreSQL service container required}"
test "$APP_ENV" = test
test "$LOCAL_DB_NAME" = ct_release_candidate
test "$LOCAL_DB_HOST" = 127.0.0.1
test "$(git rev-parse HEAD)" = "$TESTED_SHA"
evidence="$PWD/.qa-artifacts/candidate-recovery"
mkdir -p "$evidence"
git fetch origin main
baseline="$(git rev-parse origin/main)"
git merge-base --is-ancestor "$baseline" "$TESTED_SHA"
printf 'candidate=%s\nbaseline=%s\n' "$TESTED_SHA" "$baseline" > "$evidence/source-identity.txt"
baseline_dir="$(mktemp -d)"
git worktree add --detach "$baseline_dir" "$baseline"
trap 'git worktree remove --force "$baseline_dir"' EXIT
# Use the same synthetic seed and identity checks against the historical code.
cp backend/core/test_recovery_fixture.py "$evidence/recovery_fixture.py"
(cd "$baseline_dir" && python backend/manage.py migrate --noinput --settings=core.postgres_test_settings)
(cd "$baseline_dir" && PYTHONPATH="$evidence:$baseline_dir/backend" python backend/manage.py shell --settings=core.postgres_test_settings -c "from recovery_fixture import seed_baseline, inventory; seed_baseline(); inventory('$evidence/baseline.json')")
docker exec "$PG_SERVICE_CONTAINER" pg_dump -U postgres -Fc ct_release_candidate > "$evidence/before-upgrade.dump"
python backend/manage.py migrate --noinput --settings=core.postgres_test_settings
python backend/manage.py makemigrations --check --dry-run --settings=core.postgres_test_settings
python backend/manage.py shell --settings=core.postgres_test_settings -c "from core.test_recovery_fixture import verify_identity, seed_candidate, inventory; verify_identity(); inventory('$evidence/upgraded.json'); seed_candidate(); inventory('$evidence/candidate.json')"
docker exec "$PG_SERVICE_CONTAINER" pg_dump -U postgres -Fc ct_release_candidate > "$evidence/candidate.dump"
for db in ct_release_candidate_restore ct_release_baseline_restore; do
  docker exec "$PG_SERVICE_CONTAINER" createdb -U postgres "$db"
done
docker exec -i "$PG_SERVICE_CONTAINER" pg_restore -U postgres -d ct_release_candidate_restore --exit-on-error < "$evidence/candidate.dump"
LOCAL_DB_NAME=ct_release_candidate_restore python backend/manage.py shell --settings=core.postgres_test_settings -c "from core.test_recovery_fixture import verify_candidate, inventory; verify_candidate(); inventory('$evidence/restored-candidate.json')"
python scripts/compare-recovery-inventories.py "$evidence/candidate.json" "$evidence/restored-candidate.json"
docker exec -i "$PG_SERVICE_CONTAINER" pg_restore -U postgres -d ct_release_baseline_restore --exit-on-error < "$evidence/before-upgrade.dump"
(cd "$baseline_dir" && LOCAL_DB_NAME=ct_release_baseline_restore PYTHONPATH="$evidence:$baseline_dir/backend" python backend/manage.py shell --settings=core.postgres_test_settings -c "from recovery_fixture import inventory; inventory('$evidence/restored-baseline.json')")
python scripts/compare-recovery-inventories.py "$evidence/baseline.json" "$evidence/restored-baseline.json"
# Compare all pre-existing application rows before adding candidate-only fixtures.
python - "$evidence" <<'PY'
import json,sys
from pathlib import Path
p=Path(sys.argv[1]); before=json.loads((p/'baseline.json').read_text()); after=json.loads((p/'candidate.json').read_text())
upgraded=json.loads((p/'upgraded.json').read_text())
assert before['encrypted_identity'] == upgraded['encrypted_identity'] == after['encrypted_identity']
# Django migrations and generated content types/permissions legitimately evolve.
metadata = {'django_migrations', 'django_content_type', 'auth_permission'}
for table, fingerprint in before['tables'].items():
    if table not in metadata:
        assert upgraded['tables'].get(table) == fingerprint, f'Pre-existing rows changed: {table}'
print('CANDIDATE_RESTORE_AND_BASELINE_ROLLBACK=PASS')
PY
printf 'CANDIDATE_RESTORE_AND_BASELINE_ROLLBACK=PASS\n' > "$evidence/result.txt"
