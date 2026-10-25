Work alone: do not start subagents. Run every command in the foreground.

# PR #200 audit: runtime check of two P0 findings (targeted tests only)

Goal: prove or disprove, at runtime, the two P0 findings below. Audit only.

## Rules
- Do NOT change any file in a git repo. Write files ONLY under `C:\dev\worktrees\chemisttasker-pr200\docs\qa\evidence\pr200_finish\runtime\`.
- Run the tests inside the running Docker stack `ct-local` (backend container: find it with `docker ps --filter label=com.docker.compose.project=ct-local`). Its backend code for these two findings is identical to the audit baseline b77e9fd2 (checked: backend/shifts/* unchanged).
- Preferred: a Django test module. Copy it into the backend container (e.g. `docker cp` into the app's `shifts/` package as `tests_pr200_runtime.py`, inside the container only), run `python manage.py test shifts.tests_pr200_runtime -v 2` in the container (it uses its own test database), then delete the copied file from the container.
- If a Django test database cannot be created, fall back to HTTP calls against http://localhost:18080 with the seeded test logins in `C:\dev\docker-local\TEST_LOGINS.txt` (all accounts are test accounts). Do not print passwords.
- Use the repo source at `C:\dev\worktrees\chemisttasker-pr200` (= baseline) to read code and existing tests (`backend/shifts/`, `backend/client_profile/` tests show how fixtures are built).
- One negative test per finding: it must FAIL on today's code if the finding is real (the forbidden thing succeeds), and say exactly what happened. Also one positive control per finding (the allowed case works). No fixes.

## Findings
Read the full source evidence for each in `docs/qa/evidence/pr200_finish/VERIFIED.json` (keys F04-N1 and F04-N2) and the scenario in `docs/qa/evidence/pr200_finish/raw_findings.json`.
- **F04-N1:** a shift's member-status endpoint lets a user enumerate staff of an unrelated pharmacy/organisation.
- **F04-N2:** a shift PATCH can move a shift to another pharmacy and change destination rates/payment status across the tenant boundary.

## Reply (at most 15 lines)
For each finding: `F04-Nx: REPRODUCED | NOT_REPRODUCED | BLOCKED` + the exact command, test name, HTTP status/assertion that proved it, and the test file path you saved under runtime/. Then one line on anything that surprised you.
