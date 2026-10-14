# Handover: light verification, badges, Pharmacy team, New to pharmacy

For the senior reviewer. Base: local `main` bd68162 (origin/main at the time). Work lives in worktree
`main-verification`, now on branch `feat/light-verification-new-to-pharmacy` (origin/main merged in at cbfb01d). The owner asked for a fresh PR
after the third review's fixes (the earlier draft PR #168 was opened by mistake and closed). `README.md` explains the work
and its reasons in short.

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
| D17 | **Upgrade New to pharmacy -> Pharmacist / Pharmacy team**, once, surgical: one service, one transaction; details, the whole photo ID bundle (incl. visa file) and references carry over; the new role's checks apply (mobile required again; AHPRA for pharmacists/interns). **The newcomer talent post is deleted** (D22); they post again in the new role. | `onboarding/services/upgrade.py`, delegated from the existing `me/account-type/` view |
| D18 | Onboarding pages finished to the Post shift / Shift Centre standard. | `frontend_web/src/pages/onboarding/OnboardingShell.tsx` |
| D19 | "Payment" step renamed **"Getting paid" / "How you get paid"** so it is not mistaken for a subscription fee. | onboarding layouts, Expo profile menus |
| D20 | Badge look: skill-symbol family; **green tick verified, calm blue clock pending, soft slate "!" not verified** (owner asked for neutral, not alarming red). | `VerificationBadges.tsx` (web), Expo twin |

### Decisions after the senior review (owner, 2026-10-13/14)

| # | Decision | Enforced in |
|---|---|---|
| D21 | **An AHPRA number is for life and unique.** Once our team has checked it, it cannot be changed in the app (support corrects mistakes); no two accounts may use one (the same person across their own profiles is fine: intern -> pharmacist, owner + pharmacist). An unchecked number can be edited; editing it removes Verified until the new number is checked. The check stays with the number across role changes. | `policy.ahpra_number_error`, `services/regulatory.py`, `services/basic.py` (pharmacist + owner); locked fields in Vite/Expo |
| D22 | **Upgrade removes the New to pharmacy post** (not moved, not held). | `services/upgrade.py` |
| D23 | **Leaving Overseas cancels the mobile skip** ("no skip"): the person verifies a mobile and is not Verified until then. | `services/basic.apply_explorer_basic_tab`; web + Expo update the session |
| D24 | **Overseas: no guarantee.** "Verified profile" makes no email/ID claim for someone verified without an Australian mobile ("ChemistTasker does not vouch for overseas profiles"). The Overseas label only says overseas. | `verification_summary.mobile_waived`, shared-core `verifiedProfileExplainer` |
| D25 | **Work rights question for everyone** (citizen/PR, visa with work rights, none yet), self-declared, never blocking. "No work rights yet" is a label to employers; an overseas person with a visa shows only Overseas. | `WORK_RIGHTS_CHOICES` (migration 0079), basic steps of all three roles, web + Expo labels |
| D26 | **Interns are checked like pharmacists** (manual check on the public register; provisional registration). Submitting the Role step with an unchecked number emails the admin team, as the pharmacist basic step does. | `services/regulatory.py` |
| open | **Under-18s: rules to be discussed** (regulations, our responsibilities). Unchanged for now: minimum age 15, first name only, Under 18 label. The review's "no contact before a match" rule is **not implemented** pending that discussion. | - |

### Legacy AHPRA duplicates (owner, 2026-10-14)

| # | Decision | Enforced in |
|---|---|---|
| D34 | **Legacy duplicate AHPRA numbers are kept**, on local, staging and production (test accounts stay active). Migration 0080 only registers one owner per number. The rules stay strict for anything new: no account can newly claim a number another account holds, in the app or in admin. Legacy holders can still save their profile and be edited by support. **Tighten again at launch, starting from clean data.** | `client_profile/migrations/0080`, `ahpra_numbers.sync_ahpra_registrations`, admin form (checks only a changed number); test `test_existing_duplicates_are_kept_and_one_owner_registered` |

### Decisions after the second review (owner, 2026-10-14)

| # | Decision | Enforced in |
|---|---|---|
| D27 | **A Pharmacy team role is fixed once chosen** (assistant / technician / intern / student). Basic takes no role fields; the Role step refuses a change ("Contact support"); the picker is locked on web and Expo. Supersedes D21's "check stays across role changes" (roles no longer change). | `services/regulatory.py`, `services/basic.py`, `RegulatoryV2.tsx`, Expo `RegulatoryScreen` |
| D28 | **AHPRA ownership is a table** (`AhpraRegistration`, unique normalised number, one user). Every onboarding write passes one guard (`verification/ahpra_numbers.guard_ahpra_write`); unknown tabs are refused so nothing skips it. Migration 0080 registers one owner per existing number and **changes no profile** (D34): legacy duplicates stay as they are. | `onboarding/verification/ahpra_numbers.py`, `serializers.py`, `client_profile/migrations/0080` |
| D29 | **Submit never removes Verified.** Only evidence changes do: a changed AHPRA number, a changed photo ID when Verified relies on it (overseas mobile skip or a tightening), leaving Overseas. A verified mobile number is already locked. Rates, payment, profile, interests, skills and identity edits that Verified does not rely on keep access, including during a tightening grace period. | `policy.revoke_for_changed_evidence`; submit resets removed from basic, identity, payment, preferences, profile, regulatory (owner profile unchanged) |
| D30 | **Referee links and reminders sent before an upgrade follow the person** to their new worker profile (answers and reminders kept). | `services/work_profile.referee_profile_target`, `views.py` (questionnaire + reject), `tasks.run_referee_reminder` |
| D31 | **Worker skills show as two rows, Skills and Software** (the job board's split), on talent cards (symbol tiles) and profiles (name chips), web, Next and Expo. | `frontend_web/shared/WorkerSkills.tsx`, Expo `WorkerSkillRows.tsx` |
| D32 | **One worker profile everywhere** (Review, Reveal, Confirmed, History; web and Expo). Contact details and the CV **only in Confirmed**: the History endpoint no longer sends them and Expo Review no longer shows the email. **Message** on Confirmed bookings opens a direct chat. | `shifts/candidates.assigned_profile(contact=)`, `WorkerProfileDialog` (web + Expo), `OwnerAssignedShiftBoard` |

### Behaviour changes a reviewer will notice (all intended)
- A technician / Level 2-4 assistant can submit Role & qualifications without a certificate (D7).
- Profiles become Verified without referees or ID (D1, D2). Interns no longer need hours proof (D8).
- New to pharmacy accounts now need a Verified profile to post on the talent hub; before they had no gate (D14).
- The background `final_evaluation` uses the same policy (it disagreed with the progress calculator before; it is
  not dispatched anywhere today, see `core/test_task_contracts.py` note). Its tests now run under the tightened setting.
- The public-shift refusal text changed to "Verify your profile (email and mobile, plus AHPRA ...)".

## Staff Shift Centre redesign and membership roles (2026-10-14)

- **D33 Membership roles** (owner): a pharmacy may give a pharmacist or Pharmacy team account an assistant, technician
  or student role inside its own team; pharmacist and intern memberships need the matching registered profile.
  One rule, `memberships/role_resolution.membership_role_refusal`, used by invites, applications, review and admin
  assignment. Internal/community shifts use the membership role; the public profile keeps the profile role. (c447328)
- **Staff Shift Centre (web, 7f3787e):** Public, Community, Confirmed and History share a "Shift Centre" header with
  segmented section tabs (routes unchanged), segmented Browse/Saved/Interested/Rejected/Offers tabs, and Confirmed/History
  rebuilt as owner-style booked-shift cards (`shiftCenter/WorkerBookedShifts.tsx`) with a pharmacy details dialog
  (address, documents, reviews) and a clearer rating dialog. Checked headless (Playwright) at 1365 px and 390 px:
  no page errors; tabs fit on phones; details and rating dialogs load.
- **Staff Shift Centre (Expo):** Confirmed and History rebuilt on the same pattern (`roles/shared/shifts/WorkerBookedShifts.tsx`),
  header subtitles match web. Typecheck and lint pass. **On-screen check skipped at the owner's request** (the Expo web
  login reached the dashboard, then the dev server stalled); run it before release.
- **Third review**: see "Round 3" below (all four findings fixed).

## Review rounds, in order

1. **Round 1** (2026-10-13, reviewed 349e9ab): 12 findings plus finishing gaps. Owner decisions D21-D26 came out of it.
   Fixed in ac77e03 and 9b82a1c.
2. **Round 2** (2026-10-14, reviewed 3fffcd1): 9 findings. Owner decisions D27-D30. Fixed in a9bd85d.
3. **Round 3** (2026-10-14, reviewed d65a868): 4 findings. Fixed in 1e38266.

Between rounds the owner also asked for D31-D33 (skills rows, one worker profile everywhere, membership roles) and the
staff Shift Centre redesign; those are in "Staff Shift Centre redesign and membership roles" above.

## Round 1: senior review (2026-10-13) and what was done

Reviewer file: `playground/verification-review/REVIEW.txt` (local only). Every finding, with its outcome:

| # | Finding | Outcome |
|---|---|---|
| 1 | Changing an intern's AHPRA number left Verified | Fixed by D21: checked numbers are locked; changing an unchecked one removes Verified |
| 2 | Minors can be messaged before a match | **Open**: the owner wants to discuss under-18 rules first (not implemented) |
| 3 | First-name privacy depended on the post's profile link | Fixed: age is read from the author's current profile (any role, survives upgrade); `explorer_profile` is server-owned on update |
| 4 | Upgraded unverified worker stayed on the feed | Fixed by D22: the newcomer post is deleted on upgrade |
| 5 | `reevaluate_verification` not tracked by git | Fixed: narrow `.gitignore` exception; command test in `test_verification_transitions` |
| 6 | Two conflicting verified flags in one response | Fixed: `RefreshVerifiedMixin` refreshes before rendering; progress only measures |
| 7 | Upgrade dropped the visa file | Fixed: identity moves as one bundle (documents, type, details, check) |
| 8 | Grace handled differently by final_evaluation | Fixed: `policy.evaluate()` is the one decision; `outstanding` + `grace_until` drive "References needed by ..." |
| 9 | Newcomer editors had the old three types | Fixed: shared `NEWCOMER_TYPES` on web and Expo; D23 for leaving Overseas; date of birth read-only (set at sign-up, where the age is checked) |
| 10 | OpenAPI said verification is a string | Fixed: `onboarding/verification/schema.py`; a test validates real payloads against it |
| 11 | Next public card lacked certificate marks | Fixed: `SkillEvidenceMark` in `PublicTalentCard` |
| 12 | Overseas wording claimed checks | Fixed by D24 |
| - | Expo date picker showed raw keys | Fixed: `registerTranslation('en', en)` once in `app/_layout.tsx` (all pickers) |
| - | Manual intern review intake | D26 |
| - | Return-to-intern kept the AHPRA check | Intended (D21: the same lifelong number) |
| - | Pre-existing newcomer posts | A post with no `last_talent_post_at` re-posts normally (test) |

The reviewer's local probes (`backend/onboarding/management/test_review_*.py`, git-ignored) still "fail" where the
owner decided differently: lock instead of reset (1), check kept across role changes, post deleted instead of held (4),
`outstanding` instead of `missing` for the grace list (8), and the open minors' contact rule (2).

### Tests after the review fixes (commit 9b82a1c, 2026-10-14)
- New tracked tests: `backend/onboarding/test_verification_transitions.py` (16: AHPRA lock / uniqueness / unchecked
  change / role change / admin email, one-state responses, grace + final_evaluation agreement, schema against real
  payloads, reevaluate command, under-18 name without the post link, upgrade deletes the post and keeps the age label,
  identity bundle for VISA and OTHER_PASSPORT, leaving Overseas, re-post of a pre-timestamp post). Updated to the new
  rules: `talent/test_newcomer_rules` (upgrade deletes the post; the carried ID check now needs a carried document) and
  `onboarding/test_role_tabs_contract` (a rejected AHPRA number can be corrected; a checked one is locked).
- Full backend suite, serial: **1021 tests; no failures outside two known groups.** 24 errors are all in
  `attendance_tests` (they only run as isolated commands, as in CI; same 23-24 as the pre-review run). 5 are the reviewer's
  ignored probes, all owner decisions (see above). Affected suites run separately: 252 + 238 OK.
- `makemigrations --check`: no changes. OpenAPI: `verification` is now `$ref VerificationSummary` on all four schemas.
- shared-core 202 tests; Vite `tsc`, 12 node tests, `vite build`; Next `tsc`, 14 node tests, `next build`; Expo `tsc`,
  `expo lint` (clean), `test:security`: all pass.
- Browser (Vite): the work-rights question saves and the panel shows "No work rights yet" at once. Not seen on screen
  (the pane stopped drawing): Expo date-picker labels and Next's public-card marks; both typecheck and build.
- Codex was asked to run these checks but the CLI launch was blocked by the permission checker; all checks were run
  directly.

## Round 2: second senior review (2026-10-14, reviewed 3fffcd1) and what was done

Reviewer file: `playground/verification-rereview/REVIEW.txt` (local only).

| # | Finding | Outcome |
|---|---|---|
| 1 (P1) | Unknown `tab` reached ModelSerializer.update and changed a checked AHPRA number | Fixed: unknown tabs refused (pharmacist, Pharmacy team, newcomer); the AHPRA guard runs first on every write (D28). Owner already normalised to Basic. |
| 2 (P1) | Basic draft `role_type: INTERN` kept Verified | Fixed by D27: Basic takes no role fields; the Role step refuses a change |
| 3 (P2) | Concurrent claims saved one number twice | Fixed by D28: unique registry row; threaded API test returns 200 + 400 and one owner |
| 4 (P2) | Submit removed Verified during grace | Fixed by D29 (all tabs) |
| 5 (P2) | Upgrade dropped work rights | Fixed: carried (an answer already on the target wins) |
| 6 (P2) | Newcomer posts with blank/null category survived upgrade | Fixed: deleted by provenance (profile link, or authored with EXPLORER/blank/null category) |
| 7 (P2) | Referee links updated the old newcomer row | Fixed by D30 |
| 8 (P2) | Upgrade copy promised the post comes along | Fixed: shared `UPGRADE_COPY` says it is removed with its likes and views, before and in the confirmation |
| 9 (P2) | General guide claimed every Verified profile has a mobile | Fixed: states the overseas exception and no guarantee; shared-core test |

The reviewer's probes (`backend/onboarding/management/test_rereview.py`, ignored) still fail where the owner decided
differently: the race probe patches the removed `basic.ahpra_number_error` (the tracked threaded test replaces it), and
the Basic role probe expects the role to change (D27: it can no longer change, so the assistant correctly stays
Verified).

**Superseded by D34 (2026-10-14):** the first version of 0080 cleared duplicates; on the local DB copy it registered 3 numbers and cleared 279 duplicates;
263 of 265 seed pharmacists lost their number and Verified (all `.test` accounts). Expect the same on staging and
production seed data. Run it on a staging snapshot first and read the printed counts.

## Round 3: third senior review (2026-10-14, reviewed d65a868)

Reviewer file: `playground/verification-third-review/REVIEW.txt` (local only). Verdict: request changes, four findings.
The reviewer also confirmed the round-2 fixes, the shared frontend structure, and (headless Playwright) the Skills/Software
rows, role locks, upgrade warning, overseas guide text and Confirmed-vs-History contact controls.

| # | Finding | Fix (commit 1e38266) | Test |
|---|---|---|---|
| 1 (P2) | The AHPRA registry could release a number the saved profile still held: the guard ran before the tab, so a tab that ignored the number (Profile), a refused Role-step save, or two overlapping saves by the same person left them out of step | The number change is saved together with its claim and the release of unused numbers in **one small transaction, serialised per person** (user row lock), and only on the step that owns the number (pharmacist Basic, Role step, owner Basic), after the role-lock check. Other tabs drop the field. The rest of the tab still saves separately, so a refused Submit keeps its other edits | `AhpraOwnershipDriftTests` (ignored field, refused role change) |
| 2 (P2) | Django admin corrections bypassed the registry | `AhpraOwnershipAdminMixin` on the pharmacist, Pharmacy team and owner admins: the form refuses a number another account holds; the save re-syncs the registry in the same transaction. Support may change a checked number (the support override) | `AhpraSupportCorrectionTests` (all three admins, conflict refused) |
| 3 (P2) | A referee link answered before an upgrade could be answered again afterwards | A link whose newcomer row already holds an answer (flag or stored response) is refused before it follows the person | `ConsumedRefereeLinkTests` |
| 4 (P2) | The threaded concurrency test failed on the SQLite regression settings | It runs only on PostgreSQL (`skipUnless`), reports a worker's real error and fails if a thread does not finish; SQLite keeps the serial ownership tests | SQLite: 30 run, 1 skipped, OK; PostgreSQL: 45 run, OK |

Also from this round: an **unknown tab** (a save naming a step that does not exist, e.g. `tab: "xyz"`; the apps never send
one) is refused for pharmacist, Pharmacy team and newcomer profiles; owner profiles treat it as Basic, and the AHPRA check
now treats it as Basic too, so it cannot slip past the lock.

## Commits (in order)
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
| 349e9ab | handover |
| cbfb01d | origin/main merged into the branch |
| 5829e17 | badge visual redesign (D20) |
| ac77e03 | review fixes, backend (D21-D26; findings 1, 3-8, 10) |
| 9b82a1c | review fixes, clients (work rights, overseas wording, locks, grace reminder, Next marks, date picker) |
| 3fffcd1 | handover after the first review |
| 2d5253b | one worker profile everywhere, contact only in Confirmed, Message, skills layout (D31, D32) |
| a9bd85d | second review fixes (D27-D30; findings 1-9) |
| d65a868 | handover after round 2 |
| c447328 | membership roles (D33) |
| 7f3787e | staff Shift Centre redesign, web |
| 890f997 | staff Shift Centre redesign, Expo; handover |
| 1e38266 | third review fixes (findings 1-4) |

## Migrations (all additive or label-only, except the 0080 data step)
- `client_profile` 0075 intern AHPRA fields; 0076 label-only; 0077 newcomer date_of_birth, last_talent_post_at, role_type choices (labels + OVERSEAS); 0078 `Shift.public_hidden_at`.
- `users` 0004 label-only; 0005 `mobile_check_skipped`.
- `talent` 0004 label-only; 0005 `ExplorerPost.hidden_at`. `pharmacy_hub` 0004 label-only. `public_hub` 0005 BoardReport.
- `client_profile` 0079 `work_rights` on pharmacist, Pharmacy team and newcomer profiles (additive, default '').
  Applied to the DB copy after a backup (`playground/backups/ct_verification_before_0079_20261014.dump`).
- `client_profile` 0080 `AhpraRegistration` + data step: registers one owner per existing number (the checked account,
  else the lowest user id) and **changes no profile**; prints how many legacy duplicate holders were kept (D34). On the local
  DB copy: 3 numbers registered, 279 legacy duplicate holders kept, 244 of 265 seed pharmacists still Verified. The copy was
  rebuilt from `playground/backups/ct_verification_before_0080_20261014.dump` (the destructive first version had been applied;
  that state is kept in `ct_verification_after_old0080_20261014.dump`) and then migrated with the final 0080.
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

## Tests run for the latest fixes (targeted, as the owner asked)

- Round 3: `onboarding.test_verification_transitions` on SQLite contract settings (30, 1 skipped) and, with
  `onboarding.test_role_tabs_contract`, on PostgreSQL (45, OK).
- Membership roles: memberships, organizations and shifts suites (152, OK).
- Staff Shift Centre: Vite typecheck/lint; headless Playwright at 1365 px and 390 px (no page errors, tabs fit, details
  and rating dialogs load); Expo typecheck and lint. Expo on-screen check skipped at the owner's request.
- Earlier full runs (round 2 and before) are listed in the round sections; no full regression run was repeated after round 3.

## What still needs testing (my view)

1. **The full regression gate on the final commit** (all backend suites on SQLite and PostgreSQL, isolated attendance
   commands, API replay, OpenAPI/migration identity, web builds) — not re-run after round 3 by request.
2. **Migration 0080 on a staging snapshot**: it changes no profile, but read the printed counts (numbers registered,
   legacy duplicate holders kept) to know how much clean-up the launch tightening will need.
3. **Expo on a real device or the Expo web build**: the staff Shift Centre redesign, the worker profile dialog with
   Message, date pickers, role lock and upgrade warning.
4. **Admin corrections in the real Django admin UI** (the tests drive the ModelAdmin form and save directly).
5. **Referee flows end to end with email**: links before/after upgrade, reminders following the person.
6. **Membership roles in the UI**: inviting an assistant as technician, a pharmacist as assistant, and refusing an
   unregistered intern; community shift eligibility follows the membership role.
7. **Under-18 rules** remain an open product decision (contact before a match is not restricted).

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

## Final senior D34 hardening — canonical-holder release and admin claims (2026-10-14)

The temporary grandfathering migration keeps existing profiles, checked flags and Verified values exactly as agreed.
The runtime must also keep every *remaining* historical number reserved if its canonical owner changes to another number.
At release the registry row is transferred to the best remaining historical holder (checked first, then lowest user ID);
a new third account is never permitted to claim a number still present on a legacy profile. A genuinely unused number
is released as before. The operation runs within the same transaction as the corresponding number change.

The admin form rejects changing the linked user of a numbered profile, even if its number is textually unchanged.
An admin save snapshots numbers held *before* the save and only grandfathers those existing claims; it aborts
atomically if a new claimant races with the form check. The corrected policy is exercised on SQLite and PostgreSQL
through `onboarding.test_verification_transitions`. It does not alter the existing migration 0080 content or clear accounts.
