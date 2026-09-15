# Owner workflow baseline — 2026-09-05

Captured before application edits: 244 source files in `source-before.zip` and hashes in `source-before.json`; 16 real-component desktop/mobile screenshots in `before/`. Synthetic data and intercepted requests, not live records. See `scripts/check_owner_workflows.cjs`.

## Post Shift — complete source inspected

| Area | Existing fields, branches and connected interactions |
|---|---|
| Context | Owner/organisation/admin membership; admin pharmacy lock; `edit`, `embedded`, pharmacy/pharmacy_id, role/role_needed, date/slot_date, dates/slot_dates, start_time/start, end_time/end, visibility, employment_type, dedicated_user/dedicated_user_id. Prefill applied once; edit loads all existing fields; scoped edit access rejected when mismatched. |
| Details | Pharmacy; six roles (pharmacist, technician, assistant, intern, student, explorer); locum/casual label plus full/part-time; description template loading/use/save; description; travel, accommodation, urgency; three workload tag toggles. Existing template GET/POST and pharmacy PATCH defaults preserved. |
| Skills | Pharmacist/otherstaff catalogue; clinical, software, expanded-scope accordions; selected counts; required/favourable exclusive toggles allow clearing, move code between arrays. Labels/descriptions retained. |
| Visibility | Allowed pharmacy/favourite/owner-chain/organisation/public audiences determined by hasChain/claimed; select and rich cards; anonymous only org/public; immediate notifications conditionally exposed/reset; timed escalation for later tiers. Embedded forces favourite private audience and disables notification payloads. Editing omits new-shift notification fields. |
| Timetable | Only locum/casual: flexible timing, same-person requirement; date/start/end/manual add; pharmacy weekday/weekend/holiday hours and closed warning (still editable); weekly recurrence/days/end date; month/week/day calendar navigation and bounds; click/drag/time-slot selection; selected day custom times/add one/add all/clear/remove; existing slot edit/delete; recurring chips and event preview. No calendar or preview removed. |
| Rates | Pharmacy defaults; pharmacist fixed/flexible/provided; ABN/TFN; super toggle; six base rates and save defaults; non-pharmacist award link/bonus; asynchronous per-occurrence preview with loading/error/success and dirty manual overrides; full/part-time hourly min/max or annual min/max/super. |
| Validation | Required pharmacy/role/employment at submit; locum requires slots at timetable Next and submit; hourly requires min/max; annual requires min/max/super. Slot operations reject missing dates/times, end≤start, past dates, incomplete recurrence, duplicates. Bulk selection ignores past dates then validates each remaining time. Preserve actual rules, do not invent stronger validation. |
| Submission/results | Existing create/update service, exact snake-case payload and conditional nulls, recurrence/slot rates/dedicated user; submitting disables action; server error formatting; success snackbar; embedded callback or delayed owner/admin/org redirect. Back/Next and edit-only step jumping retained. |

## Shift Centre — implementation and dependency map

| Area | Existing functionality to retain |
|---|---|
| Routed navigation | Active / Confirmed / History for owner, organisation and pharmacy-scoped admin. Missing/invalid section replaces route with active. Admin wrappers retained. |
| Active data | Active list or poster detail selected by `shift_id`; `slot_id`, `notification_id`/`_ntf`; notification reload, expansion/scroll; per-level/per-slot member/interests loading; pending counteroffers; deduped person counts; direct/private groups sorted first; six-item pagination and scroll. No general filter bar currently rendered; selectedPharmacyId is an existing TODO, not a working filter to replace. |
| Active cards/details | Expand/collapse keyboard controls, location/role/type/urgent/summary chips; slot/candidate/interest metrics; level selection guarded by viewable levels; escalation action; single-user versus per-slot selection; update indicators persisted in localStorage, shift-slot-activity subscription; community/public candidate states. |
| Candidate actions | Review offers/members/interests; reveal through service and update caches; ratings summary/comments pagination; slot resolution; assign and await candidate confirmation; accept/reject counteroffer; reminder/buzz and loading/result dialogs; reload dependent data. |
| Related writes | Public-only sharing produces share/referral tokens and clipboard URL; edit opens existing Post Shift route; delete confirmation/service; payment-required slot choices, pills payment and Stripe checkout/free completion. These are business writes, never clicked against production. |
| Confirmed | API list and admin filter; shared OwnerAssignedShiftBoard; expandable shift/slot details, role/type/urgency, counts, assignment status, assigned-profile API dialog/loading/errors, profile links and pagination. |
| History | History API/admin filter; same rich board; assigned profile; existing worker rating GET, stars/comment and save loading/error/success; pagination. Rating writes not submitted. |

Source audit covers PostShiftPage, ShiftCenterPage, ActiveShiftsPage controller and seven hooks, Confirmed/History controllers and shared board interaction mapping. Full candidate-dialog visual/state testing is a later increment; those files are unchanged here. Snapshot and machine inventory preserve their exact controls, conditions and handlers. No claim of full production end-to-end verification.

## First scoped changes justified by baseline

- Mobile centre navigation clips “Confirmed Shifts”; wrap full labels at ≥12px, preserve icons and selected styling.
- Post Shift uses rounded fields/cards inconsistently (MUI numeric radii multiply a 12px base) and relies on unbundled Inter. Centralise its existing local theme, use supplied local fonts and explicit practical radii.
- Clickable audience cards and edit-step labels lack keyboard activation. Add keyboard support to the same click actions, selected state and control labels.
- Baseline selected primary chips use dark text over purple: fix semantic filled-chip contrast without changing state.

Initial browser checks: 16 screenshots, 24 route/width/action-availability checks, no uncaught errors. Direct Vite baseline build produced output with existing bundle warnings; typecheck has pre-existing errors (log retained). Standard environment wrapper cannot run without the missing production env file.
