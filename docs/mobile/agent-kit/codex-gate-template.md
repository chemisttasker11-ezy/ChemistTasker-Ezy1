Work alone.
Review by reading code only. Do not run builds, tests or installs: the gate results are below.
Task: <WAVE> (<what it is>; you are the gate); needs: <dependencies>

Gates (orchestrator re-run): tsc 0; expo lint 0 errors 34 warnings; node roles/shared/shifts/*.test.mjs <n>/<n>; CRLF ok.
Change: the uncommitted diff in <worktree> (branch <branch> from <base sha>), <files> files +<a>/-<d> plus <new files>.
Writer report: <path>. Task brief: <path>; plan: <plan section> (+ its [EDIT] notes).
Rules to check (review method: name each invariant, grep every path that can break it, GUARDED / GAP; list HEAD
behaviours of every changed file and mark each KEPT file:line or DROPPED):
1. No owner-built feature dropped: <list the screen's workflows>.
2. Scope and persona: the selected / active pharmacy scopes every list; stale data cleared on scope change; links use
   the capability-guarded active persona; allowed users keep access; delegated admins stay in /admin.
3. Request safety: latest request wins on success/catch/finally; failure -> ContentState retry, never empty; paginated
   lists complete (fetchAllPages or load-more).
4. Pure logic in tests is the logic the screens use; service calls and payloads unchanged.
5. Kit rules: 44pt, AA, tokens, Lucide, no new @react-navigation import.
6. Plan coverage: list plan items not done (not a GAP).
Reply: verdict commit / fix first, GAPs (file:line + one-line fix), "Not done from plan:" list; at most 25 lines plus
the two closing blocks.

(Re-gate: add "Your previous review: <file>; fix report: <file>" and ask to confirm each earlier finding is closed with
file:line, open findings only.)
