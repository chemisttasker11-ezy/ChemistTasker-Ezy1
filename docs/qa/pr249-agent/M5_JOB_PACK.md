# M5 job pack (owner decision D10): Shifts, Shift Centre and Post shift, web look and full web parity. 7 November 2026

D10 (owner, 2026-11-04, then made an end-of-job pass by decision 36): the native Shifts tab and the Shift Centre (owner
first, then organization and pharmacy admin) look like the web and carry every web feature; Post shift (owner and admin)
gets the web look and full parity, with description templates create/edit/delete, the posting-window check and
draft/publish back in scope (docs/mobile/DECISIONS.md:129-142). Never drop an owner-built feature or workflow; simplify
means better UX, not fewer jobs.

This is a source-reviewed brief, NOT a test or approval report. Line references are on **aa149d0e** (local/pr249-int =
M1-M3 + V1 + merged M4-01/02/03/05/08), unless labelled otherwise. Paths are repo-relative. NEW marks files that do not
exist yet.

## A. Contract and ground rules

1. **Base.** Every job starts from **origin/wip/pr249-int at 5c28634d** (= aa149d0e + merged M4-06 and M4-07; pushed
   2026-11-07 with the owner's go). Line references below are on aa149d0e and still hold except shared-core/src/index.ts
   exports and the M4-06 learning/talent files. Branch `agent/m5-<id>`. M5-02 starts from the approved
   `agent/m5-01` head and M5-05 from the approved `agent/m5-04` head (they edit the same files). Never touch other branches,
   PRs, CI, secrets or deployment settings.
2. **Commits.** Tests-only commit(s) first: `test(<area>): M5-<id> failing <observable gap>`; then fix commit(s):
   `fix(<area>): M5-<id> <observable outcome>`. Limit 3-5 files and 300-500 lines per commit, so split tests and fixes into
   several staged commits, but ALL test changes come before the first fix commit (rule 13). Never weaken an assertion in a
   later commit. The whole numbered matrix goes into the tests-only commits.
3. **R and C.** R = fails on the base today (an observable gap against the web); C = control that passes before and after.
   Never call a C a fixed bug, never claim an R was red unless you ran it. If an R passes on base, report it and stop that
   item.
4. **shared-core** owns API calls, wire types and domain rules (audience levels, posting date window, labels that are
   policy). Mobile owns layout, navigation and platform I/O. No new endpoint, no client HTTP, no copied server policy, no
   backend change (backend files in this pack are C tests only).
5. **Web is the reference and stays unchanged**, except the one rewire named in M5-01 (web audience labels read from
   shared-core, same output). **Do not change `frontend_web/shared/postShift/useShiftTimetable.ts`** (M4-08 gate) or any
   other `frontend_web/shared/postShift/*` file. No Next (landing_next) counterpart exists for these screens: N/A
   (checked: no tracked PostShift/ShiftCentre/ActiveShifts file under frontend_web/landing_next).
6. **Keep every existing native feature**, including mobile-only ones: template delete, pull of all pages, deep links
   (`?shift_id`, `?slot_id`, `?notification_id`/`_ntf`, `?edit`, `?section`, `?tab=accepted`), dedicated/private section,
   Stripe and Pills payment, checkout-conflict recovery, deferred payroll activation, ratings, unsaved-changes guard,
   synchronous double-tap locks, scope keys and generation guards, V1 fit-or-selector tabs (D38/D39: no swipe).
7. **Design (D5/D6/D10).** Same features, data, rules and copy as the web; built the native way (one column, bottom sheet or
   dialog instead of hover, 44 pt / 48 dp targets, TalkBack/VoiceOver labels, light mode only (D2), Lucide icons (D1)).
   Read and apply, in this order: house theme first (`frontend_mobile/constants/tokens.ts`, `frontend_mobile/components/ui/*`,
   web `frontend_web/src/theme/sleekTheme.tsx`, `docs/frontend/DESIGN_DECISIONS.md`,
   `docs/frontend/IMPECCABLE_UI_UX_RULES.md`), then the skills, all in the repo:
   - ui-ux-pro-max: `.agents/skills/ui-ux-pro-max/SKILL.md`
   - taste: `.agents/skills/design-taste-frontend/SKILL.md`
   - impeccable: `.claude/skills/impeccable/SKILL.md` (repo copy of the local `~\.codex\skills\impeccable\SKILL.md`)
   - expo-native-ui: `.claude/skills/expo/expo-native-ui/SKILL.md`
   - vercel-react-native-skills: `.claude/skills/vercel-react-native-skills/SKILL.md`
   Use the house kit (`IconTile`, `Pill`, `CountBadge`, `Hint`/`InfoHint`, `MetricStrip`, `PageHeader`, `SegmentTabs`,
   `ContentState`, `ConfirmDialog`, `InitialsAvatar`, `CandidateRow`, `Button`, `ScalePressable`, exported from
   `frontend_mobile/components/ui/index.ts:1-26`) before any new component. Tone/colour only from tokens; no raw hex
   except where the file already has one.
8. **Out of scope:** backend changes, server drafts (see O1), web redesign, worker boards (Public/Community/My shifts:
   C controls only), iOS acceptance (O3), dark mode.
9. **Not verified** must be written for every command or device flow you could not run. Our gates: Claude B (red/green on
   local PostgreSQL and node), Argon (visual on the Android emulator), Codex B (senior, last gate). You are not the gate.

## B. Harness rules (copy of M4, all 22 apply; full text in M4_GATE_FEEDBACK.md beside this file)

Patterns to copy: mobile `frontend_mobile/scripts/m4-explorer-shifts.test.cjs:1-125` (senior-approved: transpiles the
complete `ShiftsScreen.tsx`, strict imports, collect/mount helpers) and `scripts/m4-attendance.test.cjs`; web
`frontend_web/shared/postShift/m4CalendarPreview.test.mjs` (mounts the real PostShiftForm); shared-core
`shared-core/src/domains/shifts/postingDraft.test.ts` (Vitest); backend
`backend/client_profile/characterization_support.py:20-66` fixtures and `backend/shifts/test_shift_posting_contract.py`.

1. Mocks need `{ __esModule: true, default: X }` (or the require shim in the M4 patch).
2. Transpiled hooks run as `(0, react_1.useX)(...)`: never `this.useMemo` in a mock, use the mock object name.
3. Reset a hand-rolled `useState` store per mount.
4. Changing behaviour: grep EVERY test that pins the old behaviour and update it in the tests-only commit, with the reason.
5. Implement every numbered test of the job. A missing one = FIX FIRST.
6. `require('../node_modules/typescript')` repo-relative, never absolute.
7. Time zones: set `process.env.TZ` before requiring anything (the posting-window tests need it: use `Australia/Sydney`).
8. A web test of a file importing `@chemisttasker/shared-core` must mock it with EVERY export the file uses; when a file
   gains a shared-core import, update every mock factory for that file.
9. vm realms: compare `JSON.parse(JSON.stringify(x))`.
10. Shared-core async transport tests: await every pending call before inspecting the transport mock.
11. Never re-create production policy in a test (no copy of `resolveShiftSurface`, `hasAdminCapability`, audience levels):
    load the real module.
12. Before the fix commit list every existing test that imports or source-reads the files you change; the head must not
    break any test that passes on base. Known source-regex pins here: `frontend_mobile/roles/shared/shifts/ActiveShiftsPage/visualContract.test.mjs:4-15`
    (styles.ts), `postShiftScopeMutations.test.mjs:4-9` and `postShiftTemplateRecovery.test.mjs:4-9` (PostShiftScreen.tsx,
    PostShiftDetailsStep.tsx), `workerShiftPermissions.test.mjs:6-15` (PublicShiftsView.tsx, ConfirmedShiftsView.tsx),
    `confirmedHistory.test.mjs`, `activeShifts.test.mjs`, `postShiftLogic.test.mjs`, `postShiftSlotRepair.test.mjs`,
    `shiftSurface.test.mjs`, `shiftsBoard.test.mjs`, `scripts/m4-explorer-shifts.test.cjs`. Convert a pin that your change
    breaks into a behaviour test in the tests-only commit and list it under "J5 conversion" in the delivery.
13. All test changes before the fix commits.
14. A C must pass on base: build fixtures from the code path really read.
15. Error paths throw the real `ApiError` (`shared-core/src/transport/errors.ts:3-12`, `new ApiError(message, status, payload)`).
16. BOM: `new TextDecoder('utf-8', { ignoreBOM: true })` (not used here; keep if you touch exports).
17. `onPress={() => void fn()}`: flush macrotasks until the mock settles before asserting.
18. Rendered text can be split across nodes: match with a regex (`/2\s*waiting for review/i`).
19. Backend fixtures must satisfy model/service validation.
20. Python must parse; never name a helper `self.client`.
21. Race tests: resolve the deferred promise AFTER the switch; double tap = two presses from the SAME render.
22. A guard that must stop a forbidden call must be synchronous; count API calls during any redirect.

Local gate commands (Claude B): `node --test <explicit m5 + touched existing paths>` from repo root; from
`frontend_mobile` `npx.cmd tsc --noEmit` and `npx.cmd expo lint`; from `shared-core` `npm.cmd run test:ci -- <paths>`,
`npm.cmd run typecheck`, `npm.cmd run build`; web `node --test` on touched web tests and `npx.cmd tsc --noEmit` in
`frontend_web`; backend `python manage.py test shifts.test_m5_posting_scope shifts --settings=core.postgres_test_settings --keepdb`.
Trap: mobile tsc through the shared-core link may resolve another tree; new shared-core exports can show TS2305 there
(environment only, report it).

## C. Personas (fixtures for every job)

| Persona | Fixture | Shifts tab | Shift Centre (Active/Confirmed/History, candidates) | Post shift |
|---|---|---|---|---|
| Tom, owner | OWNER, owns pharmacies A and A2 | Active, Confirmed, History, Public, Community (`shiftSurface.ts:141`) | full, own pharmacies; Nadia's B rows never appear | `/owner/post-shift`, create/edit A and A2 |
| Lina, org admin | org-wide admin of A's org, `orgCapabilities(user).roster` true | same 5 sections | all org pharmacies (`useShiftSurface.ts:15-33`) | `/organization/post-shift` |
| Dee, pharmacy admin | admin assignment at A with MANAGE_ROSTER | Active, Confirmed, History (`shiftSurface.ts:142`) | A only; rows of other managed pharmacies filtered out (`ActiveShiftsPage/hooks/useShiftsData.ts:33-39`) | `/admin/A/post-shift`; edit of a B shift refused (M5-04 R4) |
| Sam, staff-only admin | admin at A WITHOUT MANAGE_ROSTER | Active section shows "No shift management access" (`ActiveShiftsPage/index.tsx:939-950`), zero list calls | none | forbidden state (`PostShiftScreen.tsx:102`, helpers `:413-424`), zero POST |
| Omar, pharmacist; Ali, other staff (TECHNICIAN) | worker roles | board + Confirmed + History (`shiftSurface.ts:144`), unchanged | none | `/owner/post-shift` deep link -> forbidden, zero POST |
| Zoe, explorer | EXPLORER | Public + Community only (M4-05, `shiftSurface.ts:143`) | none | forbidden, zero POST |
| Nadia, foreign owner | OWNER of B outside Tom's org | her own data only | Tom's shift id -> absent/404 | cannot post for A (server 403) |

Server truth (unchanged, cite in tests): GET `/api/v1/shifts/active/` = `shifts_managed_by` created-by or managed pharmacy
(`backend/shifts/lifecycle.py:95-121`, `backend/shifts/selectors.py:13-15`); POST `/api/v1/shifts/`, PATCH and DELETE
`/api/v1/shifts/<id>/`, POST `.../escalate/` require `user_can_manage_pharmacy` (`backend/shifts/base.py:131-151`,
`:118-128`, `:194-200`; `backend/organizations/access.py:164-173`: owner, org admin, chief/region admin, pharmacy admin
with roster capability); anonymous 401, wrong scope 403. Templates `/api/v1/shift-description-templates/`
(`backend/shifts/description_templates.py:21-77`, router `backend/shifts/urls.py:33-37`): list = managed pharmacies only
(`:25-38`), POST is an upsert per pharmacy+role (201 created, 200 updated, 400 missing/invalid role, 403 foreign pharmacy,
`:46-71`), PATCH `:73-77`, DELETE through the managed queryset (foreign 404).

## D. Screens: web reference, native today, parity

### D1. Shifts tab / Shift Centre shell (owner, organization, admin)

Web: `frontend_web/src/pages/dashboard/shiftCenter/ShiftCenterPage.tsx:26-101` (PageHeader title "Shift Centre" + persona
subtitle `:108-109` owner, `:119-120` organization, `:140` admin; SegmentTabs Active/Confirmed/History with Play/CircleCheck/
History icons `:73-89`; invalid section redirects to active `:37-41`); routes `frontend_web/src/main.tsx:437-439` owner,
`:270-272` organization, `:332-334` admin.
Native: `frontend_mobile/roles/shared/shifts/ShiftsScreen.tsx:28-91` (sections from `shiftSurface.ts:135-145`, V1 tabs,
section subtitle `shiftsScreenLogic.ts:32-49`, scope-keyed panel `:85-88`); routes `app/owner/shifts/index.tsx`,
`app/admin/shifts/index.tsx`, `app/organization/shifts/index.tsx` -> `roles/*/shifts/index.tsx` -> ShiftsScreen.

| Web feature | Native | Shared-core / domain |
|---|---|---|
| Title "Shift Centre" + persona subtitle | missing (only tabs + section line) | copy only |
| Active / Confirmed / History tabs, default Active, bad section -> Active | same (+ Public/Community for owner/org, kept) | `shiftSurface.ts` (mobile policy, M4-05) |
| Deep link to a section | same (`?section=`) | - |

### D2. Active shifts list (the Shifts list)

Web: `frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/index.tsx:59-305`, list
`ActiveShiftsList.tsx:9-112`, card `ActiveShiftCard.tsx:401-757`; data `hooks/useShiftsData.ts:13-31`
(`fetchActiveShifts`, `fetchPosterShiftDetailService`); audience `utils/audience.ts:18-27` (web-only file today).
Native: `frontend_mobile/roles/shared/shifts/ActiveShiftsPage/index.tsx:88-1141`, cards `ActiveShiftCards.tsx:168-740`,
styles `styles.ts`, data `hooks/useShiftsData.ts:5-60` (`fetchAllActiveShifts`, scope filter, generations).

| Web feature (file:line) | Native (file:line) | Status | Shared-core |
|---|---|---|---|
| Loading skeletons, "Loading active shifts" (`ActiveShiftsList.tsx:50-55`) | ContentState loading (`index.tsx:930-936`) | different (ok) | - |
| Error "Active shifts did not load" + "<error> Check your connection and try again." + "Try again" (`:56-63`) | "Could not load active shifts" (`index.tsx:953-967`) | different copy | - |
| Empty "No active shifts" / "Shifts you post appear here while they are being filled." / "Post a shift" (`:64-72`) | "No active shifts found" / other text / "Post shift" (`index.tsx:969-982`) | different copy | - |
| Dedicated first + "Direct / Private Offers" header (`:28-36`, `:83-88`) | same (`index.tsx:920-929`, `ActiveShiftCards.tsx:366-370`) | same | - |
| 6 per page + Pagination (`:20`, `:95-107`) | one scroll list of all | different (native way, keep) | - |
| Header: Building2 IconTile violet 48, pharmacy name in display font (`ActiveShiftCard.tsx:436-441`) | solid coloured Store mark, name (`ActiveShiftCards.tsx:383-392`) | different look | - |
| Pills: role and employment humanized (`:448-449`, `humanizeEnum`), Urgent, summary with calendar icon, Direct/Private + Pending (`:447-454`) | raw enum role/employment (`:440-445`), summary as subtitle (`:393-397`), Direct/Private + Pending after stats (`:490-495`) | different | - |
| Location with MapPin (`:455-458`) | same (`:452-457`) | same | - |
| Share / Edit / Delete icon actions, labels "Share shift link", "Edit shift", "Delete shift" (`:712-757`) | same actions, "Share shift" label (`:400-434`) | label differs | `generate-share-link` via existing hook |
| 3 metrics Slots / Candidates / Interested with tone tiles and hints (`:358-361`, `:466-487`) | Slots / Candidates / "Interests", no hints (`:463-487`) | different | counts already computed natively (`:311-320`) |
| Status bar: audience pill "Internal · My Pharmacy" / "Platform · ChemistTasker" with hint (`:500-513`), "N waiting for review" (`:514-516`), "Payment required" (`:517`), "New activity on N dates" (`:518-525`) | missing (new-activity badge only inside SlotSelector, `components/Candidates/SlotSelector.tsx:79-85`) | missing | audience levels: move `audience.ts:18-27` to shared-core (M5-01) |
| "Manage candidates" / "Hide candidates" toggle with aria-expanded (`:527-539`); whole card also toggles (`:405`) | card press toggles; "Collapse shift card" (`:717`) | different | - |
| Deep link `?shift_id`/`?slot_id` expands + scrolls; `notification_id` reload (`index.tsx:105-145`) | same (`index.tsx:157-169`, `:294-357`, `:1123-1126`) | same | - |
| Edit -> post-shift `?edit=` per persona (`index.tsx:206-215`) | same (`index.tsx:845-854`) | same | - |
| Checkout conflict dialog: Cancel / Expire unpaid and replace / Continue existing checkout (`index.tsx:291-301`) | Alert with same choices (`index.tsx:237-266`) | same (native dialog) | billing API in shared-core |
| Description in expanded card | native shows it (`ActiveShiftCards.tsx:501-505`); web card shows none | native extra, keep | - |

### D3. Shift Centre: one shift's candidate workspace (expanded card)

Web: `ActiveShiftCard.tsx:542-700`; stepper `components/Escalation/EscalationStepper.tsx:95-300`; network
`components/Candidates/CommunityLevelView.tsx:78-140`; platform `components/Candidates/PublicLevelView.tsx:117-241`;
columns `components/Candidates/StatusCard.tsx:42-100`; parts `src/pages/dashboard/shiftCenter/ShiftCentreParts.tsx:26-266`
(NewActivityBadge, RowAction primary/secondary/buzz, CandidateRow, CandidateColumn, SourceSection, PlatformMark).
Native: `ActiveShiftCards.tsx:497-717`; `components/Escalation/EscalationStepper.tsx` (labels `:90`, CTA `:240-273`);
`utils/displayHelpers.ts:29-37` (level labels); `components/Candidates/CommunityLevelView.tsx:82-121`,
`PublicLevelView.tsx:164-331`, `StatusCard.tsx:221-233`, `SlotSelector.tsx`; kit `components/ui/CandidateRow.tsx:14-48`
(exists, unused by the Shift Centre today).

| Web feature | Native | Status | Shared-core |
|---|---|---|---|
| Stepper heading "Who can see this shift" + InfoHint "Audiences widen step by step" (`EscalationStepper.tsx:101-110`) | no heading/hint | missing | - |
| Level labels My Pharmacy / Favourites / Chain / Organization / ChemistTasker and reach text (`audience.ts:18-24`) | Full/Part Time / Locum/Casual / Owner Chain / Organization / "Chemisttasker" (`displayHelpers.ts:29-37`, `EscalationStepper.tsx:90`) | different | shared audience levels (M5-01) |
| Step captions Live now / Notified / Next / Later (`:181`); step help text (`:95-97`) | not shown | missing | - |
| CTA "Need more candidates?" + "Escalating notifies <reach>." + "Escalate to <label>" (`:278-297`) | "Ready to widen your search?" + "Escalate" (`:240-273`) | different copy | - |
| Locked level -> "Escalate to this level to review members status." (`index.tsx:190-193`) | same (`index.tsx:808`) | same | - |
| Payment required box, slot selection, Pay with Stripe / Pills, "Payment pending" (`ActiveShiftCard.tsx:568-680`) | same (`ActiveShiftCards.tsx:527-615`) | same (look differs) | billing in shared-core |
| Network section "Your network", subtitle "Internal candidates reached through <reach>.", hint (`CommunityLevelView.tsx:78-88`) | "Community Candidates" chip (`:82`) | different | - |
| Columns in order Interested / Assigned / No reply / Rejected with helper and empty text (`:101-133`) | Interested / Assigned / Rejected / "No Response", no helpers (`:89-121`), "No candidates yet." (`StatusCard.tsx:233`) | different | - |
| Platform section "ChemistTasker platform" + subtitle + hint (`PublicLevelView.tsx:117-127`) | "ChemistTasker Public Candidates" (`:164`) | different | - |
| Columns "Counter offers" ("Asked for a different rate or time.") and "Interested" ("Applied at the posted rate.") (`:137-194`) | "Counter offers" and "Interested matches" (`:171`, `:245`) | different | - |
| Row: "Anonymous applicant" / "Reveal to see name and profile", pills "Awaiting payment" / "Offer sent · awaiting reply", actions Reveal / Review / View, Buzz only pending and not awaiting payment (`:200-238`; StatusCard `:90-100`) | rows with Buzz (`PublicLevelView.tsx:331`, `StatusCard.tsx:221`) | different labels | reveal/offer/buzz APIs in shared-core (existing hooks) |
| Counter offer dialog, worker profile dialog, ratings paging | same (`index.tsx:1075-1107`) | same | - |

### D4. Confirmed and History (owner/org/admin)

Web: `sidebar/ConfirmedShiftsPage.tsx:52-125` (deferred payroll `:161-198`, board `:205-212`),
`sidebar/HistoryShiftsPage.tsx:62-195` (rating dialog `:146-195`), board `sidebar/OwnerAssignedShiftBoard.tsx:150-431`.
Native: `roles/shared/shifts/ConfirmedShiftsView.tsx` (deferred payroll `:53-110`, `:197-246`; board `:248-255`; profile
dialog with Message `:257-264`), `HistoryShiftsView.tsx` (load `:80-83`, rating `:149-198`, dialog `:249-287`), board
`OwnerAssignedShiftBoard.tsx:149-360`.

| Web feature (OwnerAssignedShiftBoard.tsx) | Native (OwnerAssignedShiftBoard.tsx) | Status |
|---|---|---|
| Empty "No confirmed shifts yet" / "No past shifts yet" + page emptyText "Shifts show here once a worker is booked and confirmed." / "Finished shifts show here, so you can check them and rate the team." (`:196-200`; pages `ConfirmedShiftsPage.tsx:209`, `HistoryShiftsPage.tsx:128`) | "No confirmed shifts available." / "No past shifts found." (`ConfirmedShiftsView.tsx:252`, `HistoryShiftsView.tsx:232`) | different copy |
| Metrics Slots / Assigned / Interested with hints (`:218-222`) | Slots / Assigned / "Interests" (`:239-241`) | different |
| Pills humanized role, employment, Urgent (`:259-261`) | raw role, `replace('_',' ')` employment (`:217-228`) | different |
| Status pill "Confirmed · N dates booked" / "Completed · N of M dates booked" (`:297-303`) | missing | missing |
| Toggle "View booked dates" / "View dates" / "Hide dates" (`:304-317`) | card press only, "Shift Slot Grid" / "Assigned Slot Grid" headings (`:247-254`) | different |
| Per date: Booked / Worked / Not filled pill (`:352-354`), "No one was booked for this date." (`:385`), locked rate with hint (`:376-382`) | grid cells with locked rate (`:261-310`) | partly missing |
| Actions: View profile (`:391-392`), Message on Confirmed -> chat with that user (`:395-398`), Rate on History (`:400-402`) | "View Assigned" (`:329`), Rate (`:348`); Message only inside the profile dialog (`WorkerProfileDialog.tsx:66-80`) | label differs; Message row action missing |
| 6 per page (`:167-175`, `:418`) | one scroll list | different (keep) |
| Deferred payroll + Activate payroll; rating dialog | same | same |

### D5. Post shift (owner `/owner/post-shift`, organization, admin `/admin/<id>/post-shift`)

Web: host `frontend_web/src/pages/dashboard/sidebar/PostShiftPage.tsx:10-20`, admin
`src/pages/dashboard/admin/AdminPostShiftPage.tsx:4-7`, form `frontend_web/shared/postShift/PostShiftForm.tsx` (scope
`:72-78`, edit `:79`, prefill `:81-92`, `:289-390`, pharmacies `:156-172`, edit load + scope refusal `:176-189`/`:181-183`,
notify/anonymous rules `:432-445`, steps `:463-470`, submit `:498-530`, destination `:518-524`, review copy `:712-718`,
header `:743`); shell `PostShiftWizardShell.tsx:31-183`; steps `PostShiftDetailsStep.tsx:78-175`,
`PostShiftVisibilityStep.tsx:90-204`, `PostShiftPayStep.tsx:133-269`, `PostShiftTimetableStep.tsx`; hooks
`useShiftTimetable.ts:28-31` (date window) and `:288-299` (past dates), `useShiftDescriptionTemplate.ts`,
`useShiftPricing.ts`; error text `helpers.ts:235-253`.
Native: `frontend_mobile/roles/shared/shifts/PostShiftScreen.tsx` (params/access `:74-102`, step order `:226`, init
`:596-664`, hydrate `:432-449`, template list/use/save/delete `:695-828`, dates `:884-905`, slots `:1036-1110`, unsaved
guard `:1181-1187`, submit `:1210-1247`, review `:1407-1408`, header/progress `:1474-1484`, date picker `:1536-1556`);
steps `PostShiftDetailsStep.tsx`, `PostShiftSkillsStep.tsx`, `PostShiftVisibilityStep.tsx`, `PostShiftTimetableStep.tsx`,
`PostShiftPayRateStep.tsx`, `PostShiftProgress.tsx`, `NativeShiftBoardPreview.tsx`; helpers `PostShiftScreen.helpers.ts`
(`canAccessPostShift :413-424`); routes `app/owner/post-shift.tsx`, `app/organization/post-shift.tsx`,
`app/admin/post-shift.tsx`, `app/admin/[pharmacyId]/post-shift.tsx`. Legacy duplicate: `app/owner/shifts/create.tsx` ->
`roles/owner/shifts/create.tsx:21-127` (old one-page form calling `createShift` with `hourly_rate`; no nav entry links to
it, only the header title `app/owner/_layout.tsx:45`).

| Web feature | Native | Status | Shared-core |
|---|---|---|---|
| Steps Details, Skills, Who sees it, Dates (locum-like), Pay, Review (`PostShiftForm.tsx:463-470`) | same order (`:226`, helpers `:71`) | same | - |
| Payload, validation, preview | same calls (`:1207-1225`, `:1408`) | same | `buildShiftPostingPayload`, `validateShiftPostingDraft`, `buildShiftPostingPreview` (`domains/shifts/postingDraft.ts`) |
| Description template: use, save ("Save for future shifts", "Saving…") (`PostShiftDetailsStep.tsx:127-136`) | use, save, delete, retry (`PostShiftDetailsStep.tsx:135-160`, screen `:768-828`) | native has more (keep); "Saving…" label missing | `listShiftDescriptionTemplates`, `saveShiftDescriptionTemplate`, `deleteShiftDescriptionTemplate` (`domains/shifts/descriptionTemplates.ts:4-14`) |
| Posting window: dates today .. end of the 4th month ahead (`useShiftTimetable.ts:28-31`), date inputs minDate (`PostShiftTimetableStep.tsx:222,314`), month clamp (`:614-616`), "Past dates were left out." / "That date has passed. Pick today or later." (`useShiftTimetable.ts:292-299`) | past dates dropped silently (`PostShiftScreen.tsx:884-887`), no max, picker has no range (`:1536-1556`) | missing | NEW `domains/shifts/postingWindow.ts` (web keeps its copy until the M4-08 freeze lifts) |
| Server error shown (ApiError message via `formatPostShiftError`, `helpers.ts:235-236`) | always "Unable to save shift" (`:1240`; reads `e.response.data.detail`, ApiError has none) | wrong | `ApiError` (`transport/errors.ts`) |
| After save -> Shift Centre (owner/org/admin, `PostShiftForm.tsx:518-524`); "Shift posted successfully!" / "Shift updated successfully!" | `router.back()` (`:1237`); "Shift posted" / "Shift updated" | different | `shiftRoute` (mobile policy) |
| Admin editing another pharmacy's shift -> "You do not have access to this shift." + back (`:181-183`) | hydrates it (`:432-449`) | missing | - |
| Section titles + hints (Details `:78,123,140,145`; Visibility `:90,94,123,190`; Pay `:133,149,185,206,254`) | titles mostly present, hints and pay headings missing (`PostShiftDetailsStep.tsx:90-183`, `PostShiftPayRateStep.tsx:144-453`) | partly missing | - |
| Review helper "This is how your shift appears on the job board. Go back to change anything." (`:717`) | preview only (`:1407-1408`) | missing | - |
| Progress "Step n of N", "Next:", jump back (`PostShiftWizardShell.tsx:31-60,128-129`) | same (`PostShiftProgress.tsx:20-60`, screen `:1483-1484`) | same | - |
| Draft / publish | none on web, none on server (one submit, `PostShiftForm.tsx:498-530`; docs/mobile/W3_WEB_TO_EXPO_FUNCTIONAL_PARITY_REVIEW_2026-11-04.md:24) | not on either | owner decision O1 |

## E. Jobs (2-3 per ChatGPT message)

Order and messages: **Message 1:** M5-01, M5-03, M5-04 (independent, base 5c28634d). **Message 2:** M5-02 (from approved
agent/m5-01) and M5-05 (from approved agent/m5-04). **Message 3:** fix rounds only (M5-06 is dropped: owner O1).

### M5-01 Shift Centre shell and Active list cards (owner first; same code serves organization and admin)

Invariant: every web list feature and copy is on the native list, from the same data; no new API call; scope and
permissions unchanged.
Files: NEW `shared-core/src/domains/shifts/audience.ts` (`SHIFT_AUDIENCE_LEVELS` with key, label, reach, scope,
requiresOrganization, copied from web `audience.ts:18-24` without icons; `getShiftAudienceLevel(key)`), export lines in
`shared-core/src/domains/shifts/index.ts` and `shared-core/src/index.ts` (beside `:82-86`); web
`frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/utils/audience.ts` builds `AUDIENCE_LEVELS` from the shared list
plus its icons (exports unchanged); mobile `roles/shared/shifts/ShiftsScreen.tsx`, `ActiveShiftsPage/ActiveShiftCards.tsx`,
`ActiveShiftsPage/index.tsx`, `ActiveShiftsPage/styles.ts`. Humanize with the existing mobile helper
`humanize` (`roles/shared/shifts/WorkerBookedShifts.tsx:49-50`); if importing a screen file is awkward, move that one-liner
to `roles/shared/shifts/utils/` and re-export it from WorkerBookedShifts.
Tests: NEW `frontend_mobile/scripts/m5-active-shifts.test.cjs` (mount the real ShiftsScreen and ActiveShiftsPage; mock
shared-core network calls only), NEW `shared-core/src/domains/shifts/audience.test.ts`, NEW
`frontend_web/src/pages/dashboard/sidebar/ActiveShiftsPage/utils/m5Audience.test.mjs`; convert
`ActiveShiftsPage/visualContract.test.mjs` if styles change (rule 12).

1. R `shell_title`: Tom/Lina/Dee ShiftsScreen shows "Shift Centre" and the web persona subtitle (`ShiftCenterPage.tsx:108-109,119-120,140`) above the tabs; Omar/Zoe do not.
2. R `audience_pill`: shift visibility FULL_PART_TIME renders "Internal · My Pharmacy"; PLATFORM renders "Platform · ChemistTasker"; the pill's hint text equals web `:502-503` ("Visible now to <reach>." + escalate line for internal).
3. R `status_pills_collapsed`: on the collapsed card, 2 unique interested people -> "2 waiting for review"; payment options present -> "Payment required"; a notification payload for slot 2 -> "New activity" badge on the card (web `:518-525`).
4. R `metrics_and_hints`: metric labels Slots / Candidates / Interested (not "Interests"), each with its web hint as accessibility hint (`:358-361`).
5. R `humanized_pills`: role PHARMACIST -> "Pharmacist", employment LOCUM -> "Locum"; Urgent stays.
6. R `manage_candidates_toggle`: button "Manage candidates" with `accessibilityState.expanded=false`; press -> "Hide candidates", expanded true, candidate area mounted; press again collapses. C: card body press still toggles.
7. R `list_states_copy`: empty -> "No active shifts" / "Shifts you post appear here while they are being filled." / action "Post a shift" pushing the persona path (`activeShiftRuntime.ts:39-44`); load error -> "Active shifts did not load", description ends "Check your connection and try again.", "Try again" calls the loader once more.
8. R `share_label`: share action accessibility label "Share shift link" (web `:712-715`); C edit/delete labels and handlers unchanged, delete opens the existing confirm dialog.
9. C deep links: `?shift_id=12&slot_id=34` expands 12 and selects 34; a new `notification_id` reloads once; dedicated shifts listed first under "Direct / Private Offers"; Stripe/Pills handlers called with the same offer IDs; checkout conflict keeps its three choices.
10. C scope: Dee sees only A rows; Sam gets the forbidden state and ZERO `fetchAllActiveShifts` calls; switching Tom -> Nadia while the list is deferred never renders Tom's rows (resolve after the switch, rule 21).
11. C shared-core audience: every key, label, reach and scope equals the web list; unknown key -> undefined. C web: `getAudienceLevel` returns the same objects with icons as before.

Argon checklist (emulator 1080x2400 at 420 dpi and a 360 dp width, font scale 1.0 and 1.3, owner then admin):
header "Shift Centre" + subtitle; card = web card on a phone (IconTile, display-font name, pill row, location, metric strip,
status bar, "Manage candidates"); no clipped or two-line-broken pills at 360 dp; targets >= 48 dp; AA contrast on every
pill; TalkBack reads each metric with its hint and the toggle's expanded state; empty and error states match web copy;
side-by-side with web `/dashboard/owner/shift-center/active` at 390 px wide.

### M5-02 Shift Centre candidate workspace (escalation, network/platform candidates, payment box)

Base: approved `agent/m5-01` (uses the shared audience levels). Invariant: same candidates, actions and API calls as
today; copy, grouping and order as the web; reveal/offer/buzz/escalate unchanged and single-flight.
Files: mobile `ActiveShiftsPage/components/Escalation/EscalationStepper.tsx`, `ActiveShiftsPage/utils/displayHelpers.ts`
(`getLevelLabel` reads the shared levels), `components/Candidates/CommunityLevelView.tsx`, `PublicLevelView.tsx`,
`StatusCard.tsx`, kit `frontend_mobile/components/ui/CandidateRow.tsx` (add only what the web row has and the kit lacks:
`onBuzz` + `'buzz'` busy action, and a "View" label for pending/awaiting rows). Reuse `PlatformMark` image
`assets/images/chemisttasker-platform.png` already required in PublicLevelView `:15`.
Tests: NEW `frontend_mobile/scripts/m5-shift-centre.test.cjs` (mount ActiveShiftsPage expanded on a real-shaped shift).

1. R `stepper_copy`: heading "Who can see this shift"; levels "My Pharmacy", "Favourites", "Chain", "Organization", "ChemistTasker" (no "Chemisttasker", no "Full/Part Time"); captions Live now / Notified / Next / Later; CTA title "Need more candidates?", body "Escalating notifies <reach>.", button "Escalate to <label>".
2. R `network_section`: "Your network" with "Internal candidates reached through <reach>."; columns in the order Interested, Assigned, No reply, Rejected with the web helper and empty texts (`CommunityLevelView.tsx:101-133`).
3. R `platform_section`: "ChemistTasker platform" + web subtitle; columns "Counter offers" (helper "Asked for a different rate or time.", empty "No counter offers yet.") and "Interested" (helper "Applied at the posted rate.", empty "No platform applicants yet.").
4. R `platform_rows`: unrevealed row "Anonymous applicant" / "Reveal to see name and profile" / action "Reveal"; revealed -> "Review"; pending -> pill "Offer sent · awaiting reply", action "View" + "Buzz"; awaiting payment -> pill "Awaiting payment", "View", no Buzz.
5. C reveal, review offer, accept/reject counter offer, buzz: one call each per press, two presses from the same render = one call; failure keeps the row and shows the existing snackbar.
6. C escalation: locked level -> snackbar "Escalate to this level to review members status." and no call; success -> reloads tab data and shifts; server 403 ApiError("Permission denied.") shown, level unchanged.
7. C payment box: slot selection, Pay with Stripe / Pills with the selected offer IDs, "Payment pending" pill; unchanged.
8. C personas: Dee escalates an A shift; Sam never mounts the workspace (no member-status calls).

Argon checklist: expanded card at 360 dp reads like the web workspace stacked in one column (stepper, payment box, "Your
network" then "ChemistTasker platform", tinted column headers with counts); horizontal stepper fits or scrolls without
clipping at font 1.3; Buzz uses the amber look; reveal shows the anonymous avatar until revealed; TalkBack order follows the
visual order; one action per row is primary.

### M5-03 Confirmed and History boards (owner, organization, admin)

Invariant: same shifts, assignments, rates and actions; web copy and per-date status; contact (Message) only on Confirmed
(owner decision 2026-10-14, `WorkerProfileDialog.tsx:2`).
Files: mobile `roles/shared/shifts/OwnerAssignedShiftBoard.tsx`, `ConfirmedShiftsView.tsx`, `HistoryShiftsView.tsx`. The
Message action reuses `startDirectChat` (`roles/shared/chat/hooks`) and `getMessageDetailRoute` (`utils/chatRoutes`) the
way `WorkerProfileDialog.tsx:66-80` does, with its generation guard.
Tests: NEW `frontend_mobile/scripts/m5-assigned-boards.test.cjs`; update `confirmedHistory.test.mjs` /
`workerShiftPermissions.test.mjs:14-15` only if your change breaks them (rule 12).

1. R `status_pill`: Confirmed card with 2 assigned dates -> "Confirmed · 2 dates booked"; History with 1 of 3 booked -> "Completed · 1 of 3 dates booked".
2. R `dates_toggle`: "View booked dates" (Confirmed) / "View dates" (History) / "Hide dates", with expanded state; date rows mount only when open.
3. R `date_rows`: pill "Booked" (Confirmed), "Worked" or "Not filled" (History); unfilled History date shows "No one was booked for this date."; primary action label "View profile" (not "View Assigned").
4. R `message_action`: Confirmed row "Message" -> `startDirectChat({ userId })` once, then navigates to the persona's message detail route; History rows have no Message; double tap = one call; old account's completion does not navigate.
5. R `copy`: metric "Interested"; humanized role and employment pills; empty states "No confirmed shifts yet" / "No past shifts yet" with the web descriptions.
6. C View profile calls `viewAssignedShiftProfileService` with shift, slot and user; Rate opens the rating dialog, loads the existing rating, saves once; deferred payroll card and "Activate payroll" unchanged; Dee sees only A; load error + retry unchanged.

Argon checklist: card = web article on a phone (header, pills, location, metric strip, status bar pill + dates toggle);
date rows readable at 360 dp and font 1.3; "Worked"/"Not filled" pills AA; Message and Rate secondary, View profile primary;
compare with web `/dashboard/owner/shift-center/confirmed` and `/history`.

### M5-04 Post shift correctness parity: posting window, error text, destination, edit scope, legacy route (owner + admin)

Invariant: native accepts exactly the dates the web accepts, shows the server's message, lands where the web lands, never
offers another pharmacy's shift to a scoped admin, and every create path uses the canonical payload.
Files (split into commits): NEW `shared-core/src/domains/shifts/postingWindow.ts`
(`shiftPostingDateWindow(today) -> { minIso, maxIso }` = today .. last day of the 4th month after today, exactly
`useShiftTimetable.ts:28-31`; `splitPostableDates(isoDates, today) -> { valid, past, late }`), export lines in
`domains/shifts/index.ts` and `shared-core/src/index.ts`; mobile `PostShiftScreen.tsx` (merge dates `:884-905`, add-all
`:1104-1110`, submit `:1210-1247`, hydrate `:432-449`, date picker `:1536-1556` `validRange`), `PostShiftTimetableStep.tsx`
(month arrows stop at the window, past/late cells disabled); `roles/owner/shifts/create.tsx` becomes a `<Redirect>` to
`/owner/post-shift` forwarding `pharmacy_id` as `pharmacyId` (keep the route file). Error text: show `err.message` for an
`ApiError`, else the existing fallback (this is what web shows: `helpers.ts:235-236`). Destination: `router.replace` to
`shiftRoute(persona, { section: 'active' })` (`shiftSurface.ts`), toasts "Shift posted successfully!" / "Shift updated
successfully!". Edit scope: if the scoped admin's pharmacy differs from the loaded shift's pharmacy, show "You do not have
access to this shift." and go back without hydrating (web `PostShiftForm.tsx:181-183`).
Tests: NEW `frontend_mobile/scripts/m5-post-shift.test.cjs` (mount the real PostShiftScreen; TZ set first, fixed clock),
NEW `shared-core/src/domains/shifts/postingWindow.test.ts`, NEW `backend/shifts/test_m5_posting_scope.py` (C only).
Keep `postShiftScopeMutations.test.mjs` and `postShiftTemplateRecovery.test.mjs` passing or convert them (rule 12).

1. R `window_range`: the multiple-date picker gets `validRange` = { today, end of 4th month ahead }; on 2026-11-07 (Sydney) the max is 2027-03-31; "Next month" is disabled on March 2027 and "Previous month" on November 2026.
2. R `past_dates_message`: confirming [yesterday, tomorrow] adds only tomorrow and shows "Past dates were left out."; confirming only yesterday adds nothing and shows "That date has passed. Pick today or later."; a date after the max is refused with the same rule as the picker.
3. R `server_error_text`: create rejects with `new ApiError('Maximum of 10 public shifts per day reached for A.', 400, {detail: '...'})` -> that text is shown (base shows "Unable to save shift"); form keeps every field; retry posts once.
4. R `success_destination`: Tom create success -> replace to `/owner/shifts?section=active`, toast "Shift posted successfully!"; Lina -> organization path; Dee -> admin path; edit success -> "Shift updated successfully!" and the same destination.
5. R `admin_edit_scope`: Dee scoped to A opens `?edit=<B shift>` -> "You do not have access to this shift.", back, no field shows B's data, no PATCH. C: Dee editing an A shift hydrates and PATCHes once; Tom editing his own shift unchanged.
6. R `legacy_create_route`: `/owner/shifts/create?pharmacy_id=7` redirects to `/owner/post-shift?pharmacyId=7`; `createShift` is never called.
7. C templates: list per pharmacy+role, auto-fill once, "Use saved description", save (upsert) and delete with stale-scope guard (switch pharmacy while save is deferred -> no write to the new scope); delete keeps the current description.
8. C posting: two presses of Post from the same render -> one `createOwnerShiftService`; validation error -> no POST; unsaved guard still blocks leaving with edits; URL prefills apply once and never over user edits; private booking (`dedicated_user`) keeps "Send Booking Request" in embedded mode.
9. C access: Sam, Omar, Ali, Zoe on any post-shift route -> forbidden state, zero POST/PATCH.
10. C backend (PostgreSQL, real URLs, fixtures from `characterization_support.py`): POST `/api/v1/shifts/` Tom for A 201, Lina for A 201, Dee for A 201 and B 403, Sam 403, Omar/Ali/Zoe 403, Nadia for A 403, anonymous 401; PATCH the same matrix on an A shift; templates: list shows managed pharmacies only, POST 201 then 200 for the same pharmacy+role, DELETE of Nadia's template by Tom 404. Payload from `buildShiftPostingPayload` of a valid draft.
11. C shared-core: window and split on month ends, leap year (2028-02-29), year rollover, a Sydney DST day; inputs never produce `Invalid Date`.

Argon checklist: picker shows greyed dates outside the window; month arrows stop at both ends; past-date message visible
and read by TalkBack; server error text visible above the footer; after posting the app lands on Shifts > Active with the new
shift; scoped admin opening a foreign edit link sees the refusal; `/owner/shifts/create` opens the full Post shift wizard.

### M5-05 Post shift web look (owner + admin)

Base: approved `agent/m5-04`. Invariant: no logic change; every step shows the web's section titles, hints and helper copy
in the native layout; footer always reachable.
Files (split): mobile `PostShiftDetailsStep.tsx`, `PostShiftVisibilityStep.tsx`, `PostShiftPayRateStep.tsx`,
`PostShiftProgress.tsx`, `PostShiftScreen.tsx` (header via kit `PageHeader`, review helper, footer),
`PostShiftScreen.styles.ts`. One local `StepSection` (title + optional hint, kit tokens) inside the steps folder, the web
pattern `PostShiftDetailsStep.tsx:78-145` (web), no new kit component unless two screens need it.
Tests: NEW `frontend_mobile/scripts/m5-post-shift-look.test.cjs` (mount each real step component).

1. R `details_hints`: "About the shift" + "What should the person know before they apply?"; "On the day" + "Optional. Helps people judge the workload before they apply."; description placeholder equals web `:125`.
2. R `pay_headings`: "How they are paid"; "Rate for each date" + "Change any date that pays differently."; "Pay" + "Shown to applicants as a range."; "How is the rate set?"; "Award rate" (web `PostShiftPayStep.tsx:133-254`), each where the web shows it for the same employment/rate type.
3. R `review_helper`: Review step shows "This is how your shift appears on the job board. Go back to change anything." above the preview.
4. R `template_saving_label`: while saving, the save button reads "Saving…" and is disabled.
5. C visibility step titles/hints already present stay (`PostShiftVisibilityStep.tsx:104-212`); header "Create a New Shift" / "Edit Shift" + "Follow the steps to post a new shift opportunity."; progress "Step n of N", "Next: <label>", jump back only to done steps (or any step when editing).
6. C every field setter still freezes the unsaved baseline (`PostShiftScreen.tsx:1181-1205`); keyboard does not cover the focused field (KeyboardAvoidingView or scroll-to-input; test the prop wiring, Argon checks the device).

Argon checklist: each step at 360 dp and font 1.3 looks like the web wizard on a phone (section cards with title + hint,
chips wrap, no horizontal scroll); footer Back / Next / Post shift sticky above the keyboard and the tab bar; date grid cells
>= 44 dp; review preview equals the board card; AA on hints; owner and admin both.

### M5-06 Post shift draft / publish: DROPPED (owner 2026-11-07: draft/publish matches web, no build; revisit only as a new feature on both)

Today neither web nor server has a shift draft: one submit (`PostShiftForm.tsx:498-530`), `POST /api/v1/shifts/`
publishes; senior note docs/mobile/PR249_SENIOR_EXPO_CONTINUATION_2026-11-05.md:74 forbids faking a server draft.
- If the owner picks **O1-a, draft on this phone** (recommended, no backend): "Save draft" stores the current
  `ShiftPostingDraft` per account + persona + pharmacy scope with the AsyncStorage pattern of
  `frontend_mobile/features/parity/marketplaceDraft.ts:1-35` (NEW `roles/shared/shifts/postShiftDraft.ts`); reopening Post
  shift offers "Resume draft saved on this phone <time>" / "Discard"; "Post shift" publishes and clears the draft only after
  the server confirms; edit mode never writes a draft; copy never says "saved" on the server. Tests: R save -> restart ->
  resume restores every field; R account switch never shows another account's draft; C publish failure keeps the draft;
  C two saves from one render = one write.
- If the owner picks **O1-b, server drafts**: new backend state + endpoints + web; not a ChatGPT job (Codex A high +
  Claude B backend gate), planned separately.

## F. Delivery template (per job, one reply)

```text
Job: M5-<id> - <title>
Base: <full SHA you started from>
Branch: agent/m5-<id>
Tests-only SHAs: <full SHAs, in order>
Fix SHAs: <full SHAs, in order>
Files changed: <exact paths; mark NEW test / NEW production / changed production / converted test>
R red/green: <each R test name -> file:line of the failing assertion on base -> exact failure text -> PASS at head>
C mapping: <each C test -> control it proves; PASS on base and head>
J5 conversion: <existing pinned test path:line -> new behaviour test name; nothing deleted without reason>
API: <every shared-core call the screen makes; no new endpoint; any mismatch with this pack>
Sibling coverage: <owner, organization, admin routes and aliases (app/*/shifts, app/*/post-shift, app/admin/[pharmacyId]/post-shift, app/*/shifts/[id]) checked>
Design self-review: <each Argon checklist line -> how the code meets it; skills applied>
Commands run: <exact commands, pass/fail counts> 
Not verified: <every command, PostgreSQL run, emulator/device flow you could not run>
Open: <facts you could not settle; do not guess>
```

Owner rule (2026-11-07): test, verify and review your own work before replying. Run the real tests in your sandbox (if a
clone fails, get the branch through the GitHub connector or an archive). Paste exact commands and counts, the red line of
every R on the base and green at your head, then self-review the diff against this pack item by item. "Could not run
tests" is not a final state: say what you tried and try another way.

Local gate (orchestrator runs, per job): (1) Claude B checks out the tests-only head in its own worktree, proves each R red
and each C green, records commands; (2) applies the fix head, reruns the same tests unchanged plus the full mobile node list,
mobile tsc/lint, shared-core test/typecheck/build, touched web tests, `shifts` on PostgreSQL; (3) Argon runs the job's
checklist on the emulator (owner, then admin; Medium_Phone_API_36.1, 360 dp check, font 1.3, TalkBack) with web
screenshots beside; (4) Codex B senior gate traces callers, aliases, scope and races; (5) orchestrator merges in order
01, 03, 04, 02, 05, 06 and reruns full suites. Merge review points: `shared-core/src/index.ts` and
`domains/shifts/index.ts` exports (01, 04, and M4-06), `PostShiftScreen.tsx` (04, 05, 06), `ActiveShiftCards.tsx` (01, 02).

## G. Owner decisions (settled 2026-11-07)

- **O1 draft/publish:** owner answer: matches web, no build (no draft on web or server; revisit later as a new feature on
  both). M5-06 is dropped. Do not add any draft UI.
- **O2 posting window:** the web's date window (today to the end of the 4th month ahead, past dates left out), checked on
  native the same way. No server check in M5.
- **O3 templates:** ONE saved description per pharmacy + role, as the server keeps it today (use, save/update, delete).
  No named multi-templates.
- **O4 web template delete:** leave web as is; D10 changes mobile only (backlog note: web cannot delete a saved
  description).
(O2-O4 decided by the orchestrator under the owner's mandate "you are the boss": each one keeps today's web/server
behaviour, which is what D10 asks for.)
