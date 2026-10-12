# Handover: PR 165 Post shift redesign (2026-10-12)

## Senior review update (2026-10-12)

Read `playground/SENIOR_REVIEW_PR165_2026-10-12.txt` before continuing. The current uncommitted work is **not approved**.
The focused checks were independently rerun: 30 shared-core tests, 43 backend tests, Vite/Next/Expo typechecks and
architecture/shared-core/package/transport/static-wiring audits passed. The full testing package was not run.

Priority fixes: recurring Review rates versus persisted rates; retain private booking semantics in the Next-to-Vite
handoff; resolve Other Staff subtype before the generic category; complete Expo candidate profile rendering; keep
preset initialization/manual edits and automatic widening state across step navigation; resolve current onboarding
profile by account role; invoke completion once (the roster callback can otherwise delete the old shift twice).

Anti-spaghetti work remains: consolidate the duplicated talent filtering/grouping and extract shared shift draft,
recurrence and payload policy. Model ownership is preserved; historical `client_profile` labels are intentional.
Expo Review/extras and Shift Centre requirement coverage remain unfinished. No live save/reload or native browser
proof was performed in this review. The claimed `scratchpad/pr165run/shots/` evidence was not found here.

This review changed only ignored playground evidence/handover files. No tracked application fixes, live database
changes, commits, pushes or merges were performed. The report separates new regressions from inherited bugs and
lists exact trigger conditions and source locations.

Checkout `pr165-skills-design`, branch `design/pr165-skills`, HEAD `bbc4ee3`. Everything below is **uncommitted**. Nothing has
been pushed or merged, and no database migration was applied. Nothing in `playground/` may be committed.

## Done in this session

### 1. One Post shift wizard, no duplicates
- The step components and helpers moved from `frontend_web/src/pages/dashboard/sidebar/` to `frontend_web/shared/postShift/`
  (`git mv`):
  - `PostShiftDetailsStep`, `PostShiftSkillsStep`, `PostShiftVisibilityStep`, `PostShiftTimetableStep`,
    `PostShiftPayStep`, `PostShiftWizardShell`
  - `helpers.ts` (was `PostShiftPage.helpers.ts`; `ORG_ROLES` now comes from shared-core)
- **New `shared/postShift/PostShiftForm.tsx`** holds the whole wizard. Hosts pass in user/persona, `navigate`, `search`,
  `isDarkMode`, `apiClient`, `renderHeader` and an optional `renderPreview`.
- **Vite `PostShiftPage.tsx`** is now about 20 lines: hooks plus `<PostShiftForm/>`.
- **The Next Post shift page was deleted.** Its only caller was "Book" on the public talent board
  (`landing_next/migrated/.../TalentBoard/index.tsx`). Book now navigates to the Vite page,
  `{resolveUserHomePath base}/post-shift?dates&start_time&end_time&dedicated_user&role`. The Vite page already reads
  that pre-fill. The dialog, its state and `previousSearch` were removed.
- Removed about 3,200 duplicated lines in total.

### 2. Details (web and mobile)
- Order: "Who do you need?" (role cards using `RoleTile`) → type of work toggle → pharmacy (a dropdown only when there is
  more than one) → description, with "Use saved description" / "Save for future shifts" → "On the day" → Extras.
- **Workload:** tiles with a symbol, label and explainer.
  - Web uses `SkillGlyph icon_web`.
  - Mobile uses the new registry field `icon_mobile` (MaterialCommunityIcons). `WorkloadTag.icon_mobile` is optional.
- **Support:** − / + steppers for 4 common roles; Intern and Student sit behind "More roles". Uses `setSupportCount`.
  Code is in `shared/PharmacyProfileFields.tsx` (`ShiftContextFields`) and
  `frontend_mobile/roles/shared/pharmacies/PharmacyProfileFields.tsx`.
- **Extras (web):** Travel and Accommodation switches; Urgent is a red-styled switch.
- **Mobile:** role chips used to show raw codes (PHARMACIST); they now show labels.

### 3. Visibility (web and mobile)
- Radio cards only; the duplicate audience dropdown is gone. Audience names are plain: Your pharmacy team, Your favourite
  staff, Your other pharmacies, Your organisation, Everyone on ChemistTasker.
- **"Still not filled? Open it up later":** Automatic | Choose times (mobile: Choose dates) | Don't widen.
  - Automatic uses the new shared-core `autoEscalationDates(tiers, everyHours, from)` with a 12 h / 1 day / 2 days choice.
    It has a vitest test.
  - A numbered timeline shows when each group opens. An inline warning appears if the times are out of order.
- **"When it goes live":** notify switches and "Hide the pharmacy name".
- The hint wording matches the backend: escalation happens only while nobody has shown interest
  (`backend/shifts/escalation.py`).

### 4. Timetable
- **Plain words:** Add a date / Add date, Repeat every week, One person works every date, "Start and finish times can move
  a little", Your dates (n), and calendar navigation "‹ Earlier / Later ›" so it no longer clashes with the wizard's
  Back/Next.
- **Errors are inline instead of toasts:**
  - **Web:** `timetableError` lives in the form and shows as an Alert inside the add box. The "Add at least one date"
    message shows next to the Next button (shell state `blocked`).
  - **Mobile:** the error moved below the step, next to the buttons, and is announced to screen readers. Messages
    reworded.

### 5. Pay
- **Web:** rewritten in sections.
  - Pharmacist: "How is the rate set?" radio cards (Open to offers / Fixed rate / Pharmacist's own rate) with fixed
    descriptions, hourly rate fields with $ and /hr, and "Save as this pharmacy's usual rates".
  - "How they are paid": Contractor (ABN) / Employee (TFN), and "Super paid on top".
  - Award roles: guide link and "Extra on top".
  - Full-time/part-time: From / Up to.
  - "Rate for each date" shows the total for the shift.
- **Mobile:** wording only (labels, rate types, ABN/TFN, super, save button). The layout is unchanged.

### 6. Review step (web, new)
- The last step renders the real job board card. `ShiftBoardPreview` (Vite ShiftsBoard) wraps `ShiftList` with every
  action off.
- The draft comes from `buildPayload()`, the same payload submit sends, through `shiftsDomain.mapShift`, newly exported
  from `domains/shifts`.

### 7. Progress header (web and mobile)
- **Web:** Lucide step tiles with brand tones.
  - Steps: Details, Skills, Who sees it, Dates, Pay, Review.
  - The current step is solid violet with a ring. Finished steps keep their tone and get a check badge. The connector
    is a violet-to-cyan gradient.
  - Steps are clickable backwards, or anywhere when editing.
  - On phone width: "Step n of N" plus a segmented bar.
- **Mobile:** new `PostShiftProgress.tsx`, the same idea with MaterialCommunityIcons. It replaced the horizontal pill
  tabs.

### Checks run (focused only, as you asked)
- Vite `tsc -p tsconfig.app.json`: 0 errors. Next `tsc`: 0. Expo `tsc`: 0.
- Shared-core build passes; `context.test.ts` 9/9 passes.
- Architecture and shared-core boundary audits pass (run before the Review/progress changes; **re-run them**).
- Playwright proof (`scratchpad/pr165run/postshift_proof.cjs`): a full Vite run as a playground owner at 1280 and
  390 px. It completed with 0 page errors and no horizontal overflow; screenshots are in `scratchpad/pr165run/shots/`.
  - **Reviewed:** Details, Visibility and Review on desktop.
  - **Not reviewed visually:** the new progress header (the `*-3-header.png` captures), the phone captures and the Pay
    step.

## Open tasks I started and have not finished

| # | Task | State | Plan to finish |
|---|------|-------|----------------|
| 1 | Look at the new progress header | Built; screenshots taken, not reviewed | Open `shots/desk-3-header.png` and `phone-3-header.png`. Check dark mode once. Tune spacing and contrast (finished-step label colour is `--ct-tone-*-fg`, AA by design). |
| 2 | Expo browser proof | Not working: `frontend_mobile/node_modules` is a junction to `pr165-design-review`, so Metro refuses the out-of-root entry (404/500). Expo is stopped. | Replace the junction with a real `npm ci` in `pr165-skills-design/frontend_mobile` (as was done for web), start `npx expo start --web --port 8166` with the `EXPO_PUBLIC_*` variables from the PR165 memory, then take one Playwright screenshot of Post shift (Details, Visibility, progress). |
| 3 | Mobile Pay layout | Wording only | Optional: mirror the web sections (rate-type cards, $/hr fields). Low risk, about 1 file. |
| 4 | Mobile Review step | Not started; web only | Add a `review` step key with a native preview card: reuse the native shift card component from the mobile shift board with the draft built by `shiftsDomain.mapShift`. |
| 5 | Mobile Extras (travel/accommodation/urgent) | Mobile Post shift never had these | Check `PostShiftScreen.tsx` submit; add switches and payload fields if the owner wants parity. |
| 6 | Split `PostShiftForm.tsx` further (about 1,450 lines) | Duplication removed; the file is still large | Extract `useShiftTimetable` (slots, calendar and selection state, the add/edit handlers, about 450 lines) and `buildPayload`/preview into `postShiftPayload.ts`. Keep the props of the step components unchanged. |
| 7 | Mobile CounterOfferDialog work profile | Found earlier, not started | Show skills and software (grouped, with logos) in `frontend_mobile/.../ActiveShiftsPage/components/Dialogs/CounterOfferDialog.tsx`, matching the web `CandidateProfile`; the data now comes from `user_detail`. |
| 8 | Docs | Not updated | Add a Post shift section to `docs/frontend/DESIGN_DECISIONS.md` (the decisions above) and update `PR165_SKILLS_REVIEW.md`. |
| 9 | Re-run focused checks | Partly done | Boundary audits again; `vitest run` for shared-core; backend focused tests are unchanged since the last run. |

## Optional tasks (not started; next after the open ones)
1. Show requirements on Shift Centre cards: reuse `ShiftRequirementSummary`.
2. Show a skill match on interested candidate cards: compare `mustHave`/`niceToHave` with the candidate's `work_profile` skills.
3. Fix the talent-feed slowness that predates this PR: per-post reactions and profile fields still issue many queries.
   Use `scratchpad/pr165run/feed_queries.py` to count queries, then add prefetch/annotate.

## Running stack
- Backend `pr165_backend` :8165, with the database `chemisttasker_pr165` in `ctpg`.
- Web: Next :3165, Vite :5165, started via `dev-all.mjs`. Restart them after a shared-core rebuild: Vite caches the old
  build and reports "does not provide an export".
- Expo: not running.

## Rules still in force
- No push or merge without your approval.
- Full CI and the regression gate only when you ask to push.
- Back up the database before any migration.
- `playground/` stays uncommitted.
