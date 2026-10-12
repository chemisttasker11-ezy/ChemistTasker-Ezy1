> Start with [current successor-PR handover](REVIEW_FIXES_2026-10-12.md), [reviewer cross-check](REVIEW_CROSSCHECK_2026-10-12.md) and [reusable test ledger](TEST_LEDGER_2026-10-12.md). The publication status below is historical. The user requested a new PR from review/pr165-consolidated-20261012 and has no intention to merge PR165. Do not repeat unchanged passing checks or claim unperformed hosted/native/staging acceptance.

# PR165 current handover — 12 October 2026

Read this file first. It supersedes the status and next steps in the archived handovers. These documents are records of earlier work, not authorization to change another branch or resume the separate launch programme.

**Publication:** application commit `2e67f18` was pushed successfully on 12 October 2026 to both `design/pr165-skills` and `feat/role-aware-skills-onboarding-2026-10` (draft PR165). The user explicitly requested immediate push after narrowing testing. Focused checks are recorded below; the full exact-commit release gate was not completed. It remains required before merge/release. No merge or deployment occurred. This documentation follow-up records that status without changing application code.

## Branch and scope

All accumulated PR165 application changes are on local `design/pr165-skills`, based on `bbc4ee35f6b86074efe2151853217516b195d02c`. The existing draft PR165 uses remote `feat/role-aware-skills-onboarding-2026-10`. Publication targets both feature branches at the same final commit; never `origin/main`. No merge or deployment is authorized by this handover.

The user explicitly requested that the current and previous PR165 handovers accompany the pushed code. Their reviewed copies are tracked here; raw playground fixtures, launchers, users, credentials and database dumps remain ignored. Previous checkout: `review/pr165-skills-ux` in `pr165-design-review`. Current checkout: `pr165-skills-design`.

## Completed changes

1. **Skills and icons:** one current 67-entry role-aware registry; unused cash handling, telephone enquiries, Word and generic Other software are removed without a retirement banner. Exact equivalent aliases remain; partial historical tasks cannot grant broader claims. Web vector symbols and native assets share the icon source. Named software uses product logos. Required, Preferred and Software headings share web typography. Pharmacy services, workload and staffing appear only inside expanded details.
2. **Pharmacy and posting context:** organizations owns pharmacy software/services/script bands, shifts owns workload/support validation. Pharmacy create/edit clears and resets these fields correctly. Posting reads pharmacy defaults, allows owner overrides and saves canonical support counts and workload. Description reuse and browser-scoped role skill presets remain supported.
3. **One web posting form:** Vite hosts `frontend_web/shared/postShift/PostShiftForm.tsx`; Next talent bookings hand off to that host. Removed duplicated Next form and obsolete onboarding components. Native retains its presentation component. Shared-core owns recurrence expansion, varying-rate slot payloads and date/time keyed manual rate reconciliation. A varying recurrence materializes concrete occurrences so Review and persisted rates agree.
4. **Private bookings:** a dedicated worker is explicit domain state, independent of embedding. Web/native suppress audience widening and broadcasts. Backend normalizes direct booking visibility and blocks general announcements; unrelated workers cannot discover a dedicated booking. Completion runs once, preserving the existing roster replacement callback.
5. **Chain notifications:** capability is derived from the selected pharmacy's active owner chain, not from choosing Public/Organisation. Web/native hide and clear unavailable chain notification selections; backend uses the same organization-owned chain lookup for metadata, tiers and actual recipients.
6. **Wizard state:** preset initialization and manual edits survive step remounts, so deliberately cleared requirements stay cleared. Automatic widening mode and interval live in the parent draft; the 12-hour selection survives navigation. Existing manually scheduled dates hydrate as Custom.
7. **Talent and candidate profiles:** all three hosts call shared talent role resolution, filtering and skill/software grouping. Other Staff subtype resolves before generic account category. Candidate work-profile contracts are typed; Expo member/interest/offer review keeps the mapped profile and displays canonical skills/software and verification. The backend selects onboarding by current account role and retains historical rows; shift interest biographies use current-role lookup too.
8. **Claims versus verification:** role-eligible skill claims may be saved and used to apply without uploading or verifying individual certificates. A claimed skill or uploaded file alone is never a verified skill badge. Admin review is separate; the employer verifies evidence and supervision before regulated work. Existing account-level public onboarding requirements are separate from per-skill evidence.
9. **Other Staff eligibility:** all Other Staff can perform Assistant vacancies; Intern vacancies are intern-only and Student vacancies student-only. Interns/students/technicians can perform Technician vacancies; assistants can qualify through a claimed dispensing qualification or prescription-dispensing skill. Certificate verification is not the application gate. Common Level labels have full Guild/National Training Register explainers; generic award classification is distinct from dispensing competencies.
10. **Published pay privacy:** backend `shifts/rate_visibility.py` owns viewer policy. Pharmacy and active owner-chain staff do not receive published rates even when visibility widens to Public; managers retain rates. Favourites and external organisation/public applicants receive rates unless they also have an internal staff relationship. Redaction includes slot pay, posted salary/rate/super/payment fields and nested pharmacy rate defaults. Shift emails use the same rule. Next/Vite/Expo consume the mapped explicit flag. A worker's own agreed invoice line items remain available.
11. **Staff agreement pricing:** community claims now call the existing staff engagement service and record immutable settlement snapshots. Payroll-enabled staff use dated employment rates, with existing overnight/weekend/holiday segmentation; payroll-disabled staff remain timesheet-only and never lock the external advertised rate. The same pricing function is used by roster creation/replacement and staff offer finalization. Accepted external offer terms retain their precedence and ABN/TFN settlement route. Existing incomplete historical roster snapshots retain their locked values rather than being overwritten from advertising.

## Ownership map

| Responsibility | Owner |
| --- | --- |
| Registry identity, aliases, role claim modes, icons, qualification vocabulary | `shared-core/skills_registry.json` |
| Talent subtype, filters and skill grouping | `shared-core/src/domains/talent/presentation.ts` |
| Work-profile mapping/grouping/verification text | `shared-core/src/domains/shifts/workProfile.ts` |
| Recurrence and date-specific payload/rate rows | `shared-core/src/domains/shifts/draftSlots.ts` |
| Private booking and widening capability helpers | `shared-core/src/domains/shifts/visibility.ts` |
| Browser role selections | `shared-core/src/domains/shifts/skillPresets.ts` |
| Pharmacy profile vocabulary/validation | shared-core organizations domain; `backend/organizations/pharmacy_profile.py` |
| Active owner chains | `backend/organizations/chains.py` |
| Current onboarding profile and qualifications | `backend/onboarding/services/work_profile.py`, `backend/onboarding/qualifications.py` |
| Published-rate visibility/redaction | `backend/shifts/rate_visibility.py` |
| Employment/payment snapshots | `backend/shifts/engagement.py`; dated models remain in workforce |
| Rate calculations | `backend/shifts/pricing.py` |

Models remain in onboarding, organizations, shifts and workforce. Historical Django `client_profile` labels/table names and migration placement are intentional identity compatibility, not permission to put business logic in the compatibility kernel. Ownership/boundary checks passed. Remaining host UI orchestration is described below; do not claim the whole branch has zero duplication.

## Database and verification evidence

Additive migrations: `0073_pharmacy_profile_and_shift_support.py`, `0074_otherstaffonboarding_dispensary_qualification_and_more.py`. Migration 0074 adds a qualification claim, admin verification flag and review note; there is no historical certificate-to-qualification approval backfill and no deletion. The local PR165 database was backed up before applying 0074. Its ignored backup is `playground/db-backups/pr165-before-qualification-20261012.dump` (1,373,534 bytes). Preserve it locally. No production migration occurred.

Focused validation completed before publication preparation: 45 shared-core tests in seven files; 122 relevant backend regression tests; a later 88-test rate/claim/posting/roster/engagement run; Vite, Next and Expo typechecks; shared build; architecture, package, transport and static wiring audits. Some labels overlap between runs: these counts are not additive unique-test totals. The first rate run had one test assertion expecting `$77.50` instead of the formatter's `$77.5`; the corrected run passed.

Synthetic browser checks used the actual production web form/card with mocked API dispatch. Deliberate clearing survived forward/back; chainless Public audience had no chain switch; Automatic/12 hours survived navigation; a 77.50 custom date retained pharmacy guide 65; a direct booking without `embedded` submitted only to its dedicated worker with no widening/broadcast; each successful submit called completion once. This proves those local fixture paths, not live end-to-end persistence or native device acceptance. Vite shared-package cache needed refreshing after rebuilding exports.

Workspace policy normally requires the outgoing exact-commit regression gate before publication. The user's later explicit immediate-push instruction superseded that timing for this draft feature branch. The full gate is pending and must not be inferred from focused tests. PR165 remains draft until the gate, hosted checks and staging acceptance are reviewed.

## Remaining work for the next agent

1. **Native runtime acceptance:** Expo typechecks pass, but no current device/Metro visual acceptance is claimed. The inherited mobile node_modules junction caused earlier Expo Web problems. Use a supported installation when doing runtime acceptance; do not count web fixture screenshots as native proof.
2. **Native posting parity:** the inherited handover's native Review step and travel/accommodation/urgent extras remain unfinished. Native Pay layout still differs from web. These are separate from the completed candidate review fix.
3. **Large form orchestration:** recurrence, date-specific slot payload/rate policy and talent policy are shared, but the web/native forms still repeat presentation state and some top-level payload assembly. Further split pure draft policies before introducing another full form or copying models. A whole-form refactor was not silently bundled into the targeted bug fixes.
4. **Further surfaces:** Shift Centre requirement summaries, candidate skill-match presentation and pre-existing talent-feed query cost were optional inherited follow-ups. Do not mark them completed from the candidate dialog work.
5. **Acceptance/release:** inspect final remote checks and staging persistence/real browser/native behavior. Verify external ABN/TFN accepted offer terms and employee payroll/timesheet routes with supported account types. This branch is not production acceptance.
6. **Keep launch work separate:** the archived Claude handover contains later entries for `feat/launch-journey-completion-20261012`. Those commits are not integrated here. They include newer dated-claim/cancellation work; reconcile deliberately if integrating branches, especially `shifts/browse.py`, engagement snapshots, slot occurrence identity and rate privacy. Do not resume that paused programme based on this archive.

## Reading order and archive

- `README.md` — current facts, ownership and remaining work.
- `EVIDENCE.md` — primary-source research, observed before/after behavior and local check scope.
- `archive/HANDOVER_PR165_POSTSHIFT_before_senior_fixes.md` — original Claude form work and unfinished parity tasks.
- `archive/CLAUDE_HANDOVER_PR165_FIXES_before_latest_fixes.txt` — earlier fixes/presets plus clearly historical separate-programme entries.
- `archive/PR165_SKILLS_REVIEW_previous_branch.md` and `archive/DESIGN_DECISIONS_previous_branch.md` — previous checkout's recorded design work.
- `archive/SENIOR_REVIEW_PR165_before_fixes.txt` — initial reproduced findings; its outstanding status is superseded above.

No playground fixture, database backup, real credential or generated user belongs in a commit. Publishing the reviewed handover copies here is the user's explicit exception for handover documentation.
