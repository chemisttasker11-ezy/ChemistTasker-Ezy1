# GM-25 — Web / Next / Expo parity & UX — Grill Me trace

> **Corrections against current code (21 Nov 2026 review).** 12 claims checked at `main` `8ccf8f77` and `pr257` `21add924`; 6 hold, 6 below need the correction shown. Where a question below says otherwise, this table wins. Full evidence: [`../followup/claim-check-2026-11-21.md`](../followup/claim-check-2026-11-21.md).

| Where | Claim in this file | Verdict | Correct statement | Evidence |
|---|---|---|---|---|
| Q01, first question; Q17 | No native build, screenshots or authenticated acceptance has happened | UNVERIFIABLE by code reading | These source files establish an implemented app and API configuration, not its execution history. Replace historical PR249 gate statements with separately dated evidence for the candidate under review. | `pr257:frontend_mobile/app/_layout.tsx:314`; `pr257:frontend_mobile/config/api.ts:1` |
| C01 / C08 | Pharmacist add-profile still reaches legacy unsupported form | STALE | The PR257 onboarding route redirects to `/pharmacist/profile-basic-info`. The legacy component’s continued presence does not prove that this route still submits its unsupported fields. | `pr257:frontend_mobile/app/pharmacist/onboarding.tsx:5` |
| C04 / C09 / Q05 | Explorer shifts is a reachable placeholder | WRONG — already false at traced head | Explorer shifts exports the shared Shift Centre. Do not list it as a blank “Shifts” placeholder. | `pr257:frontend_mobile/roles/explorer/shifts.tsx:2` |
| C09 / Q05 / Q15 | Owner hub placeholder remains the reachable owner experience | WRONG | The owner hub route exports the shared HubScreen. A legacy placeholder file exists, but it is not the implementation selected by this route. | `pr257:frontend_mobile/app/owner/hub.tsx:1` |
| Q05 / Q15 | Pharmacist learning remains “Coming Soon” | STALE | PR257 implements learning-resource fetching, search, pagination and error states. It should be assessed as a functioning content surface, not a placeholder. | `pr257:frontend_mobile/roles/pharmacist/learning.tsx:101`; `pr257:frontend_mobile/roles/pharmacist/learning.tsx:180` |
| Q13 / Q17 | Accessibility/device/release readiness inferred from old ledger | UNVERIFIABLE | Source includes large-text accommodations, but this does not prove visual acceptance or store readiness. Keep those as separately evidenced runtime checks for PR257. | `pr257:frontend_mobile/app/register.tsx:640`; `pr257:frontend_mobile/app/welcome.tsx:246` |

Repo: `chemisttasker11-ezy/ChemistTasker-Ezy1`
Trace date: 2026-11-21 (AEST). Read-only. No code changed, no PR/issue/comment created.
Re-run of the blocked 2026-11-21 trace (same day, after the GitHub rate limit cleared).

## Web and Expo today, side by side (pr257 `21add924`)

Source for both web and Expo is `origin/agent/pr257-int` `21add924` (what merges to main). Read-only code check by agy, 21 Nov 2026; every cited file:line was checked to exist at that commit. "Parity question" = a choice for the owner, asked in this area's rounds. "Possible defect (to verify)" = drift that looks unintended; it is confirmed in code before it goes to the engineering backlog, never asked as a question. The Platforms table says which platforms each question applies to.

| Flow | Web (Vite + Next) | Expo | Same? | If different |
|---|---|---|---|---|
| Sign up / login / email OTP | Vite handles registration (`frontend_web/src/pages/register.tsx:28`) and Next handles landing login (`frontend_web/landing_next/app/(public)/login/page.tsx:4`). | Mobile provides native email/password and OTP login screens (`frontend_mobile/app/login.tsx:143`). | Yes | |
| Worker onboarding & credential verification | Pharmacist submits AHPRA and ID in multi-step wizard (`frontend_web/src/pages/onboarding/onboarding_pharmacist/PharmacistOnboardingV2Layout.tsx:20`). | Pharmacist completes credentials via profile basic info redirect (`frontend_mobile/app/pharmacist/onboarding.tsx:5`). | Yes | |
| Owner / pharmacy onboarding & setup gate | Owner registers pharmacy details with setup checklist (`frontend_web/src/pages/onboarding/OwnerOnboarding.tsx:837`). | Owner completes pharmacy setup in native step wizard (`frontend_mobile/app/owner/onboarding/step1.tsx:1`). | Yes | |
| Shift posting flow (single / multi-slot) | Owner creates shift via multi-step wizard (`frontend_web/src/pages/dashboard/sidebar/PostShiftPage.tsx:10`). | Owner creates shift with duplicate draft recovery and escalation settings (`frontend_mobile/roles/shared/shifts/PostShiftScreen.tsx:79`). | Yes | |
| Public shift discovery (logged out) | Next renders landing board (`frontend_web/landing_next/app/(public)/shifts/public-board/page.tsx:5`) and Vite renders discovery page (`frontend_web/src/pages/PublicJobBoardPage.tsx:74`). | Native anonymous shift board renders public shift cards (`frontend_mobile/app/shifts/public-board.tsx:4`). | Yes | |
| Shift offer negotiation and acceptance | Worker reviews offer terms and confirms booking reservation (`frontend_web/src/pages/dashboard/sidebar/PublicShiftsPage.tsx:468`). | Worker reviews offer and accepts with reservation prompt (`frontend_mobile/roles/pharmacist/shifts/[id].tsx:356`). | Yes | |
| Talent board discovery & booking request | Authenticated users search talent cards and request bookings (`frontend_web/src/pages/dashboard/sidebar/TalentBoard/components/TalentCardV2.tsx:278`). | Mobile users browse candidate cards and submit booking proposals (`frontend_mobile/roles/shared/talent-board/components/AvailabilitySidebar.tsx:22`). | Yes | |
| Goods & Ethical marketplace | Managed on Next web ; missing from Vite (`frontend_web/landing_next/app/(public)/marketplace/page.tsx:15`, `frontend_web/src/main.tsx`). | Supported natively in mobile marketplace screens (`frontend_mobile/features/parity/marketplace.tsx:31`). | Yes | Parity question: Marketplace operates on Next web and Expo, completely omitted from Vite web. |

### Platforms per question
| Question id | Platforms |
|---|---|
| GM25-C01 — Must every onboarding step work on mobile at launch? | Web + Expo (asked in GM-01: GM01-Q10) |
| GM25-C02 — Browse access before full verification | Web + Expo (asked in GM-01: GM01-Q04) |
| GM25-C03 — Verification on outside bookings | Web + Expo |
| GM25-C04 — What can Explorers (new to pharmacy) do with shifts? | Web + Expo (asked in GM-02: ON-Q05) |
| GM25-C05 — Payment readiness across clients | Web + Expo |
| GM25-C06 — What must a pharmacy pass before posting to outside workers? | Web + Expo (asked in GM-02: ON-Q11) |
| GM25-C07 — Should pharmacies save a payment method during onboarding? | Web + Expo (asked in GM-02: ON-Q13) |
| GM25-C08 — Fix before launch? Mobile "add personal profile" drops pharmacist data. | Web + Expo (also covers GM26-Q47) |
| GM25-C09 — Fix before launch? Reachable mobile onboarding screens 404 for non-pharmacists. | Web + Expo |
| GM25-C10 — Fix before launch? Profile progress % doesn't match Verified. | Web + Expo |
| GM25-C11 — Fix before launch? The auto-publish toggle for new shifts has no effect. | Web + Expo |
| GM25-C12 — Fix before launch? Anonymous talent posts expose full names. | Web + Expo (asked in GM-18: GM-18-Q13) |
| GM25-C13 — Fix before launch? The talent board downloads every post and filters in the app. | Web + Expo (asked in GM-18: GM-18-Q16) |
| GM25-C14 — Fix before launch? Web and mobile disagree on Talent Board booking permissions. | Web + Expo (asked in GM-18: GM-18-Q15) |
| GM25-C15 — Fix before launch? Talent post availability is copied once and never syncs. | Web + Expo (asked in GM-19: GM-19-Q12) |
| GM25-C16 — Is "Request booking" a firm offer or an enquiry? | Web + Expo (asked in GM-18: GM-18-Q07) |
| GM25-C17 — What should the heart on a talent card do? | Web + Expo (asked in GM-18: GM-18-Q08) |
| GM25-C18 — Should reservations show a live payment countdown? | Web + Expo (asked in GM-12: GM-12-Q24) |
| GM25-C19 — Which shifts get pre-shift reminders, and when? | Web + Expo (asked in GM-22: GM22-05) |
| GM25-C20 — Escalation: who is told, and how late may a scheduled escalation fire? | Web + Expo (asked in GM-11: GM-11-Q03) |
| GM25-Q01 — What is the launch cut across Vite web, Next web, and Expo? | Web + Expo |
| GM25-Q02 — Vite vs Next: which routes live where, and is the migration finished? | Web only |
| GM25-Q03 — Duplicated public boards: one implementation or tolerated twin? | Web + Expo |
| GM25-Q04 — Shared-core scope: which flows must go through shared-core? | Web + Expo |
| GM25-Q05 — Dead, half-built, and "coming soon" screens: delete, hide, or finish? | Web + Expo |
| GM25-Q06 — Navigation and routing parity: one nav model, or one per client? | Web + Expo |
| GM25-Q07 — Auth and session parity: same rules on all three surfaces? | Web + Expo |
| GM25-Q08 — Logged-out public surfaces: what must a visitor be able to see? | Web + Expo |
| GM25-Q09 — Offline and poor-network behaviour on Expo: what is the standard? | Expo only |
| GM25-Q10 — How does Expo take payment? | Expo only |
| GM25-Q11 — Notification parity: email vs push — same events, same controls? | Web + Expo |
| GM25-Q12 — Kiosk: web-only, or does Expo do kiosk too? | Web + Expo |
| GM25-Q13 — Accessibility and text scaling: is 1.6× text a launch gate? | Web + Expo |
| GM25-Q14 — Error, retry, and crash UX: one standard across clients? | Web + Expo |
| GM25-Q15 — "Coming soon" policy: what may ship labelled coming-soon? | Web + Expo |
| GM25-Q16 — Web ↔ app install handoff: where does web send phone users? | Web + Expo |
| GM25-Q17 — Launch sign-off evidence: what proves each surface ready? | Web + Expo |
| GM25-Q18 — Twin-drift prevention after launch: who owns parity? | Web + Expo |
| GM-25-OD-18 — Owner and organisation "public" and "community" shift boards: web pages with no menu links | Web only |
| GM-25-OD-19 — iPhones older than iOS 16.4 cannot install the app | Expo only |
| GM-25-OD-20 — App landing: no auto-rotating carousel; picking a persona preselects the role | Expo only |
| GM-25-OD-21 — Tab rows and stronger grey text | Web + Expo |
| GM-25-OD-22 — Error wording | Web + Expo |

## 0. Verification status — read this first

**HEAD VERIFIED (my own call, this re-run).** PR #249 head is still
`97c4543e051b43fe30ec7e2e61ad3d69957a918e` — identical to the Issue #250
snapshot and to both earlier traces. PR #249 is still open, draft, stacked on
#248 (`feat/mobile-merge-sdk`), 458 commits, 314 changed files. PR #184 head
`c786a4b8182ebf9b505d47cd81980eb3b9851ce3` (Oct 2026).

**Head-resolution note (recorded, per task).** The PR #249 body text names a
"working head `26cae2d6`" — that is the short SHA of the last listed
implementation commit, not the branch head. All tracing in this file is at
the API head `97c4543e…`. The PR #249 body also says its base is
`feat/mobile-merge-sdk`; the API now reports the base SHA as
`c98cf2ef74c6de356cceb8dee3a61dad47b6b843`, which matches the mobile ledger's
"original head `c98cf2ef`" for PR #248. The earlier GM-26 trace recorded a
PR #248 head of `25939534a1c5…`; the two numbers refer to different reads
(PR #248's own head at that time vs PR #249's base SHA) and the difference
was not adjudicated here — it does not affect any GM-25 verdict, because
every file below was read at the pinned head `97c4543e…`.

**Rate limit — NO real 429 in this re-run.** ~80 GitHub calls were made
sequentially (one at a time, 9–12 s apart) with zero real HTTP 429
responses. One false stop occurred: the phase-1 fetch script halted on the
bare substring `429` inside a blob SHA (`0429a0e8…`, the SHA of
`frontend_web/landing_next/app/sitemap.ts`) in an otherwise successful
directory listing (`ok: true`). That call had NOT returned HTTP 429. The
detector was corrected to match only `HTTP 429` / `too many requests` and
fetching resumed; no further stop occurred. The false stop is recorded here
so a future re-run does not mistake it for a rate-limit event.

**What was re-validated in this re-run (file contents read at
`refs/pull/249/head`, by me):**
- PR #249 file list, all 4 pages — **314-file composition now CONFIRMED from
  my own fetch** (was secondary-source only in the blocked trace):
  `frontend_mobile/` 222, `shared-core/` 22, `frontend_web/` 17
  (9 `src/` + 7 `landing_next/` + 1 `e2e/frontend-chat.spec.mjs`),
  `backend/` 37, `docs/` 12, `scripts/` 3, `.github/` 1. Statuses: 160
  modified + 154 added = 314. The active candidate is overwhelmingly an
  Expo + shared-core wave; Vite/Next were barely touched.
- `docs/qa/launch-grill/AUDIT.md` at `refs/pull/184/head`, in full (201
  lines) — the Oct 2026 audit text quoted in §4 is now verified as the
  actual #184 document, not a paraphrase.
- Issue #250 body, PR #184 metadata + file list (8 grill docs).
- `UNIFIED-WEB-EXPERIENCE-PLAN.md`, `PUBLIC-CONTENT-IMPLEMENTATION.md`,
  `frontend_web/landing_next/FEATURE-MAPPING.md`,
  `frontend_web/landing_next/PUBLIC-MIGRATION-PLAN.md`,
  `docs/mobile/ONLINE_SENIOR_PRODUCTION_WAVES_2026-11-04.md` (mobile ledger,
  incl. the 4 Nov 2026 W3 closeout checkpoint),
  `docs/architecture/VITE_NEXT_TWIN_DRIFT.md`,
  `docs/mobile/PARITY_MATRIX.md` (3 Nov 2026 static review, baseline
  `feat/mobile-web-mirror` `c2f1615d`), and the W3 Web→Expo functional
  parity review (`docs/mobile/W3_WEB_TO_EXPO_FUNCTIONAL_PARITY_REVIEW_2026-11-04.md`).
- The six 429'd searches, re-run repo-scoped: `PublicJobBoardPage`,
  `"coming soon"`, `HubPlaceholder`, `ChooseAccountTypeCard`,
  `OrganizationCreate`, `useTalentFeed` — plus `auto_publish`,
  `platform_admin` (0 hits), `Stripe` in `frontend_mobile`,
  `preferred_hourly_rate` / `minimum_rate` / `overtime_multiplier` /
  `bank_account_name` / `hourly_rate` (repo-wide).
- File contents at head: Vite + Next-migrated + Next app-router public job
  board pages (diffed); `frontend_web/src/main.tsx` (routing);
  `HubPlaceholder.tsx`, `roles/owner/hub.tsx`, `ChooseAccountTypeCard.tsx`
  (mobile), `OrganizationCreate.tsx`, both `useTalentFeed.ts` copies
  (diffed), `backend/organizations/models.py` (auto-publish field),
  `backend/shifts/worker_requests.py` (approve path),
  `frontend_mobile/roles/shared/pharmacies/PharmacyForm.tsx` (77 KB),
  `frontend_mobile/roles/pharmacist/onboarding.tsx`,
  `frontend_mobile/roles/owner/shifts/create.tsx`,
  `frontend_web/landing_next/lib/public-route-contract.test.mjs`,
  `frontend_mobile/roles/shared/shifts/ActiveShiftsPage/index.tsx`
  (Expo payment path), `frontend_mobile/roles/owner/subscription-seats.tsx`,
  directory listings for `frontend_web/landing_next/app`,
  `frontend_mobile/app`, `frontend_mobile/roles`,
  `frontend_mobile/app/owner/onboarding`, `frontend_mobile/app/otherstaff`,
  `frontend_mobile/app/pharmacist`, `docs/mobile`.
- **Adopted verdicts (not re-traced):** GM-18 senior-reviewed (PASS) verdicts
  for C12 (identity leak — STILL VALID), C13 (full download — STILL VALID),
  C14 (booking-permission drift — persists in a new shape), C15
  (availability copy — STILL VALID), C16 (firm offer — KEEP); GM-01
  senior-reviewed verdicts for C02 (ON-Q02 — CHANGED, code already implements
  option B) and the auth-screen parity slice of C01.

**What is still NOT re-validated:** C05 (payment-readiness timing, ON-11),
C06 (pharmacy posting gate, ON-06), C07 (saved payment method, ON-08),
C10 (progress % vs Verified, ON-10), C17 (heart/favourites, TB-05),
C18 (payment countdown, BK-Q13), C19/C20 (reminders/escalation mechanics —
owned by GM-22/GM-23; GM-25 owns only the parity angle, per task). Their
Oct 2026 text is carried in §4 marked NOT RE-VALIDATED and must not be
quoted as current behaviour. No device, emulator, browser, or live-backend
check was performed (none is available to this trace).

## 1. GM-25 traced flow — the three surfaces today

### 1.1 What the three clients are

| Surface | Where it lives (verified at #249 head) | Stack |
|---|---|---|
| **Vite web** (the app) | `frontend_web/` — `vite.config.ts`, `src/App.tsx`, `src/navigation.tsx`, `src/pages/`, `src/api/`, `src/features/`, `src/hooks/`, `src/kiosk/`, `kiosk.html`, `src-tauri/` | Vite SPA + Tauri desktop shell |
| **Next web** (public/landing) | `frontend_web/landing_next/` — `app/`, `components/`, `features/`, `lib/`, `migrated/`, `shared/`, `shared-ui/`, `next.config.ts`, `package.json` | Next.js. Docs in place: `AGENTS.md`, `FEATURE-MAPPING.md`, `PUBLIC-MIGRATION-PLAN.md`, `HUB-IMPLEMENTATION.md`, `CALCULATOR-INTEGRATION.md` |
| **Expo mobile** | `frontend_mobile/` — `app/` (Expo Router), `roles/`, `features/`, `components/`, `context/`, `utils/`, `hooks/`, `config/`, `eas.json`, `app.json` | Expo SDK 58 (per PR #249 title) |
| **Shared core** | `shared-core/` — `src/`, `tests/`, `test-support/`, `TYPE_MAPPING.md`, `skills_registry.json` | Shared TS domains consumed by web + mobile |
| **Presentation site** | `presentation_web/index.html` (single file) | Static page — separate from the app; parity unknown |

There is **no top-level Next directory**; Next lives inside `frontend_web/landing_next`.

### 1.2 What PR #249 (the active Expo candidate) actually changed

PR #249 body, verified by me: eight reviewable commits on head `26cae2d6`
(working head; PR head `97c4543e`):

- `3149fbc2` PersonaShell native route/title auditing, canonical brand
  contract, launch light style, fail-fast Expo wave gate.
- `96cd52bf` Shared-core all-page active/confirmed shift operations; remove
  direct mobile domain transport calls.
- `d15304b0` Fail-closed selected-pharmacy shift and payroll filters; terms
  dismissal and stale-reload regression.
- `a7ad728e` W3 Shift Centre candidate/counter-offer failures and Retry,
  scope-bound cache invalidation.
- `d36927af` Branded root crash recovery UI; shared-core pagination
  regression tests.
- `db5b4e51` Auth VM test harness loads the real `API_ENDPOINTS` contract
  (no production auth logic change).
- `79d294d` Anonymous public shift load-more error/retry, preserving
  existing results.
- `26cae2d6` Ledger: `docs/mobile/ONLINE_SENIOR_PRODUCTION_WAVES_2026-11-04.md`.

Verified claims from that body: "Frontend Static and Mobile Lint and Public
Repository Security passed on multiple intermediary exact heads"; shared-core
suite on `a7ad728e` was **445 passed / 1 failed** in a test harness (missing
mocked `API_ENDPOINTS`), addressed by `db5b4e51`, **reverification on latest
head required**; "all latest CI conclusions must be checked". Next work in
strict order: close exact-head CI errors; finish W3b (Post Shift
prefills/retry, templates, draft/publish), W3d, W3e, W3f with positive
role/permission controls, and backend D2 immutable terms acceptance snapshot;
sign off three native reference screens (Post Shift, worker Shift/Offer,
owner/admin Shift Centre) at normal and **1.6× text**; waves W4–W8; then
Senior Package Testing (exact-head Docker/PG/web/mobile acceptance, native
physical devices, staging-only provider proof, security/privacy, EAS binary
and rollback). "No merge/deploy/Stripe/email/OTA or live service changes
authorized or performed."

**The mobile ledger at head adds a 4 Nov 2026 W3 closeout checkpoint that
post-dates the PR body:** exact-handover-head CI (Shared Core Consolidation
run `41793324680`) was **447 Vitest passed / 1 failed** — the failure was a
test-only import typo (`skipMobileOverseas` misspelled `skipMobileOverse` in
`shared-core/src/authApi.test.ts:295`), fixed test-only by `0384a3d5`; W3b
draft-preservation fixes `b43355b4`–`55b4f5be`; **exact-head CI must still
pass before W3b is closed**. D2 terms: `backend/shifts/engagement.py:739`
checks consent booleans but does not validate a reviewed snapshot
identifier; `backend/shifts/offers.py:386` rebuilds terms on acceptance,
while shared-core sends consent booleans only — D2 remains OPEN. Status:
W3 remains OPEN, D2 remains OPEN, W4–W8 and physical device acceptance
remain OPEN; PR stays draft, must not be merged/deployed on these commits
alone.

**Structural signal from the 314-file list (confirmed by my own fetch):
222 files under `frontend_mobile/`, 22 under `shared-core/`, only 9 under
`frontend_web/src/`, 7 under `frontend_web/landing_next/`, 37 under
`backend/`.** The active candidate is overwhelmingly an Expo + shared-core
wave; Vite/Next were barely touched. Any parity claim that "web and mobile
moved together" is false for this stack — mobile moved, web mostly did not.

### 1.3 The Vite/Next split as documented (read at head)

- `UNIFIED-WEB-EXPERIENCE-PLAN.md` (updated 14 Sep 2026, "an implementation
  plan, not a claim that every flow below is already complete"): one account,
  one login, one public origin per environment; canonical route map — **Next
  owns** home/pricing/contact/public info, `/login`, `/register`,
  recovery/verification, `/blog/*`, `/news/*`, `/calculator`, `/hubs*`,
  `/content*`; **Vite owns** `/dashboard` (resolves to the role
  destination) and private professional workflows/onboarding. Known
  incompleteness recorded in the plan itself: `/login` and
  `/community/sign-in` still present distinct login flows; Vite and migrated
  Next pages have duplicated AuthContext/token helpers; return paths and
  error handling differ; no reliable shared return-path contract yet;
  logout revocation and other-tab updates need completing.
- `PUBLIC-CONTENT-IMPLEMENTATION.md` (14 Sep 2026): public site/blog/news/
  calculator, shared cookie auth, anonymous public hubs, moderation/audit
  API are "saved"; **outstanding rollout gates: restore deployed migration
  source files, rehearse clean/staging migrations, verify end-to-end
  authentication/payment/mobile regressions and actual email delivery**,
  then enable production routing and public reads. Stage 2 unrestricted
  administration and authenticator setup remain deferred as approved.
- `PUBLIC-MIGRATION-PLAN.md`: the migration was **blocked on source
  access** — the requested repository
  (`chemisttasker-smsm/chemisttasker-ezy`) returned 404 via the connected
  GitHub API and a local clone also failed; "no implementation has been
  substituted from the older repository". Its route inventory (from local
  `frontend_web/src/main.tsx`) lists the Vite public routes, including
  `/shifts/public-board` → `PublicJobBoardPage` and
  `/talent/public-board` → `PublicTalentBoardPage`. Status recorded there:
  "route inventory prepared; implementation awaiting access to the requested
  latest source." The migrated copies nevertheless exist in the tree (see
  §1.4), so work proceeded from local source after that note — the plan doc
  and the tree disagree about how far the migration got, and the owner
  should treat the plan doc as stale on that point.
- `FEATURE-MAPPING.md`: the Next feature catalogue is **explicitly
  reference-derived, not an assertion that every service was
  backend-verified**; "AHPRA automation, award calculations,
  security/compliance guarantees, reward pricing and enterprise real-time
  analytics require product validation"; Learning Hub retains its
  "upcoming" status; promotional claims ('first 999 / six months free',
  fill guarantees, testimonials) are intentionally not advertised without
  confirmation.
- `docs/architecture/VITE_NEXT_TWIN_DRIFT.md` (baseline PR #191
  `ffb72937b5`, blob-SHA comparison of identical relative paths under
  `frontend_web/src` vs `frontend_web/landing_next/migrated`): **64 matched
  paths; 21 byte-identical; 43 divergent.** Differences are "not assumed
  defects" (Next SSR, API proxy, auth bootstrap and public navigation differ
  intentionally in several paths) — each divergent path needs route and
  behaviour evidence before extraction. Divergent paths include
  `pages/PublicJobBoardPage.tsx`, `pages/PublicTalentBoardPage.tsx`,
  `pages/PrivacyPolicyPage.tsx`, `pages/AccountDeletionPage.tsx`,
  `contexts/AuthContext.tsx`, `config/api.ts`, `utils/tokenService.ts`,
  `pages/login.tsx`, `pages/register.tsx`. Identical (shareable) paths
  include `pages/dashboard/sidebar/TalentBoard/hooks/loadAllTalentPages.ts`
  and `utils/ownerSetup.ts`. Acceptance protocol: classify each twin as
  intentionally platform-specific, reuse via shared UI, or removable dead
  twin; prefer shared-core for DTOs/policy/named domain operations; assert
  routes, auth and error behaviour in Vite and Next before any removal.
- `docs/mobile/PARITY_MATRIX.md` (3 Nov 2026, baseline
  `feat/mobile-web-mirror` `c2f1615d`; static source review, no builds/tests/
  devices): a persona-by-persona route/nav matrix (Owner, Organization,
  Admin, Pharmacist, Other Staff, Explorer, shared web routes,
  shared/mobile-only areas) with **17 numbered logic drifts L1–L17** and a
  missing-destinations list. Headline drifts: L1 dashboard fallback
  branches differ; L2 organisation pharmacy claims absent on mobile; L3
  published-roster acknowledgement missing on mobile; L4 manager roster
  action gaps; L5 timesheet detail review absent on mobile; L6 attendance
  correction loses event context/pharmacy timezone; L7/L8 invoice detail
  and finance-workspace guards differ; L9 chat cannot load older pages on
  mobile; L10 org/admin navigation does not mirror capability rules; L11
  workforce settings split without equivalent integration; L12 interest
  request grouping differs (web one-per-slot vs mobile one batch request);
  L13 dashboard activity URL conversion misses renamed native routes; L14
  API transport ownership remains outside shared-core (direct Axios in
  `nativeIdentityTransport.ts`); L15 admin Attendance Approvals web nav
  target is unrouted (a **web** defect); L16 pharmacist/other-staff learning
  is a "Coming Soon" placeholder on mobile; L17 Explorer shifts is a
  placeholder ("Shifts") despite a routed detail screen. Missing on mobile:
  chain management, owner/org/Explorer learning, owner/org public/community
  board routes. **Caveat:** the matrix baseline predates the #249 head; its
  rows are repo evidence at head (the file is in the tree at head) but were
  not individually re-verified line-by-line in this trace, except where §4
  says so (L16/L17 placeholders confirmed by search at head; L14 partly
  addressed by PR #249 `96cd52bf` for active/confirmed shifts only).

### 1.4 Screen/flow inventory — what exists where (verified at head)

**Vite web (`frontend_web/src/`, top level verified):** `App.tsx`,
`navigation.tsx`, `main.tsx`, `pages/`, `features/`, `components/`,
`api/`, `contexts/`, `hooks/`, `utils/`, `kiosk/`, `layouts/`,
`config/`, `constants/`, `types/`, `theme/`, `styles/`, `assets/`.
`frontend_web/shared/` holds the shared Post Shift wizard
(`shared/postShift/`) plus `PharmacyContext.tsx`,
`PharmacyProfileFields.tsx`, `VerificationBadges.tsx`,
`SignupRolePicker.tsx`, `ShiftRequirements*.tsx`, `WorkerSkills.tsx`.
`main.tsx` routes the public boards at `shifts/public-board` →
`PublicJobBoardPage` and `talent/public-board` →
`PublicTalentBoardPage`; `OrganizationCreate` is **not imported or routed
anywhere in `main.tsx`** (verified by grep — ON-05 still valid).

**Next (`landing_next/`, top level verified):** `app/`, `components/`,
`features/`, `lib/`, `migrated/`, `shared/`, `shared-ui/`, `public/`.
`app/` contains route groups `(ethical)`, `(hub)`, `(public)` plus `api/`,
`calculator/`, `content/`, `dashboard/`, `hubs/`. PR #249 touched
`app/layout.tsx`, `app/globals.css`,
`components/app-install-banner.tsx`, `shared/mobile-store-links.ts` (+ test)
and `next.config.ts` — install-handoff / public-route surface, not app
features. The public-route contract test
(`lib/public-route-contract.test.mjs`, read at head) asserts the route
contract (`/shifts/public-board`, `/talent/public-board`, `/hubs`,
`/news`, `/pricing`, …), single signed-token referee routes in both web
clients, and marketplace-gate behaviour.

**Expo (`frontend_mobile/app/`, 45+ entries verified):**
`_layout.tsx`, `+not-found.tsx`, `index.tsx`, `welcome.tsx`, `login.tsx`,
`register.tsx`, `forgot-password.tsx`, `reset-password.tsx`,
`verify-otp.tsx`, `mobile-verify.tsx`, `notifications.tsx`,
`my-roster.tsx`, `my-leave.tsx`, `my-hours.tsx`, `next-shifts.tsx`,
`invoices.tsx`, `contact.tsx`, `app-preferences.tsx`,
`attendance-pin.tsx`, `kiosk-link.tsx`, `admin-invitations.tsx`,
`workforce-settings.tsx`, `workforce-timesheets.tsx`, and directories:
`admin/`, `attendance/`, `explore/`, `explorer/`, `finance/`,
`manager/`, `marketplace/`, `membership/`, `organization/`,
`otherstaff/`, `owner/`, `pharmacist/`, `profile/`, `rewards/`,
`settings/`, `setup/`, `share/`, `shared/`, `shifts/`,
`workforce/`, `workforce-timesheets/`, `my-hours/`.
`roles/` (verified): `admin/`, `explorer/`, `organization/`,
`otherstaff/`, `owner/`, `pharmacist/`, `shared/` — role-shelled screens.
`app/pharmacist/` contains `onboarding.tsx` (the route the
ChooseAccountTypeCard pharmacist path resolves to) plus
`profile-basic-info.tsx`, `profile-payment.tsx`, `profile-rate.tsx`,
`profile-referees.tsx`, `profile-skills.tsx`, `publish-availability.tsx`,
`talent-board.tsx` and more. `app/otherstaff/` contains
`profile-basic-info.tsx`, `profile-bio.tsx`, `profile-identity.tsx`,
`profile-payment.tsx`, `profile-referees.tsx`, `profile-regulatory.tsx`,
`profile-skills.tsx`, `publish-availability.tsx`, `talent-board.tsx` —
but **no `onboarding.tsx`** (see GM25-C08).

### 1.5 Current-flow matrix

Backend authority for every row is the Django backend (Issue #250 scope:
"Django backend + shared-core + Vite web + Next web + Expo mobile").
Status key: **V** = verified at #249 head in this re-run (file content read)
· **A18** = adopted senior-reviewed GM-18 verdict · **A01** = adopted
GM-01 verdict · **M** = repo evidence at head via `PARITY_MATRIX.md` /
`VITE_NEXT_TWIN_DRIFT.md` (static review, not re-opened line-by-line here)
· **O** = Oct 2026 #184 evidence, NOT re-validated · **?** = not inspected.

| # | Flow (trigger → actor) | Backend / API (authority) | Vite web | Next web | Expo | Persisted state / side effect | Recovery / denial path |
|---|---|---|---|---|---|---|---|
| F1 | Sign up / log in / OTP — worker, owner, explorer | Django auth; email-code login (A01) | `src/pages/register.tsx`; `src/navigation.tsx` | Migrated copies exist; twin drift lists `pages/login.tsx`, `pages/register.tsx`, `pages/OTPVerify.tsx` as divergent (M) | `app/register.tsx`, `app/login.tsx`, `app/verify-otp.tsx`, `app/mobile-verify.tsx`, `app/forgot-password.tsx`, `app/reset-password.tsx`; PersonaShell route/title audit (#249 `3149fbc2`) | Session/token; Verified flags | Stale-session, wrong-OTP, locked-account behaviour — see GM-01 |
| F2 | Worker onboarding / verification (AHPRA, ID, referees, ABN/TFN) | `backend/onboarding/verification/policy.py`, `ahpra.py`, `verification/documents.py` (O) | `frontend_web/src/pages/onboarding/*` (O) | ? — onboarding on Next unknown | **V:** `app/pharmacist/onboarding.tsx` route exists; `roles/pharmacist/onboarding.tsx` still posts 7 fields the backend drops (rate fields confirmed repo-wide, see C08); `app/otherstaff/` has profile-* screens, no `onboarding.tsx`; `roles/{pharmacist,otherstaff}/profile-tabs/` exist (PR249 list) | Onboarding records; `ahpra_expiry_date`; Verified flag | ON-04 pharmacist data loss persists (V); other-staff dead-end fixed by reroute (V) |
| F3 | Owner setup / pharmacy setup | Owner setup gate, skippable, both platforms (O) | `src/utils/ownerSetup.ts` (O; twin-drift identical list) | ? | `frontend_mobile/utils/ownerSetup.ts` (O); `app/setup/owner/onboarding` live flow (O) | Pharmacy record; `Pharmacy.verified`, `abn_verified` | Pharmacy verification does NOT gate posting (O, C06) |
| F4 | Post a shift (owner/manager) | `backend/shifts/posting.py` (O); posting wizard shared | `frontend_web/shared/postShift/*` (O) | ? — posting is app surface | `roles/shared/shifts/PostShiftScreen.tsx` + Details/Visibility steps (PR249 list); W3b prefills/retry/templates/draft-publish **unfinished** per PR #249 body + ledger | Shift + slots; visibility tier; escalation schedule | Draft save/retry/template recovery — W3b open (V, ledger) |
| F5 | Browse public shifts, logged out | `GET /public-job-board/` public; `GET /public-shifts/` required login in Oct–Nov 2026 code review — NOT re-validated; both collapsed to "Failed to load public shifts" (Nov 2026 site checks) | **V:** `src/pages/PublicJobBoardPage.tsx` (431 lines, shared-core `getPublicJobBoard`, error text 'Failed to load public shifts') | **V:** THREE implementations — Vite page; migrated copy (468 lines, **diverged**: race guard `latestResultsRequest`, different SEO title/description/canonical/image, different layout, no `?organization=` canonical); app-router page is a thin wrapper (`<PublicEntry page="PublicJobBoardPage"/>`) | `roles/shared/shifts/PublicShiftsView.tsx`, `AnonymousShiftBoardScreen.tsx` (PR249 list); anonymous load-more error/retry fixed in #249 `79d294d`, preserving results | None (anonymous) | Load-more error shows retry, keeps results (Expo, #249). Web/Next recovery: Vite copy lacks the race guard the Next copy has (V) |
| F6 | Apply / interest → offer / counter-offer → accept → reservation → Stripe payment | `shifts/interest.py`, `offers.py`, `counter_offers.py`, `reservations.py`, `billing/views.py` (Stripe Checkout, idempotent webhook) (O); D01–D03 carried decisions | Shift boards + offer screens (O) | ? — booking is app surface | **V:** `roles/shared/shifts/ActiveShiftsPage/index.tsx` — `handlePayWithStripe` calls shared-core checkout then **`Linking.openURL(res.url)`** (system browser); 409 recovery via `resumeFulfillmentCheckout` / `expireFulfillmentCheckout`; `subscription-seats.tsx` same pattern for subscriptions (`createSubscriptionCheckout` → `Linking.openURL`, `checkout=success/cancel` params). No native payment sheet, no WebView. Return-to-app deep link not verified. | Interest, offer, reservation (time-limited per D02), payment, frozen engagement terms | Reservation expiry (60s scheduler, O); payment failure handling — Expo recovery dialogs traced in code (V) |
| F7 | Talent board browse / Request booking | `backend/talent/views/explorer.py`, serializers leak names to authenticated callers (A18 — STILL VALID) | `pages/dashboard/sidebar/TalentBoard/*`, `PublicTalentBoardPage.tsx` (O) | Migrated copy exists; twin drift lists TalentBoard pages as divergent (M) | `roles/shared/talent-board/index.tsx`; `app/explore/talent-board.tsx` + `app/explorer/talent-board.tsx` (PR249 list — two routes, duplication unconfirmed); **V:** `useTalentFeed.ts` exists TWICE on mobile (`talent-board/` and `talent-board/hooks/`) and the two copies have **diverged** (top-level maps `verification: normalizeVerification(...)`, hooks copy omits it); web + Next-migrated copies also exist (4 copies total) | ExplorerPost, likes, view counts | TB-07 web/mobile permission disagreement persists in new shape (A18) |
| F8 | Availability set / matching | `talent/models.py:150` UserAvailability; match emails at posting to PLATFORM only (O) | `SetAvailabilityPage.tsx` (O) | ? | `roles/shared/availability/SetAvailabilityScreen.tsx` + `availabilityModel.ts` (PR249 list) | Availability rows; copied snapshot into talent posts (A18 — STILL VALID) | No validation (A18); no expiry (O) |
| F9 | Roster / cover / swap / leave (internal) | `shifts/worker_requests.py`, `workforce/roster/*` (O) | `RosterWorkerPage` (O) | ? | `app/my-roster.tsx`, `app/my-leave.tsx`, `app/manager/roster/operations.tsx`, `features/parity/roster.tsx` + `rosterLegacy.tsx` (PR249 list — "Legacy" twin is a drift smell) | Roster assignments; cover requests | **V:** auto-publish — see C11: backend `approve()` always publishes, never reads the flag; web toggle exists, mobile toggle absent |
| F10 | Attendance / kiosk clock-in/out | Kiosk PIN/QR flows (Issue #250 scope freeze: existing QR scanning unchanged unless separately approved) | `src/kiosk/`, `kiosk.html`, `src-tauri/` (Vite + desktop shell, verified dirs) | ? — kiosk is not a Next surface, presumed | `app/attendance/`, `app/attendance-pin.tsx`, `app/kiosk-link.tsx` (dirs verified); `features/parity/attendance.tsx` (PR249 list) | Clock events; sessions | Double-clock, stale terms, session-mismatch 409 handling — PR #249 body references terms-dismissal/stale-reload regressions; behaviour not inspected here |
| F11 | Timesheet / payroll / invoices / finance | `workforce/timesheet_transitions.py`, billing/invoicing (O) | Finance pages (O) | ? | `app/my-hours.tsx`, `app/workforce-timesheets.tsx`, `roles/shared/timesheets/*`, `roles/shared/invoices/FinanceWorkspace.tsx`, `InvoiceList.tsx`, `InvoiceDetail.tsx` (PR249 list); fail-closed payroll filters (#249 `d15304b0`) | Timesheets; invoices; payroll records | **M:** L5 timesheet detail review absent on mobile; L7/L8 invoice detail/finance guards differ (PARITY_MATRIX) |
| F12 | Chat / Hubs / Explore public content | Chat + Hubs (GM-20; not traced here) | Hub pages (O) | `HUB-IMPLEMENTATION.md` in landing_next (existence verified; contents not read) | **V:** `roles/shared/hub/HubPlaceholder.tsx` still renders "Hub will live here. Coming soon."; `roles/owner/hub.tsx` still renders "Hub coming soon … This is a placeholder."; `app/explore/hubs/` exists (PR249 list) | Messages; hub posts; articles | Hub placeholder vs implemented hub: **divergence confirmed at head** — placeholder screens still ship (V) |
| F13 | Notifications / reminders | Hourly reminder job, email ~12h before slot (O); no push (O) | Email | ? | `app/notifications.tsx`, `features/notifications/NotificationsScreen.tsx`, `utils/notificationNavigation.ts`, notification-routing tests (PR249 list) — push preferences test exists | Notification inbox; push prefs | Expo push vs web email parity **unknown** (GM25-Q11); B64: notifications persist kiosk codes/PIN OTPs (see GM-26 Q44) |
| F14 | Settings / account / app lock | ? | Settings pages | ? | `app/settings/`, `app/app-preferences.tsx`, `app/workforce-settings.tsx`, `utils/appLock.ts`, `utils/biometricAuth.ts`, `components/security/AppLockGate.tsx` (PR249 list) | App-lock settings | Web has no biometric/app-lock equivalent (A01: biometric flag stored in AsyncStorage, not SecureStore — GM-01 code gap) |
| F15 | Marketplace / ethical marketplace / Explorer public | `marketplace/policy.py` (O) | Marketplace pages | `PUBLIC-MIGRATION-PLAN.md` | `app/marketplace/`, `features/parity/marketplace.tsx`, `ethicalMarketplace.tsx`, `MarketplaceAccessResolution.tsx` (PR249 list) | Listings; saved contacts | ? |

**Cross-cutting, verified:** shared-core is the intended single source for
domain API calls (PR #249 `96cd52bf` removed direct mobile domain transport
calls for active/confirmed shifts). Vite web **does** use shared-core for
the public board (`getPublicJobBoard`, `expressInterestInPublicShiftService`
— V). But PARITY_MATRIX L14 (in repo at head) records direct Axios requests
remaining in `nativeIdentityTransport.ts` (login/register/OTP) plus
refresh/CSRF/WebSocket-ticket/app-config adapters — so shared-core adoption
is partial, not complete. Branded root crash recovery UI exists on Expo
(#249 `d36927af`); web equivalent unknown.

## 2. The single first decision question

### GM25-Q01 — What is the launch cut across Vite web, Next web, and Expo?

**Plain English:** today there are three things that could "launch": the Vite
web app, the Next public/landing site, and the Expo phone app. The Expo work
is a 314-file draft PR that its own author says is NOT merge-ready, has never
been built on a real phone, and has never been tested against the real
backend while logged in. The web app was barely touched by that PR. Before
any other GM-25 question can be answered sensibly — which screens to fix,
which placeholders to delete, what "parity" even means — the owner must say
which surfaces are in the launch and which wait.

**Actual today (verified at #249 head):** All three surfaces exist in the
repo. PR #249 (Expo production readiness) is open/draft, base #248 unmerged,
"NOT MERGE-READY · NOT DEPLOYED". No native emulator/device screenshots, no
real iOS/Android SDK 58 builds, no authenticated real-backend acceptance, no
store readiness (PR #249 body). Shared-core suite needs reverification on
the latest head (ledger 4 Nov 2026: 447 passed / 1 failed on the handover
head, the failure a test-only import typo since fixed test-only by
`0384a3d5`; exact-head CI must still pass before W3b closes). Next migration
is a documented plan with partial implementation: the canonical route map
exists on paper (UNIFIED-WEB-EXPERIENCE-PLAN.md, 14 Sep 2026), the
migration plan itself says implementation awaited source access that 404'd,
and the tree now holds Vite pages, divergent Next migrated copies (43 of 64
matched paths divergent), and thin Next app-router wrappers over the
migrated copies. W3b/W3d/e/f unfinished; D2 terms snapshot open; Senior
Package Testing not done.

**RECOMMENDED: B — Vite web + Next public first; Expo follows after Senior
Package Testing.** Rationale: the web app is the surface with the longest
history and the one the #184 grill was written against; the Expo candidate
is explicitly unverified on real devices and real backend; launching it
unverified risks first-impression failure with the locums and pharmacies the
launch depends on, plus App Store review exposure. Severity: **launch-gate**.
Benefits: launch is not blocked by native verification; Expo gets a real
device + staging acceptance gate instead of a date. Risks: phone-first
workers get a mobile-web experience first; two launch moments to
communicate; Expo drift grows while it waits. Legal/financial impact: no
direct fee impact; App Store / Play review and a broken first native build
are reputational and support-cost risks, not legal ones. Payment impact:
Expo payment is now traced — it hands off to Stripe Checkout in the system
browser via `Linking.openURL` (see GM25-Q10) — so the Expo payment path is
no longer an unknown, but the return-to-app leg is unverified.

**ALTERNATIVE A — Keep current trajectory: launch all three together.**
Scenario: owner wants one launch moment; marketing points at web and app
stores together. Trade-offs: fastest to "everywhere", but ships the Expo
candidate before any device build or authenticated backend test exists;
any native-only bug (login, push, payments, offline) is discovered by real
users. Needs Senior Package Testing finished first — which PR #249 lists as
not done.

**ALTERNATIVE B — (recommended, above).**

**ALTERNATIVE C — Expo + Vite first; Next landing only.**
Scenario: the Next migration is mid-flight, so freeze Next as a thin
landing site and launch the two app surfaces. Trade-offs: avoids shipping a
half-migrated public site; but public SEO/discovery (the main reason Next
exists) stays thin, and the Vite public boards carry the public load.

**ALTERNATIVE D — One surface only at launch (Vite web).**
Scenario: smallest possible launch; Next and Expo are explicitly post-launch.
Trade-offs: simplest to verify and support; but no app-store presence and
no Next SEO benefit at launch; phone users rely on mobile web.

**Other / defer:** owner may defer the Expo call but must then say what
Expo users are told (e.g. "mobile web for now, app coming") — silence is
itself a UX decision.

Normal case: each surface's users complete their core flow. Edge case: a
worker finds the app in a store before it is ready (if listed early).
Retry/concurrency: n/a at this level. Denied role / wrong tenant: n/a.
Web/Expo difference: this question *is* the web/Expo difference.
**Decision status: OPEN — ask first. Blocks: GM25-Q02–Q18, LA-Q02, LA-Q03,
LA-Q11, LA-Q15, and the §6 backlog.**
**Launch-cut cross-reference:** this same launch-cut question is also asked
in GM-26 (GM26-Q36) and GM-21 (Q01). The three wordings must NOT become
three competing recommendations — record the question identically in each
area and flag it for the parent's single-launch-decision consolidation.
GM-25's recommendation (B — Vite + Next first, Expo after Senior Package
Testing) is the parity-area view of the same decision; GM-26's
recommendation (A — no launch until the NO-GO is cleared) is the
admin/privacy/security view. The owner answers once; the areas do not
re-decide it separately.

## 3. Code gaps vs decision gaps

### 3.1 Code gaps (no owner choice needed — just build/fix; owner only picks timing)

Verdict key: **V** = re-validated at #249 head in this re-run ·
**A18/A01** = adopted senior-reviewed GM-18/GM-01 verdict ·
**O** = Oct 2026 #184 evidence, NOT re-validated ·
**M** = repo evidence at head via PARITY_MATRIX / twin-drift doc.

- **CG-1 (ON-04 / LA-Q02): V — STILL VALID for the pharmacist half,
  CHANGED for the other-staff half.** `roles/pharmacist/onboarding.tsx`
  still posts `bsb`, `account_number`, `bank_account_name`,
  `preferred_hourly_rate`, `minimum_rate`, `overtime_multiplier`,
  `weekend_premium` via `updateOnboarding('pharmacist', formData)`.
  Repo-wide searches: `preferred_hourly_rate` 1 hit (this file only),
  `minimum_rate` 1 hit (this file only), `overtime_multiplier` 2 hits
  (this file + `backend/workforce/award_rates.py`, an award table, not a
  worker profile) — the rate fields have no backend home and are silently
  dropped. `bank_account_name` has 34 hits including backend
  invoicing/worker-finance models, so whether the bank fields land anywhere
  via the onboarding update is UNKNOWN (not traced). Other-staff half
  CHANGED: `ChooseAccountTypeCard` now routes other staff to the existing
  `/otherstaff/profile-basic-info` (confirmed: `app/otherstaff/` has
  `profile-basic-info.tsx`, no `onboarding.tsx`); nothing routes to the
  missing `/otherstaff/onboarding` from this card anymore.
- **CG-2 (ON-05 / LA-Q03): V — STILL VALID, item by item.**
  `app/owner/onboarding/` still contains `step1/2/3/review.tsx` (+
  `_layout.tsx`, `_context.tsx`); `roles/owner/shifts/create.tsx` still
  exists and still builds its payload with `hourly_rate` (lines 28/83/96/
  300–301) — the "not a backend field" claim is weakened (`hourly_rate`
  has 42 repo hits including `backend/shifts/models.py` and `posting.py`),
  but whether this hidden screen's payload is accepted and produces a
  correct shift was NOT verified, and it remains a parallel legacy create
  path beside the PostShift wizard; `roles/explorer/shifts.tsx` placeholder
  per PARITY_MATRIX L17 (M); `roles/owner/hub.tsx` and
  `roles/shared/hub/HubPlaceholder.tsx` still render "coming soon" (V);
  web `OrganizationCreate.tsx` is not routed anywhere in `main.tsx` (V).
- **CG-3 (ON-10 / LA-Q04): O — NOT RE-VALIDATED.** `onboarding/services/
  progress.py` not re-read. The % UI itself still exists on the mobile
  onboarding screen (`roles/pharmacist/onboarding.tsx` renders a
  ProgressBar + `{progress}%` chip — V).
- **CG-4 (ON-11 / LA-Q05): O — NOT RE-VALIDATED.** Payment-readiness
  timing not re-read. New partial evidence, not a verdict: Expo
  `ActiveShiftsPage` now maps `awaitingPayment` / `awaitingPaymentOfferId`
  state onto shift cards (V).
- **CG-5 (SH-02 / LA-Q02): A18 — STILL VALID.** Legacy 10%/20% penalty
  route still live (`backend/billing/urls.py:15` routes
  `charge-penalty/<int:shift_id>/`, GM-18 senior-verified at head).
- **CG-6 (SH-03 / LA-Q07): A18 — CHANGED (partial).** Subscriber discount
  is now applied ($30/$15, $80/$40); Stripe price IDs still hard-coded.
  The Oct 2026 "computed but never applied" claim must NOT be carried as
  current.
- **CG-7 (SH-05 / LA-Q08): O — NOT RE-VALIDATED.** Escalation runs only on
  shift-list page views (no scheduled job).
- **CG-8 (SH-07 / LA-Q09): A18 — STILL VALID.** Pending offers outlive
  the shift (flat 48h, `OFFER_EXPIRY_HOURS = 48`,
  `backend/shifts/assignment.py:22`, no cap at shift start).
- **CG-9 (SH-09 / LA-Q10): V — STILL VALID (D2 open).** Mobile ledger at
  head: `backend/shifts/engagement.py:739` checks consent booleans but does
  not validate a reviewed snapshot identifier; `offers.py:386` rebuilds
  terms on acceptance; shared-core sends consent booleans only. D2 remains
  OPEN.
- **CG-10 (SH-11 / LA-Q11): V — STILL VALID, settled by fresh re-trace.**
  The #184 "current" note was right about one thing and the audit was right
  about the rest: (a) `Pharmacy.auto_publish_worker_requests` still exists
  with the same help text — "automatically create and publish a new shift"
  (`backend/organizations/models.py:238`) — which still contradicts
  R06/R04B; (b) the web toggle exists (`PharmacyPage.tsx:1613` loads it,
  `:1950` submits it, `:2117` updates it, `:2508` passes it); (c) mobile
  `PharmacyForm.tsx` carries the field in state (`:99`, `:159`, `:292`)
  but renders **no toggle UI** for it (no `autoPublish` binding, no switch
  label — only an unrelated "Published 6 February 2026" text matched);
  (d) the backend **never reads the flag**: `worker_requests.py`
  `approve()` publishes in both branches (sets `AUTO_PUBLISHED` at
  `:252`/`:285`) with no flag check anywhere in the file. So the setting
  is decorative on web, invisible on mobile, and ignored by the backend.
  Fix = correct the copy, enforce per-pharmacy cover permission (R04A),
  add the mobile toggle or remove the field.
- **CG-11 (TB-01 / LA-Q12): A18 — STILL VALID. Privacy — launch-gate.**
  Authenticated talent feed/list/detail return names and user IDs; only
  public reads mask them; both apps consume the leaking API.
- **CG-12 (TB-03 / LA-Q13): A18 — CHANGED (partial).** Hidden/expired
  reads are now blocked on list/retrieve/feed/like/view (tested); the
  lapsed-credential re-check is still missing.
- **CG-13 (TB-04 / LA-Q14): A18 — STILL VALID.** Talent board downloads
  everything, filters in-app; no server filters or distance filter (only
  the Expo public board paginates).
- **CG-14 (TB-07 / LA-Q15): A18 — CHANGED (persists in a new shape).**
  Web 9-role allow-list (`TalentBoard/index.tsx:313`) vs Expo
  any-non-worker role (`talent-board/index.tsx:313`) with
  `canRequestBookingOverride` fallback; duplicate `useTalentFeed` (see
  CG-18); mobile `publish-availability` points at `/owner/post-shift`;
  `add_view` unthrottled.
- **CG-15 (AV-01 / LA-Q16): A18 — STILL VALID.** Talent-post availability
  copied once, never syncs.
- **CG-16 (AV-04 / LA-Q17): O — NOT RE-VALIDATED.** Match emails miss
  escalated shifts; reach unverified workers.
- **CG-17 (AV-05 / LA-Q18): A18 — STILL VALID.** Availability input has
  no server validation (`backend/talent/serializers/availability.py` is a
  bare `ModelSerializer` with no `validate()`).
- **CG-18 (NEW, verified at head):** Two `useTalentFeed.ts` copies on Expo
  (`talent-board/` and `talent-board/hooks/`) have **diverged** — the
  top-level copy maps `verification: normalizeVerification(...)`, the
  hooks copy omits it; web and Next-migrated copies make four in total.
  Two talent-board routes on Expo (`app/explore/talent-board.tsx` and
  `app/explorer/talent-board.tsx`, PR249 file list) — twin or intentional,
  unconfirmed. `roles/` + `app/` dual trees on Expo (both verified) —
  which is canonical per role is undocumented in this trace.
  `features/parity/rosterLegacy.tsx` (PR249 file list) — a "Legacy" twin
  beside `roster.tsx`. Vite `src/api/` vs shared-core: **partly resolved**
  — Vite public board uses shared-core, but PARITY_MATRIX L14 records
  direct Axios remaining in mobile identity/session adapters.
- **CG-19 (NEW, from PR #249 body + ledger — verified):** Shared-core
  suite needs reverification on latest head (447/1 on the handover head,
  test-only fix since); W3b/W3d/e/f unfinished; D2 terms snapshot open;
  three native reference screens unsigned at normal and 1.6× text; Senior
  Package Testing not done.
- **CG-20 (NEW, from PARITY_MATRIX.md L1–L17 — M):** 17 numbered logic
  drifts (dashboard fallbacks, org claims, roster acknowledgement, roster
  actions, timesheet detail, attendance timezone, invoice dispatch,
  finance guards, chat pagination, nav capability rules, settings split,
  interest grouping, activity URL conversion, transport ownership,
  unrouted web nav target, learning placeholder, Explorer shifts
  placeholder) + missing destinations (chain management, owner/org/
  Explorer learning, owner/org public/community board routes). Baseline
  predates the #249 head; rows not individually re-verified here.

### 3.2 Decision gaps (owner must choose first — no build should start)

- **DG-1 (GM25-Q01):** Launch cut across Vite / Next / Expo.
- **DG-2 (GM25-Q02):** Vite vs Next canonical routes; finish, freeze, or
  roll back the Next migration.
- **DG-3 (GM25-Q03):** Duplicated public boards — one implementation or
  tolerated twins.
- **DG-4 (GM25-Q04):** Shared-core scope — which flows must go through it,
  and what happens to direct client API calls.
- **DG-5 (GM25-Q05):** Dead/placeholder screens — delete, hide, or fix.
- **DG-6 (GM25-Q10):** Expo payment handoff — link-out confirmed as the
  implemented path; owner confirms it (vs native sheet) and the
  return-to-app leg.
- **DG-7 (GM25-Q11):** Notification parity — email vs push, same events?
- **DG-8 (GM25-Q09):** Offline promise on Expo (cached confirmed shifts,
  retry, stale data).
- **DG-9 (GM25-Q13):** 1.6× text / accessibility gate — both clients?
- **DG-10 (GM25-Q17):** What evidence signs off each surface for launch.
- **DG-11 (carried):** ON-Q02 is referenced at GM01-Q04. ON-Q03 is answered at VERIFY-GATE-01. Open topics continue with
  ON-Q05 explorer shift access; ON-Q11 pharmacy posting gate; ON-Q13 saved
  payment method; TB-Q01/Q02 talent visibility/reveal; TB-Q07 firm offer
  vs enquiry; TB-Q08 heart/favourites; AV-Q02/Q03/Q04/Q06 availability
  expiry/matching/visibility; PO-Q08/Q09 escalation notify/stop;
  BK-Q13 countdown; AG-Q11 reminders.

## 4. Question queue (in #184 format)

Status key: **V** = re-validated at #249 head in this re-run ·
**A18/A01** = adopted senior-reviewed GM-18/GM-01 verdict ·
**M** = repo evidence at head via PARITY_MATRIX / twin-drift doc ·
**NOT RE-VALIDATED** = Oct 2026 #184 evidence, file-content re-check not
completed in this re-run — do not quote as current. **TRACED
(STRUCTURE)** = verified at #249 head from directory listings / PR #249
body / docs only; screen behaviour inside those files was not inspected.
**UNKNOWN** = not inspected at all. "Keep current logic" is offered only
where #184 recorded something existing; where nothing exists, the keep
option is marked n/a.

### 4A. Carried #184 questions relevant to GM-25 (parity angle added)

**GM25-C01 — ON-Q15. Must every onboarding step work on mobile at launch?**

> **Merged 22 Nov: asked once, as GM01-Q10 in GM-01.** Answer it there; this copy stays for its own evidence and is not asked again.
**Verdict: CHANGED (partial) — V.** The pharmacist half is still broken
(see C08): the legacy add-profile screen still posts rate fields with no
backend home. The other-staff half is FIXED by reroute: the card now sends
other staff to the existing `/otherstaff/profile-basic-info`, and
`app/otherstaff/` has no `onboarding.tsx` to 404 on. The auth-steps slice
is parity-OK per GM-01 (A01): verify-otp, mobile-verify, forgot-password,
reset-password all exist as public Expo routes. Options: KEEP — mobile
manager add-profile stays broken for pharmacists (not a real option);
A — Full parity on web and mobile, every step works on both; B — Mobile
basics, rest links to web. Other / defer. Recommended: A — managers who
upgrade on mobile lose data or hit a dead end. **Status: CHANGED (partial),
OPEN.**

**GM25-C02 — ON-Q02. Browse access before full verification**

> **Merged 22 Nov: asked once, as GM01-Q04 in GM-01.** Answer it there; this copy stays for its own evidence and is not asked again.

**Status:** Answered: KEEP, launch grill, 23 Oct 2026 - see GM01-Q04 for the single re-confirmation. The dashboard requires email and mobile verification. Anonymous browsing stays open on public boards.

**GM25-C03 — ON-Q03. Verification on outside bookings**

**Status:** Answered: B, check every outside booking, launch grill, 23 Oct 2026 - see VERIFY-GATE-01. Engineering: see BL-01 for the backend guard shared by the three clients.

**GM25-C04 — ON-Q05. What can Explorers (new to pharmacy) do with shifts?**

> **Merged 22 Nov: asked once, as ON-Q05 in GM-02.** Answer it there; this copy stays for its own evidence and is not asked again.
**Verdict: STILL VALID — M (mobile half) + O (web half).** Mobile:
`roles/explorer/shifts.tsx` is still a placeholder rendering only
"Shifts" (PARITY_MATRIX L17, in repo at head). Web half (web shows
explorers the public and community boards and lets them apply with no
checks, but they can never accept) NOT re-read at head. Parity angle: the
starkest web/Expo split in #184 — web lets them apply to shifts they
cannot take; mobile shows them nothing. Options: KEEP — see boards,
apply, never accept; A — No shifts; hide the boards (explorers use Talent
Board only); B — Unpaid shadowing posts only; C — Paid shifts after
upgrading role (upgrade card exists). Other / defer. Recommended (Oct
2026): C. **Status: STILL VALID (mobile half confirmed), OPEN.**

**GM25-C05 — ON-Q04 / LA-Q05. Payment readiness across clients**

**Status:** Answered: B, tell the worker early and require pay details before acceptance, launch grill, 23 Oct 2026 - see ON-Q04. Engineering: see BL-03 for the acceptance gate and early notice on web and Expo. LA-Q05's remaining launch timing choice is covered by LAUNCH-01.

**GM25-C06 — ON-Q11. What must a pharmacy pass before posting to outside

> **Merged 22 Nov: asked once, as ON-Q11 in GM-02.** Answer it there; this copy stays for its own evidence and is not asked again.
workers?** Context (Oct 2026, NOT RE-VALIDATED): posting checks neither
`Pharmacy.verified` nor `abn_verified`; any pharmacy can post to every
tier, including public. Parity angle: none in the gate itself (backend) —
but each client must surface the same block/message when posting is
refused. Options: KEEP — no checks; B — ABN verified for any outside
post; C — ABN plus admin check before public; D — B for chain/org, C for
public. Other / defer. Recommended (Oct 2026): D. **Status:
NOT RE-VALIDATED.**

**GM25-C07 — ON-Q13. Should pharmacies save a payment method during

> **Merged 22 Nov: asked once, as ON-Q13 in GM-02.** Answer it there; this copy stays for its own evidence and is not asked again.
setup?** Context (Oct 2026, NOT RE-VALIDATED): every booking opens a new
Stripe Checkout; no card stored; under D02 a shift under 2h away leaves
30 minutes to pay. Parity angle: acute on Expo — a phone user doing a
fresh Checkout inside a 30-minute window. New evidence (V): Expo pays by
linking out to the Checkout URL in the system browser (GM25-Q10); no
saved-card path was found on Expo either. Options: KEEP — one checkout
per booking; B — Save card, charge on acceptance; C — Saved card for
subscribers only. Other / defer. Recommended (Oct 2026): B.
**Status: NOT RE-VALIDATED.**

**GM25-C08 — LA-Q02 (code, ON-04). Fix before launch? Mobile "add

> **Also covers (22 Nov):** GM26-Q47 (GM-26). Asked once, here.
personal profile" drops pharmacist data and sends other staff to
not-found.** **Verdict: STILL VALID (pharmacist half) / CHANGED
(other-staff half) — V.** Pharmacist: `roles/pharmacist/onboarding.tsx`
still posts `preferred_hourly_rate`, `minimum_rate`,
`overtime_multiplier`, `weekend_premium` (repo-wide: 1 hit each — this
file only — plus `overtime_multiplier` in an award table, not a worker
profile), so the rate data is still silently dropped; bank fields
(`bsb`, `account_number`, `bank_account_name`) — backend has
`bank_account_name` in invoicing/worker-finance models, but whether the
onboarding update accepts them is UNKNOWN. Other staff: the card now
routes to the existing `/otherstaff/profile-basic-info`; the 404 is gone.
Options: A — Before launch; B — Soon after launch (first month);
C — Not needed. Recommended (Oct 2026): A. **Status: STILL VALID
(pharmacist data loss), OPEN.**

**GM25-C09 — LA-Q03 (code, ON-05). Fix before launch? Reachable mobile
screens can dead-end or send unsupported fields.** **Verdict: STILL VALID
— V (item by item).** Owner onboarding steps 1–3/review still present in
`app/owner/onboarding/`; hidden `roles/owner/shifts/create.tsx` still
builds a payload with `hourly_rate` (the "not a backend field" claim is
weakened — `hourly_rate` has 42 repo hits — but payload acceptance was NOT
verified and it remains a parallel legacy create path); explorer shifts
placeholder (L17, M); owner hub "coming soon" (V); web
`OrganizationCreate.tsx` unrouted (V). Options: A — Before launch;
B — Soon after launch; C — Not needed. Recommended (Oct 2026): A.
**Status: STILL VALID, OPEN.**

**GM25-C10 — LA-Q04 (code, ON-10). Fix before launch? Profile progress %
doesn't match what Verified needs.** Context (Oct 2026, NOT
RE-VALIDATED): `onboarding/services/progress.py` counts resume, bio,
rates, referees and ID, while Verified needs email + mobile + AHPRA. The
% UI still exists on the mobile screen (V: ProgressBar + `{progress}%`
chip in `roles/pharmacist/onboarding.tsx`); the counting logic was not
re-read. Options: A/B/C as above. Recommended (Oct 2026): A. **Status:
NOT RE-VALIDATED.**

**GM25-C11 — LA-Q11 (code, SH-11). Fix before launch? The auto-publish
setting contradicts R06/R04B and is missing on mobile.** **Verdict:
STILL VALID — V, settled by fresh re-trace (see CG-10).** The #184
"current" note was right that backend handlers do not consult the toggle
— `worker_requests.py::approve()` publishes in both branches and never
reads `auto_publish_worker_requests`. But the audit's substance stands:
the field's help text still says "automatically create and publish a new
shift" (`organizations/models.py:238`); the toggle exists on web
(`PharmacyPage.tsx:1613/1950/2117/2508`) and is absent on mobile
(`PharmacyForm.tsx` carries the value in state, renders no toggle).
Options: A/B/C as above. Recommended (Oct 2026): A (correct copy, enforce
per-pharmacy cover permission). **Status: STILL VALID, OPEN.**

**GM25-C12 — LA-Q12 (code, TB-01). Fix before launch? Anonymous talent

> **Merged 22 Nov: asked once, as GM-18-Q13 in GM-18.** Answer it there; this copy stays for its own evidence and is not asked again.
posts expose full names to any signed-in account.** **Verdict: STILL VALID
— A18 (adopted GM-18, senior PASS).** Authenticated feed/list/detail
return names and user IDs; only public reads mask them; both apps consume
the leaking API. Options: A/B/C as above. Recommended (Oct 2026): A.
Severity: **launch-gate, privacy.** **Status: STILL VALID (adopted),
OPEN.**

**GM25-C13 — LA-Q14 (code, TB-04). Fix before launch? The talent board

> **Merged 22 Nov: asked once, as GM-18-Q16 in GM-18.** Answer it there; this copy stays for its own evidence and is not asked again.
downloads every post and filters in the app.** **Verdict: STILL VALID —
A18 (adopted GM-18).** Both apps fetch every feed page through
shared-core, then filter locally; backend checks visibility in a Python
loop before pagination; no server-side distance/rate filters. (Only the
Expo public board paginates.) Options: A/B/C as above. Recommended (Oct
2026): B (soon after launch, with a measured migration trigger).
**Status: STILL VALID (adopted), OPEN.**

**GM25-C14 — LA-Q15 (code, TB-07). Fix before launch? Web and mobile

> **Merged 22 Nov: asked once, as GM-18-Q15 in GM-18.** Answer it there; this copy stays for its own evidence and is not asked again.
disagree on Talent Board booking permissions.** **Verdict: CHANGED
(persists in a new shape) — A18 (adopted GM-18, senior-verified at head).**
Web `TalentBoard/index.tsx:313` `canRequestBooking` = fixed 9-role
allow-list + `isAdminUser`; mobile `talent-board/index.tsx:313`
`canRequestBookingByRole` = any role except EXPLORER / PHARMACIST /
OTHER_STAFF, with `canRequestBookingOverride` fallback. Also: wrong
post-shift route on mobile, duplicate `useTalentFeed` (now diverged —
see CG-18), unthrottled `add_view`. Options: A/B/C as above.
Recommended (Oct 2026): A — one backend hiring-role policy, mirrored in
both clients. **Status: CHANGED (new shape), OPEN.**

**GM25-C15 — LA-Q16 (code, AV-01). Fix before launch? Talent post

> **Merged 22 Nov: asked once, as GM-19-Q12 in GM-19.** Answer it there; this copy stays for its own evidence and is not asked again.
availability is copied once and never syncs with the calendar.**
**Verdict: STILL VALID — A18 (adopted GM-18).** Options: A/B/C as above.
Recommended (Oct 2026): A. **Status: STILL VALID (adopted), OPEN.**

**GM25-C16 — TB-Q07. Is "Request booking" a firm offer or an enquiry?**

> **Merged 22 Nov: asked once, as GM-18-Q07 in GM-18.** Answer it there; this copy stays for its own evidence and is not asked again.
**Verdict: KEEP (firm offer) — A18 (adopted GM-18).** GM-18's senior
review confirms the recommendation is KEEP (firm offer) and correctly
separates the firmness itself (fine) from the defects around it
(credential gap, expiry, permission drift), which are asked as their own
questions. Context (Oct 2026): opens a prefilled dedicated-shift form on
web and mobile; submitting creates firm offers with 48h expiry; workers
accept/decline; outside acceptance reserves pending payment. Options:
KEEP — firm offers (recommended, KEEP); B — Enquiry or chat first, then
an offer; C — Owner chooses each time. Other / defer. **Status: KEEP
(adopted), OPEN.**

**GM25-C17 — TB-Q08. What should the heart on a talent card do?**

> **Merged 22 Nov: asked once, as GM-18-Q08 in GM-18.** Answer it there; this copy stays for its own evidence and is not asked again.
Context (Oct 2026, NOT RE-VALIDATED): heart likes/unlikes a post on both
apps; creates no favourites membership; no "Invite to favourites" action.
Options: KEEP — likes only; A — Adds to favourites, with worker consent;
B — Keep like; add "Invite to favourites" (membership invite). Other /
defer. Recommended (Oct 2026): B. **Status: NOT RE-VALIDATED.**

**GM25-C18 — BK-Q13. Should reservations show a live payment countdown?**

> **Merged 22 Nov: asked once, as GM-12-Q24 in GM-12.** Answer it there; this copy stays for its own evidence and is not asked again.
Context (Oct 2026, NOT RE-VALIDATED): both sides see reserved-not-
confirmed wording and the pay-by time; neither sees a live countdown.
Parity angle: same on both apps in Oct 2026; whether Expo shows the same
wording/deadline is unconfirmed (Expo maps `awaitingPayment` state — V —
but a countdown was not verified). Options: KEEP — state + exact
deadline; A — Add live countdown; B — Show as booked (misleading). Other
/ defer. Recommended (Oct 2026): A. **Status: NOT RE-VALIDATED.**

**GM25-C19 — AG-Q11. Which shifts get pre-shift reminders, and when?**

> **Merged 22 Nov: asked once, as GM22-05 in GM-22.** Answer it there; this copy stays for its own evidence and is not asked again.
Context (Oct 2026, NOT RE-VALIDATED): hourly job emails every booked or
rostered worker once, ~12h before each slot; reservations get none; no
push, no second reminder. Parity angle (GM-25 owns only this): Expo now
has a notifications inbox + push-preference tests (PR249 file list) —
email-only vs push is unresolved; mechanics owned by GM-22/GM-23.
Options: KEEP — one email ~12h before; A — Confirmed only, 24h and 2h
before; B — Confirmed only, 24h before; C — Also reservations. Other /
defer. Recommended (Oct 2026): A. **Status: NOT RE-VALIDATED
(mechanics owned elsewhere); parity angle OPEN.**

**GM25-C20 — PO-Q08 / PO-Q10. Escalation: who is told, and how late may

> **Merged 22 Nov: asked once, as GM-11-Q03 in GM-11.** Answer it there; this copy stays for its own evidence and is not asked again.
it fire?** Context (Oct 2026, NOT RE-VALIDATED): escalation sends
nothing; match emails only at posting straight to public; any past
interest stops escalation for good; escalation runs only when someone
loads a shift list (no scheduled job). Parity angle (GM-25 owns only
this): backend-driven, so all clients inherit it — but each client must
display the same escalation state; mechanics owned by GM-11/GM-22/GM-23.
Options Q08: KEEP — silent, stop at interest; A — Notify each new tier,
stop when reserved; B — Notify at public, stop at interest; C — Owner
chooses per shift. Options Q10 (timing): A — within 5 min; B — within
1 min; C — within 15 min. Recommended (Oct 2026): Q08 A; Q10 A.
**Status: NOT RE-VALIDATED (mechanics owned elsewhere); parity angle
OPEN.**

### 4B. New GM-25 questions (traced at #249 head)

**GM25-Q01 — What is the launch cut across Vite web, Next web, and Expo?**
See §2 — the first question. Options: A — All three together; B —
Vite + Next first, Expo after Senior Package Testing (RECOMMENDED);
C — Expo + Vite first, Next landing only; D — Vite only. Other / defer.
Severity: launch-gate. **Status: OPEN — ask first. TRACED.**

**GM25-Q02 — Vite vs Next: which routes live where, and is the migration
finished, frozen, or rolled back?** Actual today (TRACED, V): the
canonical map exists on paper — Next owns public/auth/blog/news/
calculator/hubs/content, Vite owns `/dashboard` + private workflows
(UNIFIED-WEB-EXPERIENCE-PLAN.md, 14 Sep 2026) — but the plan itself
records the split as incomplete (distinct login flows, duplicated
AuthContext/token helpers, no reliable shared return-path contract,
logout revocation unfinished), and PUBLIC-MIGRATION-PLAN.md says
implementation awaited source access that 404'd. In the tree, Next
app-router public pages are thin wrappers (`<PublicEntry
page="PublicJobBoardPage"/>`) over migrated copies, and 43 of 64 matched
Vite↔Next paths have diverged (VITE_NEXT_TWIN_DRIFT.md). The migration is
therefore **neither finished nor cleanly frozen**: the intent is
documented, the implementation is wrappers + divergent twins. Options:
KEEP — let both serve, Next as public shell, Vite as app (today's apparent
shape); A — Next owns ALL public routes (shifts/talent/explore/orgs), Vite
owns app-only routes; B — Freeze the migration: Next is landing/marketing
only, all product routes stay on Vite; C — Roll Next back into Vite.
Other / defer. Recommended: **A, but only after the public-route contract
test passes on the exact head and the 43 divergent paths are classified**
(twin-drift acceptance protocol) — two public implementations of the same
board is how the "Failed to load public shifts" class of bug happens twice.
Normal case: visitor lands on a public board. Edge case: a shared link
opens on the wrong surface. Web/Expo difference: Expo deep-links must
resolve to one canonical web route. **Status: TRACED — OPEN.**

**GM25-Q03 — Duplicated public boards: one implementation or tolerated
twins?** Actual today (TRACED, V): **confirmed triple implementation.**
Vite `src/pages/PublicJobBoardPage.tsx` (431 lines) and Next migrated
`landing_next/migrated/pages/PublicJobBoardPage.tsx` (468 lines) are both
full implementations sharing `getPublicJobBoard` from shared-core — and
they have **diverged in behaviour**: the Next copy has a race guard
(`latestResultsRequest` — only the latest search/page request may replace
the list; Vite lacks it, so stale responses can overwrite), different SEO
title/description/canonical/image, different layout (Vite: PublicLogoTopBar
+ grey.50; Next: "Browse first. Apply when ready." banner), and drops the
`?organization=` canonical param. The Next app-router page
(`app/(public)/shifts/public-board/page.tsx`) is a thin wrapper rendering
the migrated page. Expo adds `PublicShiftsView.tsx` /
`AnonymousShiftBoardScreen.tsx`. Both web copies show the same
'Failed to load public shifts' error text. The Nov 2026
`GET /public-shifts/` (login-required) vs `GET /public-job-board/`
(public) split was NOT re-validated. Options: KEEP — tolerated twins,
each maintained separately; A — One shared-core implementation, all three
surfaces render it; B — Retire the Vite public boards, Next owns public;
C — Retire Next public boards, Vite owns public. Other / defer.
Recommended: **A** — the public board is the top of the funnel; a twin
that drifts is a lost applicant. Severity: High. **Status: TRACED
(duplication CONFIRMED), OPEN.**

**GM25-Q04 — Shared-core scope: which flows must go through shared-core,
and what happens to direct client API calls?** Actual today (TRACED, V +
M): Vite public board uses shared-core (`getPublicJobBoard`,
`expressInterestInPublicShiftService`); Expo active/confirmed shifts went
through shared-core in #249 `96cd52bf`; Expo payment uses shared-core
checkout calls. But PARITY_MATRIX L14 (in repo at head) records direct
Axios remaining in `nativeIdentityTransport.ts` (login/register/OTP) plus
refresh/CSRF/WebSocket-ticket/app-config adapters — "endpoint constants
coming from shared-core do not make a locally executed Axios request a
shared-core operation". So adoption is **partial**: domain reads/writes
are moving to shared-core, identity/session transport is not. Options:
KEEP — shared-core where it exists, direct calls elsewhere (today's
apparent shape); A — All domain calls through shared-core on both
clients, direct calls fail review; B — Shared-core for new work only,
legacy direct calls grandfathered. Other / defer. Recommended: **A** —
parity cannot be audited if each client can bypass the shared contract;
the #249 boundary audit ("passed after the source ownership repair")
points this way. Severity: High. **Status: TRACED (partial adoption),
OPEN.**

**GM25-Q05 — Dead, half-built, and "coming soon" screens: delete, hide,
or fix before launch?** Actual today (TRACED, V): placeholders confirmed
at head — `HubPlaceholder.tsx` ("Hub will live here. Coming soon."),
`roles/owner/hub.tsx` ("Hub coming soon … This is a placeholder."),
pharmacist learning "Coming Soon" (PARITY_MATRIX L16, M), Explorer shifts
"Shifts" (L17, M), owner onboarding steps 1–3/review still present,
hidden `create.tsx` still posting `hourly_rate`, `OrganizationCreate.tsx`
unrouted. Expo also gained `app/explore/hubs/` and `features/parity/` —
the placeholders were **not** replaced, they sit beside new surfaces.
Options: KEEP — leave reachable placeholders as-is; A — Delete or
un-route every dead screen before launch; B — Hide behind a flag /
remove from navigation, fix after launch; C — Fix all before launch.
Other / defer. Recommended: **A for unrouted/dead screens, B for
genuinely post-launch features** — a reachable dead end is worse than a
missing feature; a labelled "coming soon" inside an existing hub is
acceptable only if it cannot take input or money. Severity: High
(first-impression + support load). Normal case: user taps a nav item.
Edge case: a deep link / QR lands on a dead route. **Status: TRACED,
OPEN.**

**GM25-Q06 — Navigation and routing parity: one nav model, or one per
client?** Actual today (TRACED, M + V): Vite `src/navigation.tsx`; Expo
`app/_layout.tsx` + per-role `_layout.tsx` files + PersonaShell route/
title auditing (#249 `3149fbc2`); Expo `utils/notificationNavigation.ts`
and notification-routing tests (PR249 file list). PARITY_MATRIX (M)
supplies the destination-by-destination evidence: L10 (org/admin nav does
not mirror capability rules — mobile lists entries unconditionally, admin
"Roster" points at the Shift Centre instead of `/manager/roster`), L13
(activity URL conversion misses renamed native routes), L15 (admin
Attendance Approvals web nav target is unrouted — a **web** defect).
Whether the same role sees the same destinations in the same order on web
and Expo is therefore **answered in the negative for the L10/L13/L15
cases**. Options: KEEP — each client keeps its own navigation; A — One
role → destination map, implemented per client, covered by route tests;
B — Expo mirrors web navigation exactly (same order, same labels).
Other / defer. Recommended: **A** — native need not pixel-mirror web
(Issue #250), but a role must never find a destination on one client
that does not exist on the other without that being a deliberate,
documented cut. Severity: Medium. **Status: TRACED (via PARITY_MATRIX),
OPEN.**

**GM25-Q07 — Auth and session parity: same rules on all three surfaces?**
Actual today (TRACED, A01 + V): Expo has login/OTP/mobile-verify/forgot/
reset routes plus app lock + biometric (`appLock.ts`,
`biometricAuth.ts`, `AppLockGate.tsx` — PR249 file list); web session
rules per GM-01 (adopted): remember-me inversion (ticked = 7-day refresh,
unticked = 90-day), Expo always persistent with no checkbox, biometric
flag in AsyncStorage not SecureStore, Next migrated `config/api.ts`
passes `getToken` but NO `refreshToken` callback. Options: KEEP — Expo
keeps app lock/biometric, web keeps its own session behaviour; A — One
session policy (expiry, stale-session, re-auth, lockout) written once,
applied on all surfaces, with native biometrics as an *additional* unlock,
not a different session; B — Web session rules only; Expo defers to web
login via WebView. Other / defer. Recommended: **A**. Edge cases: stale
session mid-booking; session expires during kiosk PIN setup; biometric
fails. Severity: High (a session that behaves differently per client
strands bookings). **Status: TRACED (via GM-01), OPEN.**

**GM25-Q08 — Logged-out public surfaces: what must a visitor be able to
do on each surface?** Actual today (TRACED, V): Expo has a public Explore
tree (`app/explore/` — article, blog, hubs, learning, news, organization,
talent-board — PR249 file list) and anonymous public-shift load-more
retry was fixed in #249 `79d294d`; Next has public routes under a
contract test (read at head); Vite has `PublicShiftsPage.tsx` /
`PublicTalentBoardPage.tsx`. Whether the three public surfaces show the
same content, same filters, and same calls-to-action is UNKNOWN (the two
web board copies already differ in layout/SEO/race handling — Q03).
Options: KEEP — each public surface shows what it shows today; A — One
public content contract: same boards, same cards, same "sign up to
apply" gate on all three; B — Next is the only public surface; Vite and
Expo public boards link out to it. Other / defer. Recommended: **A** —
the public board is the funnel; three different funnels is three
different products. Severity: High. **Status: TRACED (STRUCTURE);
content parity UNKNOWN, OPEN.**

**GM25-Q09 — Offline and poor-network behaviour on Expo: what is the
promise?** Actual today: `features/nextShift/offlineConfirmedShifts.ts`
exists (PR249 file list); #249 fixed stale-reload/terms-dismissal
regressions (`d15304b0`). What a worker can see or do offline (view
confirmed shifts? clock in? apply?) is UNKNOWN — the file was not opened
in this trace. Options: KEEP — whatever each screen does today when
offline; A — Documented offline promise: confirmed shifts + roster
readable offline, all writes queued with visible retry, never silently
dropped; B — Online-only app: clear offline state, no cached writes.
Other / defer. Recommended: **A** — locums work in hospitals with dead
zones; silent failure to record a shift is a pay dispute. Edge cases:
clock-in offline then online; accept offered while offline; stale terms
shown from cache. Severity: High. **Status: UNKNOWN (not inspected),
OPEN.**

**GM25-Q10 — How does Expo take payment?** Actual today (TRACED, V):
**resolved — link-out to Stripe Checkout in the system browser.**
`roles/shared/shifts/ActiveShiftsPage/index.tsx::handlePayWithStripe`
calls the shared-core checkout, then `Linking.openURL(res.url)`; 409
recovery via `resumeFulfillmentCheckout` / `expireFulfillmentCheckout`
with a "Checkout already in progress" dialog; `roles/owner/
subscription-seats.tsx` does the same for subscriptions
(`createSubscriptionCheckout` → `Linking.openURL`, reading
`checkout=success/cancel` params on return). No native payment sheet, no
WebView. Repo-wide `Stripe` search in `frontend_mobile` returned only 5
hits (subscription-seats, ActiveShiftsPage ×2, PharmacyForm ×2) — no
other payment path exists on Expo. NOT verified: the return-to-app leg
(deep link vs browser tab), behaviour when the app is backgrounded during
Checkout, and duplicate-payment handling on retry. Options: KEEP — n/a
(no longer applicable); A — Expo hands payment to the web Checkout
(link/WebView) and returns to the app on completion (**the implemented
path — confirm it**); B — Native payment sheet (Stripe SDK) inside Expo;
C — Expo cannot pay: reservations made on Expo must be paid on web,
stated in-app before acceptance. Other / defer. Recommended: **A as
implemented, with the return leg proven before any Expo launch** (never
let a worker accept a reservation on Expo that the pharmacy cannot pay
for inside the D02 window). Severity: **launch-gate; financial.**
Normal case: owner accepts → pays in 30 min (urgent shift). Edge case:
payment link expires mid-handoff; app backgrounded during Checkout;
duplicate payment on retry. **Status: TRACED, OPEN (confirm + prove
return leg).**

**GM25-Q11 — Notification parity: email vs push — same events, same
timing?** Actual today (TRACED, V structure): web reminders are email
(Oct 2026, NOT re-validated); Expo has a notifications inbox, push-preference
tests, and hub/membership routing tests (PR249 file list). Whether the
same event produces email on web and push on Expo, and whether a user
with both gets two copies, is UNKNOWN. Cross-ref: GM-26 Q44 — notifications
persist kiosk codes/PIN OTPs (confirmed at head), so the notification
channel itself is a privacy surface. Options: KEEP — email on web,
push on Expo, no defined mapping; A — One event catalogue: every event
has defined web + Expo channels, one copy per user across devices;
B — Push only on Expo, email only on web, duplicates accepted. Other /
defer. Recommended: **A**. Covers: reservation expiry, offer received/
expired, escalation, reminders (AG-Q11), cancellation, incident notices.
Severity: High (a missed payment-expiry notice is a lost booking).
**Status: UNKNOWN, OPEN.**

**GM25-Q12 — Kiosk: web-only, or does Expo do kiosk too?** Actual today
(TRACED): Vite has `src/kiosk/`, `kiosk.html`, `src-tauri/` (desktop
kiosk); Expo has `app/kiosk-link.tsx` and `app/attendance-pin.tsx`
(verified dirs) — a link/route, not necessarily a kiosk; the pairing code
is delivered to Expo via a notification containing a `kiosk_link_route`
(see GM-26 Q44). Options: KEEP — kiosk is a Vite/desktop surface; Expo
only links to it; A — Expo is a full kiosk client (PIN + QR clock-in on a
shared device); B — Kiosk is web-only and Expo carries no kiosk routes at
all. Other / defer. Recommended: **KEEP (A only if a pharmacy asks for
tablet kiosk)** — kiosk on a shared personal phone raises session/privacy
questions the grill has not settled (Issue #250: existing QR scanning
unchanged unless separately approved). Severity: Medium. **Status:
TRACED (STRUCTURE); Expo kiosk behaviour UNKNOWN, OPEN.**

**GM25-Q13 — Accessibility and text scaling: is 1.6× text a launch gate
for both clients?** Actual today (verified, PR #249 body + ledger):
signing off the three native reference screens at normal and **1.6× text**
is listed as next work, not done. No web equivalent standard was found in
this trace. Options: KEEP — 1.6× sign-off for the three native screens only,
web unmeasured; A — Same bar both clients: reference screens at 1.6×
text on web and Expo before launch; B — 1.6× is post-launch polish on
both. Other / defer. Recommended: **A for the same three flows on web**
(Post Shift, worker Shift/Offer, owner Shift Centre) — the flows are
the product; if they break at large text, the users who need large text
cannot book or pay. Severity: Medium. **Status: TRACED (PR #249 body +
ledger); web standard UNKNOWN, OPEN.**

**GM25-Q14 — Error, retry, and crash UX: one standard across clients?**
Actual today (TRACED): Expo has branded root crash recovery UI
(#249 `d36927af`), anonymous public-shift load-more retry preserving
results (#249 `79d294d`), Shift Centre Retry with scope-bound cache
invalidation (#249 `a7ad728e`), fail-closed pharmacy filters
(#249 `d15304b0`). Web/Next equivalents were not inspected. Ledger
invariant: "A failure is not empty" — every network load has loading,
content, empty and error with Retry. Options: KEEP — each client keeps
its own error/retry behaviour; A — One standard: every list keeps its
results on error with retry; every failed write says what happened and
what to do; no silent drops; crashes land on a branded recovery screen
on all surfaces. B — Expo standard only; web follows later. Other /
defer. Recommended: **A**. Severity: Medium-High (failed payment/
acceptance retries are money). Edge cases: retry after payment
(idempotency); retry after terms changed (409 `TERMS_CHANGED` — PR #249
body: reload, re-agree). **Status: TRACED (Expo, PR #249 body + ledger);
web UNKNOWN, OPEN.**

**GM25-Q15 — "Coming soon" policy: what may ship labelled coming-soon?**
Actual today (TRACED, V): placeholders confirmed at head (see Q05):
HubPlaceholder, owner hub, pharmacist learning (L16), Explorer shifts
(L17). Options: KEEP — placeholders may ship wherever they exist today;
A — Nothing ships as "coming soon" in navigation; unbuilt features are
absent until built; B — "Coming soon" allowed only for non-core,
non-money features, clearly labelled, never taking input. Other / defer.
Recommended: **B** — deleting everything unfinished is cleaner, but a
labelled hub teaser is honest marketing; a "coming soon" button that
accepts a tap and does nothing is not. Severity: Medium. **Status:
TRACED, OPEN.**

**GM25-Q16 — Web ↔ app install handoff: where does web send phone
users, and does the app link back?** Actual today (TRACED): landing_next
has `components/app-install-banner.tsx` and
`shared/mobile-store-links.ts` (+ test) touched by #249; Expo has
`app/welcome.tsx` and `app/index.tsx`. Store listing state, deep links,
and whether a phone user on Vite web is pushed to the store are UNKNOWN.
Options: KEEP — banner + store links as they are; A — Defined handoff:
web detects phone → offers app, deep-links back to the same content;
app links out to web for anything it cannot do (e.g. payment);
B — No install prompts until Expo is launched (GM25-Q01 B). Other /
defer. Recommended: **B if GM25-Q01 = B; otherwise A**. Severity:
Medium (a banner pointing at an unlaunched store is a dead end).
**Status: TRACED (STRUCTURE); behaviour UNKNOWN, OPEN.**

**GM25-Q17 — Launch sign-off evidence: what proves each surface ready?**
Actual today (verified, PR #249 body + ledger): for Expo — no device
screenshots, no real SDK 58 builds, no authenticated real-backend
acceptance, no store readiness; shared-core suite needs reverification
on latest head (447/1 on the handover head, test-only fix since);
latest CI unchecked; W3b exact-head CI must pass before W3b closes;
Senior Package Testing not done. Web evidence standard was not found in
this trace. Options: KEEP — each surface ships on its existing CI (web) /
PR review (Expo); A — One sign-off checklist per surface: exact-head CI
green + authenticated staging acceptance on real devices (Expo) / real
browsers (web) + the three reference screens at 1.6× + no known
launch-gate code gap open; B — Owner sign-off on demo only. Other /
defer. Recommended: **A** — Issue #250's progress labels (NOT VERIFIED →
… → WEB VERIFIED → EXPO VERIFIED → LAUNCH SIGNED OFF) require
per-surface verification, not a single demo. Severity: launch-gate.
**Status: TRACED (PR #249 body + ledger for Expo; web UNKNOWN), OPEN.**

**GM25-Q18 — Twin-drift prevention after launch: who owns parity?**
Actual today (TRACED, V): contract tests exist in places — landing_next
`lib/public-route-contract.test.mjs` (read at head), `shared/mobile-store-links.test.mjs`
(PR249 file list), shared-core domain tests. A twin-drift report exists
with an acceptance protocol (`VITE_NEXT_TWIN_DRIFT.md` — classify each
twin, assert routes/auth/error behaviour before removal) but its
checklist boxes are unchecked and no owner or process was found.
PARITY_MATRIX.md (L1–L17) is itself a drift inventory with no owner.
Options: KEEP — no owner; drift found by users; A — Shared-core contract
+ public-route contract tests are launch gates, and one named owner
reviews every cross-client change for parity; B — Quarterly parity audit
only. Other / defer. Recommended: **A** — the #184 twins (TB-07,
duplicate hooks, duplicate boards) were all born from unowned drift, and
this re-run found the `useTalentFeed` twins already diverged. Severity:
Medium (prevents the next GM-25). **Status: TRACED, OPEN.**

## 5. Documentation matrix and implementation backlog

### 5.1 Per-question source links and decision status

| Q | Source (ref) | Status |
|---|---|---|
| GM25-C01 (ON-Q15) | #184 `questions.json` ON-Q15; `AUDIT.md` ON-04 @ `c786a4b8`; re-traced @ `97c4543e` (`ChooseAccountTypeCard.tsx`, `roles/pharmacist/onboarding.tsx`, `app/otherstaff/` listing) | CHANGED (partial) — OPEN |
| GM25-C02 (ON-Q02) | #184 ON-Q02; adopted GM-01 | Answered: KEEP, launch grill, 23 Oct 2026 - see GM01-Q04 for the single re-confirmation |
| GM25-C03 (ON-Q03) | #184 ON-Q03; `verification/state.py` | Answered: B, check every outside booking, launch grill, 23 Oct 2026 - see VERIFY-GATE-01 |
| GM25-C04 (ON-Q05) | #184 ON-Q05; `AUDIT.md` ON-09 @ `c786a4b8`; PARITY_MATRIX L17 @ `97c4543e` | STILL VALID (mobile half confirmed) — OPEN |
| GM25-C05 (ON-Q04/LA-Q05) | #184 ON-Q04, LA-Q05 | Answered: B, tell the worker early and require pay details before acceptance, launch grill, 23 Oct 2026 - see ON-Q04. Engineering: see BL-03. Launch timing: see LAUNCH-01. |
| GM25-C06 (ON-Q11) | #184 ON-Q11; `AUDIT.md` ON-06 @ `c786a4b8` | NOT RE-VALIDATED — OPEN |
| GM25-C07 (ON-Q13) | #184 ON-Q13; `AUDIT.md` ON-08 @ `c786a4b8` | NOT RE-VALIDATED — OPEN |
| GM25-C08 (LA-Q02) | #184 LA-Q02; `AUDIT.md` ON-04 @ `c786a4b8`; re-traced @ `97c4543e` (repo-wide field searches) | STILL VALID (pharmacist) / CHANGED (other-staff) — OPEN |
| GM25-C09 (LA-Q03) | #184 LA-Q03; `AUDIT.md` ON-05 @ `c786a4b8`; re-traced @ `97c4543e` | STILL VALID — OPEN |
| GM25-C10 (LA-Q04) | #184 LA-Q04; `AUDIT.md` ON-10 @ `c786a4b8` | NOT RE-VALIDATED — OPEN |
| GM25-C11 (LA-Q11) | #184 LA-Q11; `AUDIT.md` SH-11 @ `c786a4b8`; re-traced @ `97c4543e` (`organizations/models.py:238`, `worker_requests.py`, `PharmacyPage.tsx`, `PharmacyForm.tsx`) | STILL VALID (fresh re-trace) — OPEN |
| GM25-C12 (LA-Q12) | #184 LA-Q12; `AUDIT.md` TB-01 @ `c786a4b8`; adopted GM-18 | STILL VALID (adopted) — OPEN, launch-gate |
| GM25-C13 (LA-Q14) | #184 LA-Q14; `AUDIT.md` TB-04 @ `c786a4b8`; adopted GM-18 | STILL VALID (adopted) — OPEN |
| GM25-C14 (LA-Q15) | #184 LA-Q15; `AUDIT.md` TB-07 @ `c786a4b8`; adopted GM-18 | CHANGED (new shape, adopted) — OPEN |
| GM25-C15 (LA-Q16) | #184 LA-Q16; `AUDIT.md` AV-01 @ `c786a4b8`; adopted GM-18 | STILL VALID (adopted) — OPEN |
| GM25-C16 (TB-Q07) | #184 TB-Q07; `AUDIT.md` TB-06 @ `c786a4b8`; adopted GM-18 | KEEP (adopted) — OPEN |
| GM25-C17 (TB-Q08) | #184 TB-Q08; `AUDIT.md` TB-05 @ `c786a4b8` | NOT RE-VALIDATED — OPEN |
| GM25-C18 (BK-Q13) | #184 BK-Q13 @ `c786a4b8` | NOT RE-VALIDATED — OPEN |
| GM25-C19 (AG-Q11) | #184 AG-Q11 @ `c786a4b8` | NOT RE-VALIDATED (mechanics GM-22/GM-23) — parity angle OPEN |
| GM25-C20 (PO-Q08/Q10) | #184 PO-Q08, PO-Q10; `AUDIT.md` SH-05/SH-06 @ `c786a4b8` | NOT RE-VALIDATED (mechanics GM-11/GM-22/GM-23) — parity angle OPEN |
| GM25-Q01 | PR #249 body + ledger + head @ `97c4543e`; Issue #250 | TRACED — OPEN, ask first |
| GM25-Q02 | `UNIFIED-WEB-EXPERIENCE-PLAN.md`, `PUBLIC-MIGRATION-PLAN.md`, `VITE_NEXT_TWIN_DRIFT.md` @ `97c4543e` | TRACED — OPEN |
| GM25-Q03 | `PublicJobBoardPage.tsx` (Vite + migrated, diffed) + app-router wrapper @ `97c4543e` | TRACED (duplication CONFIRMED) — OPEN |
| GM25-Q04 | Shared-core usage (Vite board, Expo shifts/payment) + PARITY_MATRIX L14 @ `97c4543e` | TRACED (partial adoption) — OPEN |
| GM25-Q05 | `HubPlaceholder.tsx`, `roles/owner/hub.tsx`, `create.tsx`, `OrganizationCreate.tsx`, `main.tsx` @ `97c4543e` | TRACED — OPEN |
| GM25-Q06 | `PARITY_MATRIX.md` L10/L13/L15 @ `97c4543e` | TRACED — OPEN |
| GM25-Q07 | Adopted GM-01 + `appLock.ts`/`biometricAuth.ts` (PR249 list) | TRACED — OPEN |
| GM25-Q08 | `frontend_mobile/app/explore/`; `landing_next` public-route test @ `97c4543e` | TRACED (STRUCTURE); content parity UNKNOWN — OPEN |
| GM25-Q09 | `features/nextShift/offlineConfirmedShifts.ts` (PR249 file list) | UNKNOWN — OPEN |
| GM25-Q10 | `ActiveShiftsPage/index.tsx` (`handlePayWithStripe`, `Linking.openURL`) + `subscription-seats.tsx` @ `97c4543e` | TRACED — OPEN (confirm + prove return leg) |
| GM25-Q11 | `features/notifications/` (PR249 file list); #184 AG-Q11 | UNKNOWN — OPEN |
| GM25-Q12 | `frontend_web/src/kiosk/`, `kiosk.html`; `frontend_mobile/app/kiosk-link.tsx` | TRACED (STRUCTURE) — OPEN |
| GM25-Q13 | PR #249 body + ledger (1.6× sign-off = next work, not done) | TRACED — OPEN |
| GM25-Q14 | PR #249 body (`d36927af`, `79d294d`, `a7ad728e`, `d15304b0`) + ledger invariant | TRACED (Expo) — OPEN |
| GM25-Q15 | Placeholders read at head (Q05 evidence) | TRACED — OPEN |
| GM25-Q16 | `landing_next/shared/mobile-store-links.ts` (PR249 file list) | TRACED (STRUCTURE) — OPEN |
| GM25-Q17 | PR #249 body + ledger (evidence not performed; W3b CI gate) | TRACED — OPEN |
| GM25-Q18 | `VITE_NEXT_TWIN_DRIFT.md` + public-route contract test @ `97c4543e` | TRACED — OPEN |

No GM-25 question is OWNER DECIDED. No carried #184 decision in the queue
above was re-asked as decided: the 30 carried decisions (D01–D05, R01,
R04/R04A–D, R06, E01/E01A–B, E03, P02, P04–P12, FEES, F01, F04, NOPEN)
are **not** GM-25 questions and are not reopened here — except where a
parity implementation contradicts one (SH-11 vs R06/R04B, see GM25-C11).

### 5.2 Implementation backlog — only after the owner answers

Nothing below is decided. Each item waits on its owner decision; do not
start build work from this list alone.

| # | Backlog item | Waits on | Severity / launch impact |
|---|---|---|---|
| B1 | Re-trace the remaining NOT RE-VALIDATED items (C05, C06, C07, C10, C17, C18; C19/C20 mechanics via GM-22/GM-23) against the live head file contents; clear or confirm each | — (re-trace, not a decision) | Launch-gate: the queue cannot be fully trusted until this is done |
| B2 | Expo payment return leg: prove the Stripe Checkout → app return (deep link vs browser tab), backgrounded-app behaviour, duplicate-payment handling on retry | GM25-Q10, GM25-Q01 | Launch-gate, financial |
| B3 | Anonymous talent-post serializer masking (TB-01) on the authenticated API; consent-based reveal | GM25-C12, TB-Q02 (carried) | Launch-gate, privacy |
| B4 | Single public-board implementation via shared-core (Vite + Next + Expo); retire or reconcile the diverged twins, starting with the race-guard gap | GM25-Q03, GM25-Q04 | High — funnel |
| B5 | Canonical Vite/Next route split; finish or freeze migration; classify the 43 divergent twin paths; public-route contract green on exact head | GM25-Q02 | High |
| B6 | Delete/un-route dead screens; fix mobile add-profile rate fields (ON-04) — remove or wire the dropped fields | GM25-Q05, GM25-C08, GM25-C09 | High — first impression |
| B7 | One backend hiring-role policy for talent-board booking, mirrored on both clients (TB-07); unify the diverged `useTalentFeed` copies | GM25-C14 | High — trust |
| B8 | Correct auto-publish copy, enforce per-pharmacy cover permission (R04A), add the mobile toggle or remove the field | GM25-C11 | High — correctness |
| B9 | Verification/payment-readiness checklists surfaced early on both apps (ON-10/ON-11) | GM25-C05, GM25-C10 | High — drop-off |
| B10 | Notification event catalogue: one event → defined web + Expo channels, no duplicates | GM25-Q11, GM25-C19 | High — missed bookings |
| B11 | Offline promise: cached confirmed shifts/roster, queued writes with visible retry | GM25-Q09 | High — pay disputes |
| B12 | Escalation scheduled job + per-tier notices (SH-05/SH-06) | GM25-C20 | High — unfilled shifts |
| B13 | Subscriber pricing + hard-coded Stripe price IDs (SH-03); legacy penalty route removal (SH-02) | Code gaps CG-5/CG-6 | High — money |
| B14 | Offer expiry capped at shift start (SH-07); terms snapshot incl. cancellation table + version (SH-09/D2) | Code gaps CG-8/CG-9 | High |
| B15 | Talent-board server filters + distance filter (TB-04); availability sync + validation + expiry (AV-01/AV-04/AV-05) | GM25-C13, GM25-C15 | Medium — scale |
| B16 | PARITY_MATRIX L1–L17 remediation, prioritised: L9 chat pagination, L5 timesheet detail, L6 attendance timezone, L16/L17 placeholders, L15 unrouted web nav target | GM25-Q06 | Medium–High |
| B17 | 1.6× text sign-off: three reference screens on Expo + same three flows on web | GM25-Q13 | Medium |
| B18 | Crash/error/retry standard applied to web + Next (Expo already has it) | GM25-Q14 | Medium |
| B19 | Kiosk scope decision implemented (link-only vs full Expo kiosk) | GM25-Q12 | Medium |
| B20 | Install-handoff: banner/store links only once Expo is launched; deep links resolve to canonical web routes | GM25-Q16, GM25-Q01 | Medium |
| B21 | Per-surface launch sign-off checklist (exact-head CI, authenticated staging acceptance, real devices/browsers) | GM25-Q17 | Launch-gate process |
| B22 | Parity ownership: shared-core + public-route contract tests as launch gates; named reviewer for cross-client changes; twin-drift protocol owned | GM25-Q18 | Medium — prevents next GM-25 |
| B23 | PR #249's own remaining work, cross-referenced not duplicated: W3b/W3d/e/f, backend D2 immutable terms snapshot, waves W4–W8, Senior Package Testing (devices, staging providers, EAS binary, rollback) | PR #249 body + ledger | Launch-gate for Expo |

### 5.3 Acceptance tests the owner should expect (per Issue #250)

For each surface, before LAUNCH SIGNED OFF: normal flow end-to-end;
failure (offline, payment fail, expired reservation); duplicate/concurrent
(accept twice, double-tap pay); cross-pharmacy / wrong-tenant (selected-
pharmacy filter fail-closed); stale session; clock/timezone (reservation
deadline, 1.6× text); worker/owner/admin/org roles; and the same flow
verified on web **and** Expo. Missing mobile function counts as a parity
gap; native interactions need not pixel-mirror web.

### 5.4 What this trace did not do

- Did not re-validate C05, C06, C07, C10, C17, C18 (see §4A) or the
  C19/C20 mechanics (owned by GM-11/GM-22/GM-23).
- Did not open `features/nextShift/offlineConfirmedShifts.ts` (Q09),
  the Next `HUB-IMPLEMENTATION.md` contents, or the Expo Explore/Hub
  screens' behaviour beyond listings.
- Did not verify CI status, build the apps, or run anything.
- Did not re-validate the 30 carried #184 decisions or any other GM area's
  questions, except by adopting GM-01/GM-18 verdicts as labelled.
- Did not verify the Expo payment return-to-app leg, the Vite
  `GET /public-shifts/` vs `GET /public-job-board/` split, or the
  `roles/` vs `app/` canonical-tree question on Expo.

### Sources

- Issue #250 — `chemisttasker11-ezy/ChemistTasker-Ezy1#250` (read 2026-11-21).
- PR #184 — `pull/184`, head `c786a4b8182ebf9b505d47cd81980eb3b9851ce3`;
  `docs/qa/launch-grill/AUDIT.md` (re-fetched in full at
  `refs/pull/184/head` in this re-run), `docs/qa/launch-grill/questions.json`
  (142 questions, 30 carried decisions) on `refs/pull/184/head`.
- PR #249 — `pull/249`, head `97c4543e051b43fe30ec7e2e61ad3d69957a918e`
  (verified current in this re-run); file list pp. 1–4 fetched by me
  (314 files confirmed); body re-read.
- Files read at `refs/pull/249/head` in this re-run (see §0 for the full
  list): public-board pages ×3 (Vite, Next migrated, Next app-router),
  `main.tsx`, `HubPlaceholder.tsx`, `roles/owner/hub.tsx`,
  `ChooseAccountTypeCard.tsx` (mobile), `OrganizationCreate.tsx`,
  both `useTalentFeed.ts` copies, `organizations/models.py`,
  `shifts/worker_requests.py`, `PharmacyForm.tsx` (mobile),
  `roles/pharmacist/onboarding.tsx`, `roles/owner/shifts/create.tsx`,
  `lib/public-route-contract.test.mjs`,
  `ActiveShiftsPage/index.tsx`, `subscription-seats.tsx`,
  `UNIFIED-WEB-EXPERIENCE-PLAN.md`, `PUBLIC-CONTENT-IMPLEMENTATION.md`,
  `FEATURE-MAPPING.md`, `PUBLIC-MIGRATION-PLAN.md`,
  `ONLINE_SENIOR_PRODUCTION_WAVES_2026-11-04.md`,
  `VITE_NEXT_TWIN_DRIFT.md`, `PARITY_MATRIX.md`,
  `W3_WEB_TO_EXPO_FUNCTIONAL_PARITY_REVIEW_2026-11-04.md`;
  repo-scoped searches: PublicJobBoardPage, "coming soon",
  HubPlaceholder, ChooseAccountTypeCard, OrganizationCreate, useTalentFeed,
  auto_publish, platform_admin, Stripe (frontend_mobile),
  preferred_hourly_rate, minimum_rate, overtime_multiplier,
  bank_account_name, hourly_rate.
- Adopted verdicts: GM-18 senior review (PASS, 2026-11-21) and GM-01
  (`~/workspace/proactivity/chemisttasker-grill-gm01.md`).
- Rate limit: no real HTTP 429 in this re-run (~80 sequential GitHub
  calls, 9–12 s apart). One false detector stop on a blob SHA containing
  "429" (`0429a0e8…`); corrected, resumed, no recurrence.

### Addendum (2026-11-21, from MEMORY.md, main-agent whole-project review, not verified by this trace)

The main agent's read-only whole-project review (recorded in MEMORY.md
2026-11-21) corroborates the launch-cut caution in GM25-Q01: ChemistTasker
carries a "PRODUCTION NO-GO" audit in PR #200, Issue #250 Grill Me is still
open, main's last commit was 3 November 2026, almost all recent work sits
in 84 unmerged PRs including PR #248 (a 480-file mobile rewrite), CI is red
on main, and the staging deploy pipeline is broken (no self-hosted runner,
deploys queued since October). This trace did not independently verify any
of those claims; they are recorded here because they bear directly on
GM25-Q01 (launch cut) and GM25-Q17 (sign-off evidence) and should be
confirmed or corrected when the owner answers.

## Added 2026-11-22: decisions the orchestrator made for you
From the orchestrator's decision logs (`DECISIONS_FOR_OWNER.md`, `DECISIONS_2026-11-11.md`, `DECISIONS_2026-11-12.md`). Code: `origin/agent/pr257-int` `47506e67`. "Yes" keeps the recommendation. Nothing is built from your answer until the whole grill ends.

### GM-25-OD-18: Owner and organisation "public" and "community" shift boards: web pages with no menu links (OD-18, decisions-for-owner 26)
**Platforms:** Web only
**What happens today:** Web has these owner/organisation pages but no menu leads to them. Expo matches what web users can reach, so it has none.
**Already implemented:** pr257
**Recommendation:** Keep as today for launch; decide later whether to add menu links on both or remove the hidden web pages.
**Other option:** Add menu links and Expo screens now.
**Status:** OPEN, confirm or change.

### GM-25-OD-19: iPhones older than iOS 16.4 cannot install the app (OD-19, decisions-for-owner 7)
**Platforms:** Expo only
**What happens today:** Expo SDK 58 needs iOS 16.4 or later (before: 15.1). iPhones stuck on older iOS (iPhone 6s/7 era) cannot install new versions. The only other way is staying on an old SDK, which has a known memory bug.
**Already implemented:** pr257 (SDK 58)
**Recommendation:** Accept.
**Other option:** Stay on an older SDK.
**Status:** OPEN, confirm or change.

### GM-25-OD-20: App landing: no auto-rotating carousel; picking a persona preselects the role (OD-20, decisions-for-owner 14, 15)
**Platforms:** Expo only
**What happens today:** The app landing borrows the website's hero, persona chips and value strip, but not the auto-rotating persona carousel (it moves while you read on a phone). Tapping a persona preselects that role on Create account; the user can change it.
**Already implemented:** pr257
**Recommendation:** Keep.
**Other option:** Add the rotating carousel.
**Status:** OPEN, confirm or change.

### GM-25-OD-21: Tab rows and stronger grey text (OD-21, decisions-for-owner 37, 39 (after your 38))
**Platforms:** Web + Expo
**What happens today:** Following your rule (no sideways swipe), I chose the look: a dropdown anchored to the pill, a soft violet fill and a check on the current choice. I also made the two grey text colours darker on mobile. Web was to get the same two greys as a small follow-up; not confirmed done.
**Already implemented:** pr257 (mobile)
**Recommendation:** Keep, and give web the same greys.
**Other option:** Keep the old greys.
**Status:** OPEN, confirm or change.

### GM-25-OD-22: Error wording (OD-22, D25, D158/D163)
**Platforms:** Web + Expo
**What happens today:** Expo keeps web's wording "Failed to escalate shift". Raw server text such as "No Pharmacy matches the given query." is replaced by friendly not-found copy in the shared error path, on both web and Expo.
**Already implemented:** commits 172622e8 and cc5f2787
**Recommendation:** Keep.
**Other option:** Show the server's own text.
**Status:** OPEN, confirm or change.
