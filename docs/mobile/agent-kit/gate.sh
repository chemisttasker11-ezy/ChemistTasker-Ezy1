#!/usr/bin/env bash
# Orchestrator gate for a wave worktree: tsc, lint, node tests, diff size, CRLF check. Usage: gate.sh <worktree>
cd "$1/frontend_mobile" || exit 1
npx.cmd tsc --noEmit > /tmp/gate-tsc.txt 2>&1; echo "tsc exit=$?"; grep -m3 "error TS" /tmp/gate-tsc.txt
npx.cmd expo lint 2>&1 | grep -E "problems|✖ [0-9]+ error"
node --test roles/shared/shifts/*.test.mjs $(git ls-files --others --exclude-standard -- '*.test.mjs' | grep -v '^roles/shared/shifts/') 2>&1 | grep -E "^# (pass|fail)" | tr '\n' ' '; echo
git diff --shortstat; git status --short | grep '^??'
for f in $(git diff --name-only --relative); do c=$(grep -c $'\r$' "$f"); l=$(wc -l < "$f"); [ "$c" != "$l" ] && echo "EOL mix: $f $c/$l"; done; echo "eol checked"
