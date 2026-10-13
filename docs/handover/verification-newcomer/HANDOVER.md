# Handover: light verification, badges, Pharmacy team, New to pharmacy

For the senior reviewer. Base: local `main` bd68162 (origin/main at the time). Work lives in worktree
`main-verification` on local `main` and pushed branch `feat/light-verification-new-to-pharmacy`. **No PR yet: the owner
asked for no PR until everything is finished and verified** (draft PR #168 was opened by mistake and closed).

**Every behaviour change listed under "Owner decisions" is deliberate.** They were agreed with the owner in the
conversation of 2026-10-13 (decision table in `PLAN.md`). If a diff looks like a loosened rule, check this list
first: it is not a logic change by mistake.

## Owner decisions (2026-10-13), and where each is enforced

| # | Decision | Enforced in |
|---|---|---|
| D1 | **Profile "Verified" = email + mobile.** Pharmacists also need AHPRA (General). Interns need AHPRA (Provisional is enough). | `backend/onboarding/verification/policy.py` `requirements()` |
| D2 | **Photo ID and referees are optional.** They never block; they show as badges (verified / not verified). Pharmacists do not need ID ("tighten later"). | `policy.py`; progress + final evaluation both use it |
| D3 | **"Verified" stays the gate** for applying to public shifts and publishing on the talent hub (same gate, lighter rule). | `shifts/interest.py`, `talent/views/explorer.py` (unchanged gates read `verified`) |
| D4 | **Tighten later with one switch**: `VERIFICATION_EXTRA_REQUIREMENTS` (`gov_id`, `referees`), empty now. | `core/settings.py`, `policy.py` |
| D5 | **Grace on tightening**: already-verified profiles keep Verified until `VERIFICATION_GRACE_UNTIL`, then `manage.py reevaluate_verification` removes Verified from those still missing the extra items. Base requirements never auto-demote (admin-verified profiles are safe). | `policy.refresh_verified()`, `onboarding/management/commands/reevaluate_verification.py` |
| D6 | **A claimed skill never needs a certificate.** A certificate earns a badge on that skill. Only skills marked `certificate` in the registry ever show a badge. | `onboarding/services/skills.py` (no block), `policy.skill_evidence()` |
| D7 | **Assistant / technician certificates are optional** (was: required on submit for technicians and Level 2-4 assistants: the reported bug). | `onboarding/services/regulatory.py` (requirement removed) |
| D8 | **Interns: AHPRA number only.** Hours proof, AHPRA proof file and 1st/2nd half are no longer required. Student uni ID optional. AHPRA is checked manually by admin, like pharmacists (the scraper stays disabled). | `regulatory.py`, model fields `OtherStaffOnboarding.ahpra_number/ahpra_verified/ahpra_verification_note` |
| D9 | **Badges are granted only by ChemistTasker** (automatic name-matching document check, or admin). Never by employers. Skill certificates get the same OCR name check as photo ID. | `onboarding.tasks.verify_skill_certificate_task`, `_document_name_check` |
| D10 | **Employer explainer**: "What do badges mean?" on talent hub, review candidate, interested lists; each badge explains itself on hover/tap. Copy lives once in shared-core. | `shared-core/src/domains/onboarding/verification.ts`, `frontend_web/shared/VerificationBadges.tsx`, `frontend_mobile/roles/shared/skills/VerificationBadges.tsx` |
| D11 | **"Other Staff" is shown as "Pharmacy team"**; "Explorer" as "New to pharmacy". **Labels only**: codes `OTHER_STAFF` / `EXPLORER`, routes and data unchanged. | Labels across apps; migrations record label-only choice changes (sqlmigrate: no SQL) |
| D12 | **New to pharmacy is a separate sign-up path** under the three main tiles, with one question (overseas-qualified / school student or junior / internship or placement / new to the field) and date of birth. **Minimum age 15.** | `users/serializers.py` RegisterSerializer, `frontend_web/shared/SignupRolePicker.tsx`, Expo `app/register.tsx` |
| D13 | **Overseas newcomers may skip the Australian mobile check**; a verified photo ID then becomes required for Verified; a grey **Overseas** label (not a badge). Legal name is still captured. | `users/api_otp.SkipMobileOverseasView`, `User.mobile_check_skipped`, `policy.mobile_waived()` |
| D14 | **Newcomer talent posts**: verified profile needed; **one active post**; edit any time; delete + re-post allowed but a re-post within 7 days keeps the old feed position. | `talent/views/explorer.py` `_create_newcomer_post` |
| D15 | **Under 18**: first name only on the talent hub, **Under 18** label. | `talent/serializers/explorer.get_explorer_name`, `policy.verification_summary` |
| D16 | **Reports on public talent posts and job board shifts** go to the existing Next Moderation tab under two new areas, **Talent board** and **Job board**. "Hide" takes the item off its public board without deleting it. | `public_hub` BoardReport, `content_views.Moderation`, `ExplorerPost.hidden_at`, `Shift.public_hidden_at` |
| D17 | **Upgrade New to pharmacy -> Pharmacist / Pharmacy team**, once, surgical: one service, one transaction; details, ID check, references and the talent post carry over; the new role's checks apply (mobile required again; AHPRA for pharmacists/interns). | `onboarding/services/upgrade.py`, delegated from the existing `me/account-type/` view |
| D18 | Onboarding pages finished to the Post shift / Shift Centre standard. | `frontend_web/src/pages/onboarding/OnboardingShell.tsx` |
| D19 | "Payment" step renamed **"Getting paid" / "How you get paid"** so it is not mistaken for a subscription fee. | onboarding layouts, Expo profile menus |
| D20 | Badge look: skill-symbol family; **green tick verified, calm blue clock pending, soft slate "!" not verified** (owner asked for neutral, not alarming red). | `VerificationBadges.tsx` (web), Expo twin |

### Behaviour changes a reviewer will notice (all intended)
- A technician / Level 2-4 assistant can submit Role & qualifications without a certificate (D7).
- Profiles become Verified without referees or ID (D1, D2). Interns no longer need hours proof (D8).
- New to pharmacy accounts now need a Verified profile to post on the talent hub; before they had no gate (D14).
- The background `final_evaluation` uses the same policy (it disagreed with the progress calculator before; it is
  not dispatched anywhere today, see `core/test_task_contracts.py` note). Its tests now run under the tightened setting.
- The public-shift refusal text changed to "Verify your profile (email and mobile, plus AHPRA ...)".

## Commits (local main, in order)
| Commit | Milestone |
|---|---|
| 365c69a | M1 verification policy, intern AHPRA, settings switch, reevaluate command |
| dfdfa03 | M2+M4 badge data (backend summary, skill certificate check) + employer screens |
| 70805d3 | M3 onboarding shell, Role & qualifications, Skills (web + Expo) |
| 39faf24, b4f0893 | M5 Pharmacy team / New to pharmacy labels (+ stray empty files removed) |
| 2d79d55 | M6+M7 New to pharmacy sign-up, overseas skip, one-post rules, under 18 |
| 579e492 | M8 board reports + moderation areas |
| c79333e | interim handover |
| 568cf51 | M9 upgrade newcomer |
| 4286211 | fixes from the browser check (N+1, panel refresh, phone overlap, wording, "How you get paid") |
| (next) | badge visual redesign (D20) and this handover |

## Migrations (all additive or label-only)
- `client_profile` 0075 intern AHPRA fields; 0076 label-only; 0077 newcomer date_of_birth, last_talent_post_at, role_type choices (labels + OVERSEAS); 0078 `Shift.public_hidden_at`.
- `users` 0004 label-only; 0005 `mobile_check_skipped`.
- `talent` 0004 label-only; 0005 `ExplorerPost.hidden_at`. `pharmacy_hub` 0004 label-only. `public_hub` 0005 BoardReport.
- Label-only migrations checked with `sqlmigrate`: no SQL. No data is rewritten. Existing ExplorerOnboarding codes kept
  (STUDENT/JUNIOR/CAREER_SWITCHER relabelled; OVERSEAS added).
- Applied only to a **copy** of the dev DB (`ct_verification` in container `ctpg`). The dev DB `chemisttasker_preview`
  was not migrated. Back it up before applying (AGENTS.md).

## How it was verified
### Automated
- Backend: affected suites green after each milestone (onboarding, talent, shifts, users, public_hub, pharmacy_hub,
  core; 411 tests at M7). New tests: `onboarding/test_verification_policy.py`, `talent/test_newcomer_rules.py`
  (sign-up age, overseas skip, one post / 7-day, under 18, upgrade), `public_hub/test_board_reports.py`.
  Full-suite serial run: see "Full suite" below.
- Contract test `core.test_serializer_decomposition`: shift serializer hashes updated for the role label (D11) in
  both `core/contracts/serializer_field_contracts*.json` (computed under PostgreSQL and SQLite).
- shared-core: typecheck, 202 tests, build. Vite: `tsc -p tsconfig.app.json`, `scripts/auth-flow` + `ws-url` node tests
  (12 pass), `vite build`. Next: `tsc`, `lib/api-root` + `public-route-contract` node tests (14 pass). Expo: `tsc`,
  `expo lint` (clean), `test:security` (7 pass). Impeccable detector on changed web files: no findings.

### In the browser (Vite :5180, Next :3180, Expo web :8180 against backend :18000 on the DB copy)
- Assistant Level 3 claims the dispensary stream with **no certificate** -> saves, stays Verified (the reported bug).
- Badge panel updates on save without reload; Dispensing claim shows "Not verified" with the worker explanation.
- Owner talent hub (Vite, Next public, Expo): badges, newcomer type labels, guide popover, Report.
- Report flow: report saved, appears in Next Moderation under Talent board, resolve works; signed-out report says
  "Sign in to report a profile"; Team tab offers Talent board / Job board; Content sidebar does not list them.
- Next job board: Report on every public shift.
- Next sign-up: three tiles + New to pharmacy path; under-15 date shows the age message.
- Overseas newcomer (Vite and Expo): skip mobile with legal name -> lands on Photo ID; panel says Photo ID required;
  Overseas label.
- Upgrade newcomer -> Pharmacist: role changed, skip cleared, DOB carried, Verified off, sent to mobile check.
- Review candidate (Shift Centre): Verification section with badges and guide.
- Phone width (390): onboarding, talent cards (fixed an overlap of Report over Request Booking).

### Found and fixed during verification
- Talent feed N+1: 603 -> 4 queries per 200-post page (pre-existing per-row lookups now read the loaded profile row).
- Onboarding panel did not refresh after a save; stepper labels truncated; panel order on phones.
- Duplicated "Verified." in worker wording; red error chip on Photo ID before any upload; raw EXPLORER in the top bar.

## Known limits / follow-ups (not done)
- Expo `ChooseAccountTypeCard` (manager conversion, pre-existing) routes to `/otherstaff/onboarding`, which does not
  exist in Expo; the newcomer upgrade routes to `/otherstaff/profile` instead.
- The dashboard `<main>` is a scroll box while the window scrolls, so `position: sticky` cannot work on any page;
  the onboarding panel is not sticky.
- Report shows on one's own posts too (shortcut).
- Reveal on a shift needs Redis for its email task (local preview needed a Redis queue; not a code change).
- Reviewer: run the full regression gate (API replay / URL / OpenAPI / migration identity) on the final commit before
  anything leaves this machine (AGENTS.md).

## Local preview (for re-running the checks)
- Backend: `scratchpad/ctv_backend.sh` (worktree mounted into `ctsmoke-web`, DB `ct_verification`, Redis db 9).
- `C:\Users\semse\Downloads\chemisttasker-Frontend-main\.claude\launch.json`: `verif-vite` (5180), `verif-next`
  (3180), `verif-expo` (8180). Local env files (git-ignored): `frontend_web/.env.development.local`,
  `frontend_web/landing_next/.env.local`, `frontend_mobile/.env.local`.
- Test accounts: playground accounts (password in `playground/data.json`), plus `newcomer.overseas.qa@` (upgraded to
  pharmacist) and `newcomer.overseas.qa2@playground.test` created in the DB copy only.
