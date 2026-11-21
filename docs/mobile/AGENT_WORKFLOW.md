# Mobile mirror: how the agents work

The Expo app (`frontend_mobile`) is being brought to the web app's features and look, wave by wave
(plan and status: `docs/mobile/HANDOVER_2026-11-04.md`). This file is the working method every agent follows.

## Roles
| Role | Who (locally) | What they do |
|---|---|---|
| Orchestrator | Claude A | plans waves, writes briefs, runs the gates, commits, keeps STATUS current |
| Builder | Argon (agy g2) first; at its limit agy on Gemini 3.8 Flash High; if Flash needs more fix rounds, Claude B | writes the wave from a brief |
| Gate (code review) | Codex (account B while A is out of credits) | reads the diff, verdict "commit" or "fix first" |
| Design check | Argon / Claude B | only for design-heavy waves |
| Device check | orchestrator or agy visual lane | emulator screenshots at normal and 1.6x text |
Nobody reviews their own code. An online agent taking over plays builder; the review comes back to Codex + Claude A.

## One wave, step by step
1. **Brief** (`docs/mobile/agent-kit/`): task id and dependencies; worktree and branch; the binding plan section; the
   exact file list (and the files other running waves own: do not touch); skills to read (`.claude/skills/README.md`);
   the known traps; the done check; and, at the end, the completion contract (`agent-kit/flash-contract.txt`).
2. **Build** in its own git worktree when waves run in parallel (link `node_modules` to the main checkout, never
   download again). Keep each run <= 900 changed lines; split larger waves.
3. **Orchestrator gates** (cheap, no agent): `bash docs/mobile/agent-kit/gate.sh <worktree>` = `tsc --noEmit` exit 0,
   `expo lint` 0 errors (34 known warnings, add none), every `roles/shared/shifts/*.test.mjs` passing, diff size, CRLF.
4. **Codex gate**: brief from `agent-kit/codex-gate-template.md` (read-only; gate results pasted; the rules to check;
   "use the review method"). Verdict `commit` -> commit by exact paths (never `git add -A` when other work is in
   the tree). `fix first` -> a fix brief that lists ONLY the findings (file:line), plus the contract.
5. **Device check** after each wave: emulator + Metro + the Docker test stack; screenshots signed out and signed in
   per persona.

## Review method (every review, any reviewer)
1. Name the rule each change protects (for example "only the latest response writes state").
2. Grep every path that can break it (screens, hooks, dialogs, shared helpers, routes, guards) and mark each GUARDED
   (file:line) or GAP (file:line, the request that reaches it, a one-line fix).
3. Check allowed users keep their access (positive controls per persona), not only that the bad case is refused.
4. List every behaviour of each changed file at HEAD and mark it KEPT (new file:line) or DROPPED. Never drop an
   owner-built feature to "simplify"; simplify means UX.

## Gaps reviewers keep finding (put them in every brief)
Latest request wins (success, catch AND finally; bump on scope/id change, retry, unmount) - failure shows a retry,
never an empty list - paginated endpoints (50 per page) use `fetchAllPages` or load-more - state keyed by
`surface.scopeKey` + id - routes from the capability-guarded active persona, delegated admins stay in `/admin` -
Expo `useLocalSearchParams` objects change every render: key by values, apply prefills once - busy states always
released, one action never blocks another - status copy follows the server (`ACCEPTED_AWAITING_PAYMENT` is not
"confirmed") - close a dialog before opening the next; Cancel always works - forward existing query params
(referral_code / referral_event_id / referral_shift_id) through every hop - pure logic tested AND imported by the
screen - tokens, Lucide, 44pt targets, AA text, no new `@react-navigation/*` import, CRLF kept.

## Rules that never change
shared-core is the only source of API calls and domain logic; routes, endpoints, payloads and permissions stay as
they are; mobile-only features stay; light mode at launch; never commit `google-services.json`; nothing is pushed
without the owner's go; Docker only when a test needs it, shut down after; keep the PC under 90% memory.

## Local rig (Windows)
Android SDK 58 debug build: CI recipe (`.github/workflows/native_mobile_acceptance.yml`) from a short path, with a
CMake copy that carries ninja 1.13 (Windows long paths alone are not enough). Emulator AVD `Medium_Phone_API_36.1`;
Metro `EXPO_PUBLIC_API_URL=http://localhost:18080 npx expo start --dev-client`; `adb reverse tcp:8081 tcp:8081` and
`adb reverse tcp:18080 tcp:<stack gateway port>`; Docker test stack `mobile` (Postgres, Redis, Django, gateway).
