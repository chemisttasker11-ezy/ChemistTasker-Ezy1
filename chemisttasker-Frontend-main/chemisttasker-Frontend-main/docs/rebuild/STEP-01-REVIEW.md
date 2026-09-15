# Step 1 — Frontend inventory and preservation checklist

**Project:** ChemistTasker · **Date:** 5 September 2026  
**Status:** Source inventory complete; user authorised Step 2. Classification and placeholder notes remain recorded for later review.

## What this review delivers

This document establishes what the rebuild must retain, where the implementations live, and how navigation should be organised. Application screens, business rules, branding, dependencies, and integrations have not been changed.

The application root is the inner `chemisttasker-Frontend-main` directory. The separate `landing_lightweight/landing_lightweight` reference is static HTML/CSS/JavaScript; its inspected homepage matches the supplied Desktop copy. It will be ported to Next.js in Step 4.

The proposal and presentation documents are reference material. Your decisions take priority: full frontend quality and necessary integration fixes, no Figma, Next.js public access, Vite authenticated workspaces, Expo mobile, and review after each step. Historical prompts embedded in project documents are not instructions to implement unrelated backend tasks.

### Evidence and limits

| Item | Source inventory result |
| --- | --- |
| Web routing | 175 entries / 155 distinct path patterns; includes groups, redirects and index routes, not 175 independent screens |
| Public migration | 20 explicit public/session entry paths plus the catch-all; page-level session checks still need preservation |
| Mobile routing | 159 route files, 8 layouts, 1 support file under the app directory |
| Skill catalogue | 54 entries across two role catalogues; 27 distinct codes |
| Source baseline | 677 files with SHA-256 hashes; scope and exclusions described below |
| API evidence | 482 literal endpoint references, including repetitions; not a count of unique backend endpoints |
| Runtime verification | Not performed; dependencies, backend source and environment configuration are not installed/present in this copy |

These are static findings. A screen, endpoint reference or permission check in source is evidence of an implementation, not proof that the production journey works. No live accounts, payments, messages or production data were used.

## Review files

- [Web routes and inherited route guards](inventory/web-routes.csv)
- [Mobile routes, layouts and implementation imports](inventory/mobile-routes.csv)
- [Existing skills and certificate flags](inventory/skills.csv)
- [API reference locations](inventory/api-references.csv)
- [Query parameters used by existing journeys](inventory/query-parameters.csv)
- [Source file hashes, sizes and backup candidates](inventory/source-baseline.csv)
- [Machine-readable counts and largest files](inventory/summary.json)

The CSV files open in spreadsheet applications. Paths in them are relative to the application root. Web line numbers point into [main.tsx](../../frontend_web/src/main.tsx). Mobile filenames point into Expo's route tree. Route guards are not a complete permission model: also inspect page logic, selected workspace, admin assignment and backend enforcement.

## Confirmed brand and platform decisions

| Identity | Approved colour | Treatment |
| --- | --- | --- |
| Pharmacy owner | Purple `#7A2DFF` | Owner and management workspace accent |
| Pharmacist / locum | Blue `#1A73E8` | Pharmacist persona accent |
| Other staff | Cyan `#00D4E6` | Assistant, technician and other staff persona accent |
| Explorer | Magenta `#FF2DB2` | Exploration and opportunity-seeking persona accent |
| Shared brand | Navy `#0B0F2B`, white | Shared navigation, text and surfaces |

Written name: **ChemistTasker**. Rx remains a visual logo detail. Direction: bold and colourful with readable operational surfaces. Typeface planned: DM Sans. Persona colour must not replace payment, error, verification, leave or shift-status meanings.

Canva and image generation are available when useful for Step 2 assets. No design assets were generated during this inventory. Professional skill icons will be reusable vectors with text labels and separate certificate-status indicators.

## Feature preservation matrix

All acceptance checks below are **pending runtime verification**. They define the checks required when each replacement is implemented. Existing availability and permissions must be retained; a feature listed here is not automatically granted to every persona.

| ID | Feature / source evidence | Preserve and verify | Implementation step |
| --- | --- | --- | --- |
| F01 | Public homepage, pricing, organisation pricing, legal and support/contact pages/components | Content, pricing data source, working CTAs, contact submission, policy URLs and account-deletion instructions/actions | 4–5 |
| F02 | Public job board, shared shift page, public talent board, public organisation page | Filters, pagination, empty/error states, shared token handling, public visibility, sign-in/apply handoff and organisation slug links | 4–5 |
| F03 | Web auth pages; mobile login/register/OTP routes; AuthContext on both platforms | Four-role registration, consent/reCAPTCHA where used, referral parameters, duplicate email feedback, OTP/resend, recovery, session persistence, remember-me, refresh and logout | 5, 9 |
| F04 | Public membership/referee routes and mobile checkout return | Valid/expired links, context retained through login, referee response/rejection, checkout return and app deep-link behaviour | 5, 9 |
| F05 | Role onboarding directories and mobile profile tabs | Basic information, identity, bio, skills, regulatory details, payment/rate information and referees where present; uploads, progress, verification gates and unsaved-change protection | 6, 9 |
| F06 | Owner setup pages and owner onboarding | Claim/setup steps, required pharmacy setup, organisation bypass and correct post-setup destination | 6–7, 9 |
| F07 | App.tsx, ProtectedRoute, WorkspaceContext, admin scope and mobile root/role layouts | Personal vs admin persona, internal vs platform workspace, selected pharmacy, organisation memberships, verification redirects and denied access | 3, 5–9 |
| F08 | Owner/staff/organisation/admin overview implementations | Scope-specific counts, activity, actionable links, pending tasks, profile progress, notifications and persona-specific navigation | 6, 9 |
| F09 | PharmacyPage, owner pharmacy components, shared mobile pharmacy screens | Pharmacy add/edit/detail, ownership claims, chain/organisation association, staff/locum lists, applications and delegated admins | 7, 9 |
| F10 | Membership screens, invite components and organisation invite page | Invite links, application approval/rejection, role/employment data, removal and current membership status | 7, 9 |
| F11 | PostShiftPage / PostShiftScreen and their catalogues | Pharmacy/scope selection, role and software requirements, scheduling, rates, templates, direct invitations, submission validation and duplicate-submit protection | 7, 9 |
| F12 | ActiveShiftsPage and EscalationStepper on both platforms | Ordered eligibility, direct/private pre-stage when used, organisation-conditional stages, selected audiences, current stage and escalation action | 7, 9 |
| F13 | ShiftsBoard, active shift hooks and worker/poster detail screens | Interest, rejection, saved items, profile reveal, slot selection, offers, counteroffers, acceptance, cancellation/deletion and ratings where available | 7, 9 |
| F14 | Owner/admin/organisation shift-centre wrappers and worker confirmed/history views | Active/confirmed/history separation, details, assigned worker presentation, legacy route aliases and refresh after actions | 7, 9 |
| F15 | RosterOwnerPage / RosterWorkerPage and mobile calendar/shift views | Existing roster editing/assignment, recurrence, open shifts, leave, cover/swap requests, conflicts and scope filtering; establish exact web/mobile differences in runtime baseline | 8, 9 |
| F16 | SetAvailabilityPage / SetAvailabilityScreen and publish-availability flows | Dates/times, recurrence, radius/location/travel, visibility, availability publishing and profile/Talent Hub synchronisation | 6, 8–9 |
| F17 | PharmacyCalendarPage and shared mobile calendar | Calendar events/tasks and existing recurrence/reminder/completion actions, selected pharmacy, date navigation and notification destinations | 8–9 |
| F18 | Web Invoices directory / shared mobile invoices | Manual/shift-based generation, line items/rates, tax details, preview/PDF, send, list/detail states and existing edit/delete restrictions | 8–9 |
| F19 | Pricing, TopBarActions, owner billing components, shared-core billing functions and mobile subscription routes | Subscription/seats, balances, fulfillment/payment states, penalty actions and checkout returns; backend remains authority for amounts and transitions | 8–9 |
| F20 | Web chat and Hub directories; shared mobile chat/messages/Hub | Direct/group/shift messages, participants, unread/read state, reconnect, posts, polls, comments, reactions, groups and moderation permissions where implemented | 8–9 |
| F21 | Web notification APIs/TopBarActions and mobile notification feature/utilities | Unread counts, mark-read, live delivery, background push and destination resolution for shifts, messages, memberships and calendars | 6, 8–9 |
| F22 | PillsPage and mobile PillsScreen | Balance/history, referral code/actions, rules and reward claims based on API results; do not hardcode reference promotions | 8–9 |
| F23 | TalentBoard directory and shared mobile talent-board | Candidate feed, role/state/engagement filters, availability, pitch create/edit/delete, travel, likes/ratings/contact where permitted and public/private presentation | 4, 6, 9 |
| F24 | SkillsV2, mobile SkillsScreen, skills_catalog.json and TalentCardV2 | All 27 skill codes and certificate flags; icons on actual recorded skills across dashboard, profile, Talent Hub and existing requirements/filters | 2–3, 6, 9 |
| F25 | LearningMaterialsPage and mobile learning screen | Preserve current placeholder/coming-soon status; no course delivery or CPD functionality has been established by this review | 8–9 |
| F26 | Mobile app root and utilities | Secure storage, biometrics, file/image picking, push, SSL pinning, offline UI, error reporting, update checks, deep links and native permission handling | 9 |

Feature sources are linked through the route/import inventories and API evidence. Shared functionality can be a dialog or embedded component rather than a distinct route. Backend enforcement and payment calculations are not certified by this frontend review.

### Escalation contract

The current steppers reference `FULL_PART_TIME → LOCUM_CASUAL → OWNER_CHAIN → ORG_CHAIN → PLATFORM`. Web labels include My Pharmacy, Favourites, Chain, Organization and Chemisttasker. An optional **Direct / Private** stage precedes this display; organisation availability and custom labels affect the displayed sequence.

The newer landing feature map describes selected stores and favourite locums in a different order. The older presentation describes three tiers. Marketing must be reconciled with the actual current audience mapping and backend semantics before publication; do not silently reorder operational tiers to match an illustration.

## Proposed navigation for review

Use consistent names on web and mobile. Keep established URLs as destinations/aliases; changing the visible menu label does not require changing its route. Navigation visibility follows role, capability and active scope, never colour alone.

| Workspace | Primary navigation | Secondary / account destinations |
| --- | --- | --- |
| Public | Platform, For your role, How it works, Find shifts, Talent Hub, Pricing | Login, Register, Contact, Terms, Privacy, Account deletion |
| Owner | Overview, Pharmacies & team, Shift Centre, Calendar, Talent Hub, Messages, Pharmacy Hub | Profile, Billing, Invoices, Pill Rewards, Learning, Notifications, Logout |
| Pharmacist | Overview, Shift Centre, Availability, Talent Hub, Messages, Pharmacy Hub, Calendar | Profile & skills, Memberships, Invoices, Pill Rewards where currently available, Learning, Notifications, Logout |
| Other staff | Same shared structure as pharmacist; role-specific options and permissions retained | Staff profile/regulatory fields remain distinct; do not expose pharmacist-only operations |
| Explorer | Overview, Opportunities, Talent Hub, Messages, Calendar | Profile, Interests, existing mobile availability, Notifications, Learning where currently available, Logout |
| Organisation | Overview, Pharmacies & team, Shift Centre, Calendar, Talent Hub, Messages, Pharmacy Hub | Organisation invitations, Invoices, Billing/rewards where currently available, Learning, Logout |
| Delegated pharmacy admin | Scoped Overview, Pharmacies & team, Shift Centre, Calendar, Messages / Pharmacy Hub as capabilities allow | Selected pharmacy/admin assignment, existing invoices/rewards and account actions; no owner-wide access inferred |

"For your role" initially links to homepage persona content, not an unapproved new product flow. On mobile, use five primary destinations: Home, Shifts/Opportunities, Talent Hub, Messages and More. More exposes every remaining authorised destination; Post Shift remains a prominent management action. This is a proposal for review, not an implemented navigation change.

Internal staff see My Roster and Community Shifts in their shift navigation; platform staff see Public Shifts. Preserve direct route compatibility and additional currently allowed destinations even if absent from a menu. Explorer routes and menus currently differ; inventory coverage takes priority over deleting an apparently hidden screen.

### Public-to-app route ownership

The web CSV records every existing route. Next.js will own the 20 explicit public/session paths plus its catch-all. Protected `/dashboard/...`, `/setup/owner/...`, and `/onboarding/{owner,pharmacist,otherstaff,explorer}` remain in Vite. `/onboarding/referee-reject/...` is a public exception, so the proxy must not route all `/onboarding/*` requests to Vite.

Maintain the existing domain and separate asset namespaces. Preserve password-reset tokens, shared-shift tokens, invitation tokens, referral attribution and intended destinations. Route-level absence of a guard does not imply a page is unrestricted: mobile verification, checkout returns and account actions may require session-aware behaviour.

## Professional skills: coverage and data rules

Source: [skills_catalog.json](../../shared-core/skills_catalog.json). The pharmacist and otherstaff catalogues each currently contain 13 clinical/certificate entries, 9 software entries and 5 expanded-scope entries. They repeat the same 27 codes. This does not establish that every qualification is appropriate to every staff role.

Step 2 must cover every entry in [skills.csv](inventory/skills.csv). Step 3 introduces one presentation registry keyed by stable codes, and Step 6/9 connects it to recorded profile/candidate data. Current candidate types contain `clinicalServices`, `dispenseSoftware`, `expandedScope`, `skills` and `software` string arrays; rendering paths can contain labels rather than codes. Preserve both through explicit catalogue lookup/aliases and retain unknown labels with a neutral fallback. Do not guess a credential from a similar word.

- Each skill receives a representative icon plus readable label; the same skill retains its visual identity across platforms and personas.
- Software badges must remain distinguishable; do not invent vendor logos or imply partnerships.
- Icons indicate the recorded skill, not verified status. Uploaded, missing, pending and verified certificates remain separately represented only when supported by data.
- `VACCINATION` and `VACCINATOR`, and `PDL` and `PI_INSURANCE`, are distinct current codes. Do not merge them during styling.
- Dashboards show the account's recorded skills; management views show candidate/team skills only where existing data and visibility allow it. Missing data produces an honest empty state, not fabricated skills.
- Long labels, duplicate legacy labels, unknown codes, empty skill arrays and inaccessible private profiles need explicit checks.

## Findings and risks to carry into implementation

| ID | Observation and evidence | Consequence / treatment |
| --- | --- | --- |
| R01 | Competing web themes, auth theme, CSS globals and dashboard palette; mobile has separate Paper/template palettes | Consolidate through brand adapters. No global colour find-and-replace: semantic meanings and contrast differ. |
| R02 | Large screens: web PostShiftPage 3,444 lines, PharmacyPage 3,165; mobile PostShiftScreen 2,829 | Split by responsibility behind feature acceptance checks; line count alone does not prove dead code. |
| R03 | `shared-core/src/api.ts` begins with `@ts-nocheck`; API and component paths contain broad `any` usage | Strict compiler settings do not prove end-to-end typing. Introduce typed boundaries with contract checks. |
| R04 | Web/mobile consume copied shared-core archives; inspected packaged API/type sources match loose sources after newline normalisation | Workspace migration removes manual copies; verify exports/build outputs before switching consumers. No functional drift established in compared files. |
| R05 | Backup/temp files and duplicate-looking mobile hook directories exist | Cleanup candidates only. Route wrappers, platform-specific files and legacy aliases are not automatically redundant. |
| R06 | Web learning is a heading-only component; mobile pharmacist/otherstaff learning shows Coming Soon | Preserve and redesign the honest placeholder. Reference claims do not authorise inventing a working learning system. |
| R07 | Mobile `app/admin/pharmacies/index.tsx` exports PharmacyOverviewContainer, where `scopedPharmacyId` is hardcoded null | Priority scoping risk for runtime QA. Inspect layout, endpoint filtering and backend permissions before declaring a vulnerability or applying a fix. |
| R08 | Mobile Explorer BasicInfo has STUDENT, JUNIOR, CAREER_SWITCHER; user-requested brand grouping places juniors in Other Staff | Keep existing stored roles for now. Review intended onboarding/presentation; do not silently migrate accounts or qualifications. |
| R09 | Catalogue duplicates clinical/expanded-scope options for pharmacist and otherstaff | Confirm permitted presentation from existing onboarding/backend rules. An icon rollout cannot grant clinical eligibility. |
| R10 | Next.js server execution cannot use mutable global authenticated shared-core configuration safely | Use request-isolated server API clients; browser/native adapters retain platform-specific session behaviour. |
| R11 | Current public SEO is set from client effects; shared links can use tokens in canonical URLs | Move public metadata server-side. Token-bearing/session pages remain non-indexable and outside sitemaps. Preserve authorised access. |
| R12 | Missing dependencies/env/backend, no existing test/spec files found in inspected source paths; shared-core test script alone is not test coverage | Establish executable baselines in implementation. Mocked tests cannot certify real billing, messaging, push or permissions. |
| R13 | Desktop landing reference contains `#` links and differing escalation descriptions; historical PDFs include promotions/statistics/guarantees | Wire each actual CTA and substantiate public claims; no dummy successful actions or unsupported product claims. |
| R14 | Web Explorer includes a learning placeholder route; mobile Explorer has no corresponding learning route file | Record platform gap; do not claim existing parity. Review whether to add the matching placeholder during mobile rebuild. |
| R15 | Expo app directory contains `_context.tsx` alongside route files | Review routing conventions/reachability before relocating it; inventory flags this support file separately from screens. |

These observations were not fixed in Step 1. The findings distinguish source-confirmed conditions from suspected runtime issues.

## Acceptance checklist for the rebuild

- [ ] Every route, redirect and native destination is migrated or retained with recorded acceptance evidence.
- [ ] Every F01–F26 journey is checked for the applicable personas and organisation/admin scopes.
- [ ] Role switching, selected pharmacy and internal/platform scope retain correct data and permissions.
- [ ] Public login/app handoff preserves session, referral and invitation context; invalid/expired links fail clearly.
- [ ] All 27 skill codes have consistent labelled icons; certificate status is independent; legacy/unknown labels are retained safely.
- [ ] Matching profile skills appear consistently on dashboard, Talent Hub and mobile, subject to existing visibility.
- [ ] Direct/private and conditional escalation audiences remain correct; landing explanation matches verified behaviour.
- [ ] Shift, roster, invoice and payment transitions retain existing business contracts and guard against repeated submissions.
- [ ] Messages, notifications, uploads, reconnect, native permissions, biometrics and app updates are verified on supported platforms.
- [ ] Keyboard/screen-reader use, touch targets, text scaling, contrast, reduced motion and responsive layouts are checked.
- [ ] Public rendered content, metadata, HTTP status, indexing and production performance are verified.
- [ ] No placeholder or reference-only feature is represented as live without implementation evidence.
- [ ] Superseded code is removed only after replacement checks; build/type/feature checks accompany each step.
- [ ] Final staging, rollback instructions and documented remaining limitations are reviewed before release.

## Review requested before Step 2

1. Confirm the feature matrix and proposed navigation cover the workflows you want retained.
2. Review the Junior/Explorer classification discrepancy. Default: preserve stored roles and discuss presentation before changing onboarding.
3. Confirm Learning remains an honestly labelled upcoming feature; building a course system would be separate functionality.

After your review, Step 2 produces the working brand showcase and full skill-icon catalogue. Steps 3–10 retain their previously agreed review gates. No implementation beyond Step 1 is authorised by completion of this document alone.

## Reproducing and checking the inventory

Run `python scripts/inventory_frontend.py` from the application root. It writes only the inventory CSV/JSON files. It scans literal web route objects, Expo `.tsx` files, selected source extensions, source API strings and catalogue entries. It does not execute application code, resolve all dynamic imports, verify backend permissions or prove that every string reference is reachable. Baseline hashes cover inspected code/text, not secrets, environment files, dependencies, generated bundles or all binary assets; retain the supplied folder as the original snapshot.

The web route parser is purpose-built for the current literal `main.tsx` structure. Regeneration must be reviewed when routing architecture changes. Duplicate URL rows are expected for parent/index routes. API references include constants and call sites, exclude commented full-line references, and are not a backend schema. Runtime test results remain unclaimed.
