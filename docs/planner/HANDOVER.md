# Pharmacy Operations Planner: handover (20 Oct 2026)

## The owner's direction (read this first)

The planner is meant to be a **standalone app inside ChemistTasker, connected to Calendar**. Owners and organization admins **plan first, then release (publish) through Calendar**. That design was intentional.

What the owner wants in the final version:
- **Draft and publish stay.** Work is drafted, then released to Calendar. Add a **"share week" / publish week** step. Owners must be able to **edit and delete tasks both while they're drafts and after they're published**.
- **Keep the full feature set:** KPI and compliance, checklist steps, sign-off, training and the 28 starter tasks / task library.
- **Free task creation:** owners can create a task directly in the planner without going through the library first. Saving it to the library is optional.
- **Faster planning:** duplicating a task, a day or a week is one action.
- **Native look and feel:** it should feel part of ChemistTasker: house components and theme, built with the design skills stack (ui-ux-pro-max, taste/design-taste-frontend, impeccable). Hold it to the anti-spaghetti standard.

**Status: the final version is NOT started.** The owner will compare the two versions below and decide the mix later ("not now"). Don't change either PR or start merging them until the owner asks.

## The two versions

| PR | Branch | What it is |
|---|---|---|
| [#192](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/192) | `feat/pharmacy-ops-planner-original-20261016` @ `9d1c6b76` | **Original**, untouched. Standalone planner with plans, draft → publish to Calendar, library and starters, checklist steps, KPI, sign-off, training. Not rebased on main. |
| [#181](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/181) | `feat/pharmacy-ops-calendar-publishing-20261016` @ `b8e86b4e` | **Simplified** (this branch). The planner as a "Plan" view inside Calendar. Direct add, one-click copies, saved tasks optional, design pass. **No draft/publish; KPI, checklists, sign-off, training and starters removed**, which went against the owner's direction. Kept as a source of good parts. CI was green on `6b6e2f7d`; the last commit only fixes a loop bug. |

Both are drafts. Nothing has been merged to main or deployed.

## What happened in this session

1. **Brief.** The owner asked for PR #181 to become "simple, finished, user-friendly", run autonomously. Their complaints were: it feels like a separate app; adding a task needs the catalogue first; building a plan is slow; and "simplify, remove before adding".
2. **Grill.** Claude B mapped the PR (`MAP.md`) and wrote 77 questions (`GRILL.md`). Claude B and Codex A answered them separately (`grill/answers-*.md`), Codex B compared the answers, and the orchestrator ruled on 35 disputes and 6 gaps (`grill/orchestrator-rulings.md`, `DECISIONS.md`).
3. **The wrong turn.** The orchestrator read "feels like a separate app" as "shouldn't be a separate app", and "remove before adding" as permission to delete features. It folded the planner into Calendar, removed draft/publish, and removed KPI, checklists, sign-off, training and the starters. It recorded those as "owner decisions" with "safe" defaults, when the safe default was to keep them. **The owner rejected this direction.**
4. **Build (on the wrong direction).** Backend work task = WorkNote with a planner flag, saved tasks, one atomic copy endpoint, roster fill, and audit. Web and Expo got a Plan view; the shared planner logic lives in `shared-core/src/domains/calendar/planner.ts`.
5. **Reviews caught real bugs**, all fixed:
   - region-admin access widened app-wide (fixed with a planner-only `planner_pharmacies()`; the shared access helpers are identical to main);
   - completing a shared task returned a 409 to co-assignees;
   - clinical eligibility skipped on reschedule, and assignees kept when a note moved to another pharmacy;
   - the phone dialog cut off its fields;
   - an infinite week flip-flop loop in the Plan view on non-Monday dates (found when run against the real backend).
6. **Anti-spaghetti.** All repo audits pass. Codex B's structure review moved duplicated web/mobile logic into shared-core and backend rules into `operations_rules.py`.
7. **Design.** The owner said the first UI looked weak. A second pass used ui-ux-pro-max, taste and impeccable: day-row agenda, compact cards with time, status pills, avatars and a clinical accent, a week summary, and the app's theme tokens. The taste pre-flight passed. Screenshots are in `screenshots/before/` and `screenshots/final/`.
8. **Local run.** PR #181 was run against a real backend with seeded data: `C:\dev\worktrees\pr181-run\` (`run-backend.cmd`, `run-web.cmd 5183`, `seed_planner.py`, `TEST_LOGINS.txt`). It's not in git.
9. **Outcome.** The owner keeps #181 as it is to pick good work from. The original was pushed as a separate draft PR, #192, so both versions exist for the final mix.

## Good parts in #181 worth porting into the final version

- **Fast add dialog:** title, date and assignees first; "Fill from roster"; "More options" collapsed; "Use a saved task" / "Save as reusable".
- **One-click copies:** Duplicate, Copy day to tomorrow, Copy week to next week. The backend copy endpoint is atomic, capped at 400, and safe to retry; it skips repeating series and reports dropped assignees.
- **Design:** the agenda day rows and card design (`PharmacyCalendarWeekView.tsx`), the week summary, and hover/focus menus with 44px targets.
- **Shared logic:** `shared-core/src/domains/calendar/planner.ts` (week range, copy request keys, result message, task forms, roster merge, task state) and its tests.
- **Safety fixes:** region-admin scoping, completion without a 409, clinical re-check on reschedule, re-validating assignees when a note moves pharmacy, and the stale-edit check for managers.
- **Tests:** the planner Playwright journeys (`frontend_web/e2e/frontend-planner.spec.mjs`, including the non-Monday regression).
- **Process lessons:** run against the real backend before calling it done; apply the design skills stack from the first UI brief.

## Things in #181 to drop or rethink for the final version

- Folding the planner into Calendar as just a view (the owner wants a standalone planner that publishes to Calendar).
- "Live on save" with no draft/publish.
- Removing KPI, checklists, sign-off, training and starters.
- The `is_planner_task` WorkNote model as the only task model. #192's plan/task models carry the draft/publish and execution data the owner wants.

## Open items (either version)

- The Expo app hasn't been checked on a real device.
- Follow-up proposal (not started): check whether `user_can_manage_pharmacy` on main should require the region admin's organization to match the pharmacy's organization.
- The pre-existing large Calendar components on main (web about 1,170 lines, mobile about 1,290). Decide after the final mix.
- If the final version rewrites migration 0004 again, recreate any test database that ran an earlier 0004.

## How to resume

1. Read this file, then `DECISIONS.md` (it records the simplified direction; treat it as history, not the plan).
2. Wait for the owner to say which parts to mix. Start the final version from #192's model and port the parts above from #181.
3. Agent routing: Claude B for planning, fixes and gates; Codex A for building; Codex B for second reviews; agy (g1, g3) for screenshot reviews. Every UI brief names ui-ux-pro-max, taste (`.agents/skills/design-taste-frontend`) and impeccable. Run the anti-spaghetti audits before calling anything done.
