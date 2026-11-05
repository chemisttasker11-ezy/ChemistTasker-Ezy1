#!/usr/bin/env bash
# Local wave gate. Run: bash docs/mobile/agent-kit/gate.sh <worktree>
# An error in ANY gate must exit nonzero (do not pipe test output into grep).
set -euo pipefail

if [ "$#" -ne 1 ] || [ ! -d "$1/frontend_mobile" ]; then
  echo "Usage: bash docs/mobile/agent-kit/gate.sh <worktree>" >&2
  exit 2
fi

worktree="$(cd "$1" && pwd)"
cd "$worktree/frontend_mobile"

npx_command="npx"
if command -v npx.cmd >/dev/null 2>&1; then
  npx_command="npx.cmd"
fi

logs="$(mktemp -d)"
trap 'rm -rf "$logs"' EXIT

run_gate() {
  label="$1"
  shift
  echo "== $label =="
  if "$@" > "$logs/gate.log" 2>&1; then
    tail -n 10 "$logs/gate.log"
  else
    cat "$logs/gate.log" >&2
    echo "FAILED: $label" >&2
    return 1
  fi
}

echo "Wave gate at $(git rev-parse HEAD)"
run_gate "Expo TypeScript" "$npx_command" tsc --noEmit
run_gate "Expo lint" "$npx_command" expo lint

# Warn if a wave introduces warnings above the previously reviewed baseline.
warning_count="$(grep -Eo '[0-9]+ warnings?' "$logs/gate.log" | tail -n 1 | cut -d ' ' -f 1 || true)"
warning_count="${warning_count:-0}"
if [ "$warning_count" -gt "${MAX_LINT_WARNINGS:-34}" ]; then
  echo "FAILED: lint warnings increased to $warning_count (baseline 34)" >&2
  exit 1
fi

mapfile -d '' -t tests < <(git ls-files -z --cached --others --exclude-standard -- '*.test.mjs')
if [ "${#tests[@]}" -eq 0 ]; then
  echo "FAILED: no mobile node tests discovered" >&2
  exit 1
fi
run_gate "Mobile node tests (${#tests[@]} files)" node --test "${tests[@]}"

cd "$worktree"
run_gate "Shared-core strict transport ownership" node scripts/audit-shared-core-boundary.mjs --strict
run_gate "Expo architecture invariants" node --test scripts/test-expo-architecture-no-drift.mjs
run_gate "Native route contract" node scripts/audit-native-tab-routes.mjs
run_gate "Git whitespace" git diff --check

cd "$worktree/frontend_mobile"
mapfile -d '' -t changed < <(
  git diff --name-only --diff-filter=ACMR -z HEAD -- .;
  git ls-files --others --exclude-standard -z -- .;
)
for file in "${changed[@]}"; do
  [ -f "$file" ] || continue
  case "$file" in
    *.ts|*.tsx|*.js|*.mjs|*.json|*.md|*.sh)
      node - "$file" <<'CHECK_EOL'
const fs = require('node:fs');
const file = process.argv[2];
const content = fs.readFileSync(file, 'utf8');
const endings = content.match(/\n/g)?.length ?? 0;
const crlf = content.match(/\r\n/g)?.length ?? 0;
if (crlf > 0 && crlf !== endings) {
  console.error(`FAILED: mixed LF/CRLF line endings in ${file} (${crlf}/${endings})`);
  process.exit(1);
}
CHECK_EOL
      ;;
  esac
done
echo "PASS: line endings, typecheck, lint, node tests, boundaries, architecture, navigation"
git diff --shortstat HEAD
