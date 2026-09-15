# Antigravity execution queue

## User's latest routing instruction (2026-09-15)

All upcoming execution tasks go to Antigravity Gemini Flash through the CLI
terminal only. No computer/UI automation. Astra coordinates, reviews compact
results and reports checkpoints. Do not start additional Codex workers by default.
If a Codex worker is later used, use low-to-medium reasoning, not high;
do not select fast mode. This is an execution preference, not a claim that global
model settings or service tiers have been changed.

The current Codex high-reasoning attendance foundation worker is finishing its
already-running checkpoint. Do not edit its backend/test files until it has
finished and Astra explicitly dispatches the next implementation checkpoint.

## Immediate task: save the updated policy only

Read ROSTER-ATTENDANCE-PLAN.md. Update only its delegation-policy section to match
the routing above, preserving all original-backend protection, no-push and
checkpoint rules. The older policy preferring Codex for heavy tasks is superseded
by the user's latest instruction assigning upcoming execution to Antigravity.
Save a brief completion note as docs/roster-attendance/ANTIGRAVITY-QUEUE-RESULT.md.
No code edits, tests, migration application, old patch acceptance/rejection, or
database access in this immediate task. Stop after saving the policy and note.

## Subsequent queue (execute only the next explicitly dispatched checkpoint)

Use the user's original requirements in ROSTER-ATTENDANCE-PLAN.md. After reviewing
docs/roster-attendance/REPAIR-CHECKPOINT.md, continue unfinished work in small to
medium checkpoints: foundation verification, attendance eligibility, kiosk/QR/PIN
services, attendance transitions/API, approvals/backfill/corrections, attendance
screens, roster publication/validation, copy/templates/bulk operations, roster UI,
worker actions/escalation, final acceptance. Do not redo completed foundation work.

Deployment migration recovery is separate from implementation/testing progress.
Never fabricate missing historical migrations, silently fake a baseline, apply
the quarantined 0044, or run schema changes against the existing configured DB.
Use only an explicitly isolated disposable test database for schema-dependent
tests. Original backend models, API contracts, unrelated changes and user data
must remain intact. No parallel writers to the same files, no commit or push.

Each dispatch must name exact allowed files, acceptance checks and a stop point.
Each result must state changed files, actual test results and unresolved issues
in a compact saved report. Follow-up questions or progress do not authorize
starting the entire queue at once. Stop after each completed checkpoint for the
user, as originally requested.
