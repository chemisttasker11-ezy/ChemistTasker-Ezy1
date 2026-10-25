Work alone: do not start subagents. Run every command in the foreground.

# PR #200 audit: runtime check of P0 F03-N1 (targeted test only)

Goal: prove or disprove at runtime that a removed (deactivated) pharmacy admin can re-activate their own admin access by accepting the old invitation, without a fresh grant from the owner. Audit only.

## Rules
- Do NOT change any file in a git repo. Write files ONLY under `C:\dev\worktrees\chemisttasker-pr200\docs\qa\evidence\pr200_finish\runtime\`.
- Run inside the Docker stack `pr200` (baseline b77e9fd2; gateway http://localhost:18508). Find the backend container with `docker ps --filter label=com.docker.compose.project=pr200` (service `web`).
- Preferred: a Django test module copied into the container only (e.g. into the `organizations/` or `client_profile/` package as `tests_pr200_runtime_f03.py`), run with `python manage.py test <label> -v 2 --noinput` in the container (own test database), then delete the copied file. Follow the existing fixtures in `backend/client_profile/test_admin_invitations.py`.
- If a test database cannot be created, fall back to HTTP calls against http://localhost:18508 with seeded logins from `C:\dev\docker-local\TEST_LOGINS.txt` (all test accounts). Do not print passwords.
- Source to read: `C:\dev\worktrees\chemisttasker-pr200` (= baseline). Evidence and reasoning: key `F03-N1` in `docs/qa/evidence/pr200_finish/VERIFIED.json`; scenario in `docs/qa/evidence/pr200_finish/raw_findings.json`.
- One negative test (must FAIL on today's code if the finding is real: the removed admin regains active admin access) and one positive control (a fresh, valid invitation still works; or a never-invited user is refused). No fixes.

## Reply (at most 12 lines)
`F03-N1: REPRODUCED | NOT_REPRODUCED | BLOCKED`, the exact command, test names, the HTTP status/assertion that proved it, and the test file path saved under runtime/. Then one line on anything surprising.
