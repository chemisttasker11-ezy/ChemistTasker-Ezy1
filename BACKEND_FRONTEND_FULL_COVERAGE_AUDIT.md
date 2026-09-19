# ChemistTasker Backend ↔ Frontend Feature Coverage Audit

**Repository:** `chemisttasker11-ezy/ChemistTasker-Ezy1`  
**Audited branch:** `main`  
**Tree snapshot:** `8beeb2bc0fb54ca28844690d0ef627fca3903a85`  
**Audit date:** 2026-09-20  
**Scope:** Django backend, shared-core contracts/endpoints, Vite authenticated web, Next public web under `frontend_web/landing_next`, and Expo/React Native mobile.

---

## 1. Purpose

This document answers four questions for every major ChemistTasker domain:

1. Does a real backend model/service/API workflow exist?
2. Is that backend logic exposed through the shared-core contract layer?
3. Is the full workflow represented in web UI?
4. Is the full workflow represented in mobile UI?

The goal is not to count files. The goal is to determine whether a feature is complete **from persistence and business rules through API endpoints and user-facing workflow**, and to identify where logic exists only on one side.

### Status legend

| Status | Meaning |
|---|---|
| **FULL / STRONG** | Backend, endpoints and primary user workflows exist. Remaining work is mostly hardening, UX parity, tests or edge cases. |
| **PARTIAL** | Significant logic exists, but one or more important workflow stages are missing or only exposed on one client. |
| **BACKEND-AHEAD** | Backend capability exists but is not yet fully surfaced in web/mobile. |
| **FRONTEND-AHEAD / CONTRACT RISK** | UI exists but backend/shared-core parity needs verification or consolidation. |
| **FOUNDATION ONLY** | Skeleton or placeholder exists; not an end-to-end feature yet. |

> Important: this is a source-level coverage audit, not a production runtime certification. “FULL” means the feature is materially implemented end-to-end in source; release readiness still requires endpoint integration tests, migrations, permission tests and client E2E tests.

---

# 2. Architecture summary

ChemistTasker currently has four important application layers:

- **Django backend** under `backend/`.
- **Shared-core TypeScript package** under `shared-core/`, containing endpoint constants, contracts, transport and common domain types.
- **Authenticated Vite web application** under `frontend_web/src/`.
- **Public/SEO Next application** under `frontend_web/landing_next/`.
- **Expo / React Native mobile application** under `frontend_mobile/`.

This split is legitimate and should be preserved. The audit does **not** recommend rewriting the authenticated Vite dashboard in Next. Next is already being used for the public-facing/SEO content and marketplace surfaces, while Vite owns authenticated operational workflows.

The backend itself is also split by domain:

- `users`
- `client_profile`
- `workforce`
- `worker_finance`
- `marketplace`
- `ethical_marketplace`
- `public_hub`
- `billing`
- `core`

A major architectural observation is that `client_profile` remains a very large compatibility/domain aggregation layer. Newer logic is progressively separated into `workforce`, `worker_finance`, `marketplace`, `ethical_marketplace`, and `public_hub`, but a substantial amount of shift, roster, attendance, chat, calendar, membership and dashboard behavior still lives inside `client_profile`.

---

# 3. Executive coverage matrix

| Domain | Backend | Shared Core | Web | Mobile | Overall |
|---|---|---|---|---|---|
| Authentication / OTP / password reset | Strong | Strong | Strong | Strong | **FULL / STRONG** |
| Onboarding / profiles | Strong | Strong | Strong | Strong | **FULL / STRONG** |
| Pharmacy / organization management | Strong | Strong | Strong | Strong | **FULL / STRONG** |
| Membership / staff applications | Strong | Strong | Strong | Strong | **FULL, hardening required** |
| Employment engagement / Award rates | Strong | Strong | Strong | Partial | **PARTIAL** |
| Payroll configuration | Strong | Strong | Partial | Partial | **BACKEND-AHEAD** |
| Shift posting / marketplace | Strong | Strong | Strong | Strong | **FULL / STRONG** |
| Active / confirmed / history shifts | Strong | Strong | Strong | Strong | **FULL / STRONG** |
| Counter-offers / engagement routing | Strong | Strong | Strong | Strong | **FULL, complex** |
| Public job board / shared shifts | Strong | Strong | Strong | N/A / limited | **FULL for web use case** |
| Availability | Strong | Strong | Strong | Strong | **FULL / STRONG** |
| Talent board | Strong | Strong | Strong | Strong | **FULL / STRONG** |
| Roster | Strong, duplicated generations | Strong | Strong | Partial | **PARTIAL parity** |
| Attendance / kiosk | Very strong | Strong | Very strong | Partial | **WEB-STRONG, MOBILE-PARTIAL** |
| Timesheets | Strong | Strong | Strong | Strong | **FULL / STRONG** |
| Leave / my hours | Strong | Strong | Strong | Strong | **FULL / STRONG** |
| Invoice core | Strong | Strong | Strong | Strong | **FULL / STRONG** |
| Customers / invoice items | Strong | Strong | Partial | Partial | **PARTIAL** |
| Received invoices | Strong | Strong | Weak / unclear | Weak / unclear | **BACKEND-AHEAD** |
| Expenses / receipts | Strong | Strong | Missing dedicated UX | Missing dedicated UX | **BACKEND-AHEAD** |
| BAS worksheet | Strong | Strong | Missing dedicated UX | Missing dedicated UX | **BACKEND-AHEAD** |
| Billing / subscriptions | Strong | Partial/route based | Strong owner web | Limited | **PARTIAL parity** |
| Chat / messaging | Strong | Strong | Strong | Strong | **FULL / STRONG** |
| Notifications / push | Strong | Strong | Strong | Strong | **FULL / STRONG** |
| Calendar / work notes | Strong | Strong | Strong | Strong calendar | **FULL, notes parity check** |
| Pharmacy hub / community | Strong | Strong | Strong | Strong | **FULL / STRONG** |
| Blog / public articles | Strong | Strong | Strong in Next | Not required / absent | **FULL for public web** |
| General marketplace | Strong | Strong | Strong in Next | No equivalent full marketplace | **WEB-FIRST / MOBILE GAP** |
| Ethical marketplace | Strong | Strong | Strong in Next | No equivalent full workspace | **WEB-FIRST / MOBILE GAP** |
| Learning | Content/UI present | Mixed | Strong public + dashboard | Present | **PARTIAL backend formalisation** |
| Ratings / rewards | Strong | Strong | Partial UI | Partial UI | **PARTIAL UX coverage** |
| Admin operational tools | Strong | N/A | Strong | Strong role routes | **FULL, maintainability issue** |

---

# 4. Authentication, identity and account lifecycle

## Backend

The backend exposes:

- login
- registration
- JWT refresh
- OTP verification/resend
- mobile OTP request/verify/resend
- password reset and reset confirmation
- account deletion
- contact support
- role-specific onboarding endpoints

Shared-core already centralises these routes in `API_ENDPOINTS`.

## Web

Web includes:

- OTP verification
- password reset request and reset
- account deletion
- role-specific onboarding for owner, pharmacist, other staff and explorer
- referee flows

## Mobile

Mobile includes:

- login
- registration
- OTP verification
- mobile verification
- password reset
- owner onboarding
- pharmacist onboarding
- role-profile screens

## Assessment

**Status: FULL / STRONG**

### Strengthen next

1. Add one contract test that enumerates every auth endpoint from shared-core and confirms Django resolves it.
2. Ensure mobile OTP and web OTP account state transitions converge on exactly the same verified-user state.
3. Add end-to-end tests for:
   - unverified account → verified
   - reset-password token expiry
   - account deletion with dependent records
   - role onboarding resume after interruption
4. Continue eliminating role-specific duplicated form logic where the schemas are the same.

---

# 5. Pharmacy, organization, ownership and claims

## Backend

`client_profile` exposes routers for:

- organizations
- chains
- pharmacies
- pharmacy claims
- pharmacy admins
- memberships
- membership invite links
- membership applications

The backend also has owner/organization dashboard endpoints and pharmacy claim workflows.

## Web

Vite includes:

- organization create and overview
- pharmacy list/detail/edit behavior
- pharmacy claim panels
- owner pharmacy detail
- pharmacy admins
- staff invitation and management

## Mobile

Mobile includes:

- organization pharmacy routes
- pharmacy add/edit/detail
- staff and locum routes
- owner pharmacy
- role-specific pharmacy administration

## Assessment

**Status: FULL / STRONG**

The primary issue is not missing surface area. It is **source-of-truth discipline**: memberships, organization permissions, pharmacy admin access and worker identity must remain cleanly separated.

### Strengthen next

- Add explicit domain invariants:
  - one worker account per canonical email identity
  - one active pharmacy membership per worker/pharmacy/role tuple unless the product explicitly permits multiple engagements
  - pharmacy-admin privilege must not be inferred solely from membership
- Add DB-level constraints wherever possible instead of relying only on serializer/view checks.
- Keep organization-level permissions and pharmacy-level employment/membership separate.
- Add deletion/deactivation semantics instead of hard-deleting employment history.

---

# 6. Membership applications, existing staff, invited staff and favourite staff

## Backend

This area is materially implemented.

Evidence includes:

- `MembershipViewSet`
- `MembershipInviteLinkViewSet`
- `MembershipApplicationViewSet`
- public magic membership info/apply endpoints
- DOB migration
- payroll opt-in/review migration
- integrity tests
- submitted / approved / rejected / review-updated emails
- acceptance/rejection workflow

There is also a dedicated frontend application page and review tooling.

## Web

Web includes:

- `MembershipApplyPage.tsx`
- `ManageMembershipsPage.tsx`
- owner membership application panel
- membership review dialog
- invitation/staff manager UI

## Mobile

Mobile includes:

- pharmacist memberships
- other-staff memberships
- shared membership manager
- membership application review panel/dialog

## Assessment

**Status: FULL, but business-rule hardening is still important**

The UI exists on both clients. The remaining risk is not absence of pages; it is preventing duplicate or contradictory records.

### Required strengthening

1. **Canonical source of truth**
   - A staff member should resolve to an actual platform worker identity when TFN payroll/employment behavior requires it.
   - Anonymous magic-link application can exist as pending application data, but approval into an employment-backed staff relationship must link to the worker account.

2. **Duplicate protection**
   - Normalize email before comparison.
   - Normalize phone to canonical E.164-like storage.
   - Protect against duplicate pending applications.
   - Protect against an application that duplicates an already-active membership.
   - Protect against owner-created staff + applicant-created staff becoming parallel people.

3. **Immutable identity fields during review**
   - Email, phone and DOB should not silently change during manager review.
   - If identity corrections are required, use a separate verified correction workflow.

4. **Owner edits**
   - Preserve a before/after review snapshot.
   - Acceptance notification must clearly show owner/admin modifications to editable employment fields.

5. **Rejection**
   - Persist rejection reason/category internally.
   - Notify applicant.
   - Do not allow stale acceptance of a rejected version without reopening.

6. **Favourite staff**
   - The codebase should treat “favourite” as a relationship/visibility/routing preference, not a duplicate worker record.
   - Add an explicit integrity test proving favourite-staff operations reference existing worker/membership identity rather than copying staff profile data.

---

# 7. EmploymentEngagement, Award classification and agreed rates

## Backend

The newer `workforce` domain is substantial:

- `EmploymentEngagement` persistence
- employment engagement service
- employment terms logic
- award rate calculation
- award preview endpoint
- award snapshot migration
- ordinary-hours pattern migration
- payroll configuration
- work settings
- engagement routing in `client_profile/engagement_routing.py`

Endpoints include:

- `work-settings/`
- `payroll-configuration/`
- `employment-engagements/`
- `employment-engagements/award-preview/`
- `employment-engagements/<public_id>/`

## Web

Web has:

- `EmploymentEngagementsPanel.tsx`
- workforce settings
- timesheets/leave/hours components
- shift engagement terms dialog

## Mobile

Mobile has shift engagement terms UI and workforce settings/timesheet routes, but there is no equally obvious full employment-engagement administration workflow matching the web panel.

## Assessment

**Status: PARTIAL**

The backend is ahead of the mobile UX. Web is considerably closer.

### Required strengthening

1. Make `EmploymentEngagement` the durable source for:
   - employment type
   - Award classification
   - applicable Award snapshot
   - agreed weekday rate
   - Saturday rate
   - Sunday rate
   - public holiday rate
   - evening/late-night rate when applicable
   - ordinary-hours pattern
   - effective dates

2. Preserve **historical snapshots**. Do not recalculate old pays using today’s Award table.

3. Separate:
   - **Award floor**
   - **agreed rate**
   - **shift-specific bonus**
   - **penalty/loading result**

4. TFN pharmacist logic should not be represented merely as a generic casual worker rate. The engagement needs a clear, auditable rule describing the agreed above-Award arrangement and applicable super/tax/payroll treatment.

5. Other staff should derive Award floor from verified worker classification:
   - assistant levels
   - intern stage
   - pharmacy student year
   - other supported classifications

6. Add equivalent owner/admin mobile engagement management or explicitly declare the workflow web-only and make mobile read-only.

---

# 8. Payroll configuration

## Backend

Backend contains:

- pharmacy payroll configuration endpoint
- membership work settings
- employment engagement logic
- payroll activation / invoice source snapshot migration
- timesheet calculation and locking mechanics

## Frontend

Web and mobile expose pieces of workforce configuration, but there is no obvious complete payroll operational product equivalent to a full payroll run lifecycle.

## Assessment

**Status: BACKEND-AHEAD**

The system has the right employment/time foundations, but “payroll enabled” is not yet the same thing as a finished payroll product.

### Missing product logic

A complete payroll area still needs, at minimum:

1. pay-run periods
2. inclusion/exclusion of approved timesheets
3. gross calculation
4. penalty/loading breakdown
5. super contribution calculation
6. tax withholding integration or export strategy
7. allowances/reimbursements
8. adjustments
9. finalisation/locking
10. payslip generation
11. export/accounting integration
12. audit trail
13. reversal/correction process

If ChemistTasker is intentionally not becoming a payroll processor, the frontend must instead clearly present payroll-ready timesheet/export outputs and define the boundary.

---

# 9. Shift marketplace: posting, community, public and engagement

## Backend

This is one of the deepest domains in the repository.

Backend exposes:

- community shifts
- public shifts
- shift detail
- active/confirmed/history
- public job board
- shared shift view
- interest
- rejection
- saved shift
- offers
- counter-offer logic
- escalation
- profile reveal
- accept user
- member status
- share links
- ratings
- engagement routing
- email notifications for most shift lifecycle events

## Web

Web has extensive workflows:

- post shift
- shift centre
- community/public/confirmed/history views
- active-shift candidate review
- escalation UI
- counter-offers
- engagement terms
- shared shift landing page
- public job board
- worker shift board
- owner/admin role wrappers

## Mobile

Mobile is similarly extensive:

- owner/admin/organization post-shift
- pharmacist/other-staff/explorer shift boards
- shift detail
- applications
- shared shift components
- counter-offer dialogs
- engagement terms

## Assessment

**Status: FULL / STRONG**

### Remaining risk

This area is complex enough that completeness is mostly a **state-machine consistency** problem.

### Strengthen next

- Formalize lifecycle states and valid transitions in one backend state machine.
- Do not allow clients to infer transition legality.
- Ensure community → public escalation is idempotent.
- Ensure payment/finalization logic cannot accept multiple workers for an exclusive slot.
- Ensure counter-offer acceptance invalidates competing offers consistently.
- Snapshot engagement terms when shift acceptance occurs.
- Add concurrency tests for two workers accepting/claiming simultaneously.
- Add contract tests ensuring Vite and mobile call the same shared-core endpoints.

---

# 10. Active, confirmed and history shifts

## Backend

Dedicated viewsets exist for:

- active
- confirmed
- history
- worker confirmed
- worker history

## Web

Strong dedicated surfaces and refactored components exist.

## Mobile

Role-specific and shared implementations exist.

## Assessment

**Status: FULL / STRONG**

### Strengthen next

- Continue deleting obsolete `.backup` files after verification.
- Keep active-shift business decisions in backend/service code rather than component helpers.
- Add pagination and stable sorting contracts if datasets can grow significantly.
- Ensure history is immutable/auditable after financial settlement.

---

# 11. Availability and Talent Board

## Backend

User availability is a first-class endpoint.

The shift system also contains availability-match email behavior.

## Web

- Set availability
- Talent Board
- radius/location UI
- filtering
- pitch dialog

## Mobile

Strong parity:

- availability routes
- publish availability
- map/radius components
- talent board across roles

## Assessment

**Status: FULL / STRONG**

### Strengthen next

- Backend should own geospatial eligibility logic.
- Explicitly store availability timezone.
- Ensure recurring availability and one-off exceptions cannot overlap ambiguously.
- Add privacy controls for what talent-board viewers can see.
- Make distance filtering deterministic between web and mobile.

---

# 12. Roster

## Backend

There are effectively two generations of roster capability:

### Legacy/current client_profile roster
- roster owner
- roster worker
- roster shift management
- create/assign
- open shifts
- escalation
- V2 attendance roster period
- validate
- publish/unpublish/archive
- acknowledgement
- copy week
- templates
- bulk edit
- swap/cover
- manager approvals
- release/reject
- audit list

### Newer workforce roster
- roster workspace
- validate revision
- publish revision
- coverage requirements

The backend has extensive roster and attendance tests.

## Web

Web includes:

- owner roster
- worker roster
- roster dialogs/models
- workforce coverage
- safe publish/review UI

## Mobile

Mobile has roster-related shift views but does not show the same breadth of manager roster workspace/publish tooling as the Vite web client.

## Assessment

**Status: PARTIAL parity, backend strong**

### Main concern

There are overlapping roster APIs and concepts. This is a migration/compatibility risk.

### Required strengthening

1. Declare which API is authoritative:
   - `client_profile/attendance/roster/*`
   - `client_profile/workforce/roster/*`
   - legacy `roster-owner` / `roster-worker`

2. Write a route ownership matrix and mark:
   - current
   - compatibility
   - deprecated
   - internal only

3. New frontend work should target the authoritative generation only.

4. Add mobile manager roster parity if managers are expected to build/publish rosters on mobile.

5. Preserve:
   - publish revision
   - acknowledgement
   - audit
   - swap/replacement approval
   - coverage validation
   as backend-enforced workflows.

---

# 13. Attendance and kiosk

## Backend

Attendance is among the best-tested domains.

Capabilities include:

- worker status
- clock in
- break start/end
- clock out
- PIN update
- manager pending
- manager approve/reject/correct
- session timeline
- kiosk activation
- pairing code
- QR
- PIN clock
- offline sync
- kiosk config
- worker enrolment
- PIN status/setup
- active staff
- break actions

There are dedicated tests for:

- API
- approvals
- credentials
- eligibility
- transitions
- offline protocol
- pairing
- QR/PIN security
- release blockers
- breaks
- pharmacy PIN scope
- provisional approval safety

## Web

Vite has:

- kiosk activation
- kiosk page
- break dialog
- manager attendance review
- worker attendance

## Mobile

Mobile has an attendance PIN route and kiosk linking, but there is not the same full worker/manager attendance UI surface visible in the mobile tree.

## Assessment

**Status: WEB-STRONG, MOBILE-PARTIAL**

### Strengthen next

- Add/confirm native worker clock-in/out experience if that is intended.
- Add/confirm manager attendance review on mobile if managers need it.
- Offline kiosk sync must remain server-idempotent.
- Device pairing must be revocable.
- PIN attempts must remain throttled and pharmacy-scoped.
- Never trust client timestamps without server-side tolerance and audit metadata.

---

# 14. Timesheets, hours and leave

## Backend

`workforce` contains a substantial timesheet domain:

- periods
- summary
- recalculate
- lock
- list/detail
- missing punch
- submit
- approve time
- reopen
- comments
- check decisions
- my hours
- leave list/create
- leave decision

## Web

Web features include:

- timesheets page
- timesheet detail drawer
- health banners
- manager leave
- my leave
- my hours

## Mobile

Mobile includes:

- workforce timesheets
- my hours
- my leave
- workforce settings

## Assessment

**Status: FULL / STRONG**

### Strengthen next

- Prevent pay-affecting edits after period lock except through an auditable reopen/correction workflow.
- Snapshot Award/employment rules used in each timesheet calculation.
- Add variance explanation when recalculation changes monetary results.
- Ensure attendance corrections propagate deterministically to timesheets.
- Add explicit “payroll consumed” state if a period has been exported/processed.

---

# 15. Worker finance and invoices

## Backend

`worker_finance` is broader than the older invoice UI.

Endpoints include:

- customers
- items
- invoices
- received invoices
- expenses
- receipt download
- shift hours
- BAS worksheet

The legacy invoice detail/PDF/send endpoints remain routed for compatibility.

Backend includes:

- calculations
- documents
- services
- serializers
- API tests
- finance models
- invoice revision migrations

## Web

Vite includes:

- finance workspace
- invoice composer
- invoice detail
- invoice generate
- invoice manage
- stats

There are still legacy invoice components retained.

## Mobile

Mobile includes:

- shared finance workspace
- invoice editor
- invoice detail
- invoice generate
- invoice list
- stats
- role wrappers

## Assessment

**Status: Invoice core FULL / STRONG; broader finance PARTIAL**

### Missing / underexposed frontend capability

The backend already supports functionality that is not clearly represented as complete dedicated workflows in web/mobile:

1. **customer management**
   - dedicated customer list/create/edit
   - external pharmacy/customer records
   - ABN validation flow
   - address/contact defaults

2. **item catalogue**
   - reusable line items
   - GST behavior
   - super item
   - transport
   - accommodation
   - other reusable worker items

3. **received invoices**
   - inbox/list
   - status
   - matching/reconciliation behavior

4. **expenses**
   - create/edit/category
   - receipt upload/view/download
   - GST treatment
   - business/private flags
   - linking to customer/shift where relevant

5. **BAS**
   - dedicated BAS worksheet UI
   - date period selector
   - GST collected
   - GST paid/credits
   - source drill-down
   - adjustments
   - export/print

### Important finance rules to strengthen

- Invoice totals must be calculated server-side as authoritative.
- GST-inclusive/exclusive semantics need one canonical representation.
- Superannuation on contractor invoices must be modeled deliberately, not as generic GST-bearing revenue.
- Separate-super invoice should reference the parent invoice and avoid double counting.
- Duplicating an invoice should generate new identity/revision metadata.
- Sent/finalized invoice revisions need immutable snapshots.
- External shift invoice generation should not depend on an internal ChemistTasker shift record.
- Receipt storage must use authenticated media access.

---

# 16. BAS

## Backend

A `bas-worksheet/` endpoint already exists in `worker_finance`.

## Web / Mobile

No dedicated BAS page or BAS-named user workflow is visible in either frontend tree.

## Assessment

**Status: BACKEND-AHEAD**

### Build next

Create a finance/BAS workspace consuming the existing backend worksheet rather than reimplementing accounting calculations in React.

Required UX:

- reporting period
- sales/GST
- purchases/GST credits
- expense source breakdown
- invoice source breakdown
- adjustments
- warnings for missing GST treatment
- export/print
- link back to underlying records

The backend should expose calculation provenance so every BAS number can be traced to source rows.

---

# 17. Expenses and receipts

## Backend

Backend exposes `ExpenseViewSet` and receipt download.

## Web / Mobile

No dedicated expense/receipt workflow is visible.

## Assessment

**Status: BACKEND-AHEAD**

### Build next

- Expense list
- Add expense
- Receipt upload/camera capture
- Edit
- Category
- GST treatment
- Supplier
- date
- payment method
- business-use percentage if supported
- attachment preview
- export
- delete/archive rules
- link to BAS worksheet

Mobile should be prioritised for receipt capture because camera input is a natural native workflow.

---

# 18. Billing and subscriptions

## Backend

Dedicated `billing` app exists with:

- models
- views
- Stripe webhook event persistence
- tests
- URLs

## Web

Owner billing page exists.

## Mobile

No equally obvious full billing management flow.

## Assessment

**Status: PARTIAL parity**

### Strengthen next

- Treat webhook event handling as idempotent.
- Separate subscription entitlement state from raw Stripe event state.
- Add owner mobile billing only if product requirements demand it; otherwise use a secure web handoff.
- Add explicit plan/entitlement contract into shared-core rather than letting clients infer capability from billing state.

---

# 19. Chat and messaging

## Backend

`client_profile` exposes:

- rooms/conversations
- messages
- memberships
- DM/group creation actions
- read tracking
- chat participant behavior

There is also websocket consumer code.

## Web

Full chat UI exists:

- sidebar
- conversations
- message bubbles
- new chat modal

## Mobile

Full shared chat implementation exists with:

- chat pages across roles
- shared chat
- group management
- new chat/group
- active-room state
- routing utilities

## Assessment

**Status: FULL / STRONG**

### Strengthen next

- Confirm server-side membership/room authorization on every message read/write.
- Paginate message history.
- Add attachment scanning/limits if attachments are enabled.
- Keep unread counts server-derived.
- Test websocket reconnect/resume.

---

# 20. Notifications and push

## Backend

Notification router exists and shift notification services/emails are substantial.

## Mobile

Mobile has:

- notifications screen
- push notification registration
- notification navigation routing
- role-specific notification routes

## Web

Notifications are represented through client-profile APIs and dashboard behavior.

## Assessment

**Status: FULL / STRONG**

### Strengthen next

- Standardize notification payload schema.
- Store a stable `type` + `entity_id` + route intent.
- Avoid clients parsing human-readable message text to determine navigation.
- Add dedupe keys for repeated background tasks.
- Expire device tokens safely.

---

# 21. Calendar and work notes

## Backend

Backend has:

- calendar event viewset
- calendar feed
- work note viewset
- serializers
- tasks

## Web

Web includes a pharmacy calendar page and dialogs.

## Mobile

Role-specific calendar routes and shared calendar model exist.

## Assessment

**Status: FULL for calendar; work-note UX parity should be checked**

### Strengthen next

- Make timezone explicit.
- Define event source precedence: shift, roster, leave, manual event, work note.
- Do not duplicate immutable shift/roster events as independent editable calendar rows unless they are linked.
- Ensure work notes have clear access scope and retention.

---

# 22. Pharmacy Hub / internal community

## Backend

Two related community/content areas exist:

- authenticated `client_profile/hub/*`
- public/community `public_hub/*`

Authenticated hub supports:

- context
- groups
- posts
- comments
- reactions
- polls
- pharmacy profiles
- organization profiles
- pin/unpin

## Web

Vite has a large Hub UI with feed, groups, posts, polls, profile modals and sidebar.

## Mobile

Mobile has shared Hub screen, post composer, poll composer and role wrappers.

## Assessment

**Status: FULL / STRONG**

### Strengthen next

The main architectural risk is confusion between **authenticated pharmacy hub** and **public content/community hub**.

Document explicitly:

- who can see each domain
- which data is public
- which attachments are protected
- moderation/reporting ownership
- SEO indexing rules

---

# 23. Blog / public editorial articles

## Backend

`public_hub` exposes:

- article list
- article detail
- comments
- reactions
- comment reporting
- editorial content
- content media
- sitemap support

## Web

The public Next application contains:

- `frontend_web/landing_next/app/(hub)/blog/page.tsx`
- `frontend_web/landing_next/app/(hub)/blog/[slug]/page.tsx`
- article card/detail components

This is the correct location for SEO/public editorial content.

## Mobile

No full blog-specific mobile surface is visible, which is acceptable if the blog is intentionally public-web-first.

## Assessment

**Status: FULL for intended public web workflow**

### Strengthen next

- Confirm CMS/editorial publishing lifecycle: draft → review → publish → unpublish/archive.
- Ensure slug history/redirect behavior after slug changes.
- Ensure moderation for comments.
- Add canonical URLs and structured data.
- Avoid duplicating the public blog inside the authenticated Vite application.

---

# 24. General marketplace

## Backend

Dedicated `marketplace` app is substantial.

Endpoints include:

- categories
- listings
- listing detail
- access
- listing options
- my listings/dashboard
- eligibility
- audience
- images
- enquiries
- internal transfers
- listing actions
- exchanges
- exchange messages/actions
- saved listings
- reports
- catalogue lookup

It also includes release/finalisation management commands.

## Web

The Next public application has a complete marketplace route family:

- marketplace home
- items
- item detail
- medicines
- mine
- new
- exchanges
- add-item wizard
- marketplace API/workspace feature

## Mobile

No equivalent full general marketplace module is visible in the mobile tree.

## Assessment

**Status: WEB-FIRST / MOBILE GAP**

### Decision required

Either:

1. Marketplace is intentionally web-only, in which case expose clear mobile deep links/web handoff, or
2. Marketplace is a core mobile feature, in which case native browse/list/create/exchange flows are still missing.

### Strengthen backend

- enforce listing state transitions
- concurrency-safe exchange acceptance
- image ownership/security
- report/moderation process
- catalogue normalization
- eligibility rules server-side

---

# 25. Ethical marketplace

## Backend

Dedicated `ethical_marketplace` app includes:

- pharmacy approval
- grants/revoke
- catalogue
- catalogue lookup
- imports
- import commit
- lots
- reconciliation
- listings
- requests
- transfers
- transfer messages
- transfer documents
- transfer actions

It also has policy, signals, tasks and finalisation tests.

## Web

Next has a dedicated ethical marketplace workspace:

- access
- inventory
- listings
- new listing
- transfers
- ethical workspace feature

## Mobile

No equivalent full ethical marketplace workspace is visible.

## Assessment

**Status: WEB-FIRST / MOBILE GAP**

### Strengthen next

This area handles higher-risk inventory and transfer workflows, so server enforcement is mandatory:

- pharmacy approval before access
- grant expiry/revocation
- immutable transfer audit history
- lot reconciliation
- document access control
- transfer state machine
- no client-side-only eligibility
- explicit handling of recalled/expired/quarantined stock where applicable

---

# 26. Learning

## Web

Public Next has a learning page and Vite has `LearningMaterialsPage.tsx`.

## Mobile

Other-staff learning route exists.

## Backend

There is no equally distinct `learning` backend domain visible. Content may be static/public-content driven.

## Assessment

**Status: PARTIAL backend formalisation**

If learning content is intentionally static/editorial, this is acceptable. If the roadmap requires:

- enrolment
- progress
- completion
- assessments
- certificates
- CPD tracking

then a real learning backend domain is still missing.

---

# 27. Ratings and Pill rewards

## Backend

Routes exist for ratings and pill rewards.

## Frontend

Ratings are consumed in active shift tooling, and organization/mobile pill surfaces exist.

## Assessment

**Status: PARTIAL UX coverage**

### Strengthen next

- Create clear user-facing history/summary if ratings materially affect marketplace trust.
- Define moderation/dispute handling.
- Ensure ratings can only be submitted for eligible completed relationships.
- Define whether Pill rewards are financial, loyalty, gamification or access entitlement; enforce expiry and ledger rules server-side.

---

# 28. Public job board and shared shift links

## Backend

Shared-core exposes:

- public job board
- shared shift view
- share-link generation

## Web

Pages exist:

- `PublicJobBoardPage.tsx`
- `SharedShiftLandingPage.tsx`

## Assessment

**Status: FULL / STRONG**

### Strengthen next

- share-link expiry/revocation
- no leakage of private pharmacy/worker data
- rate/engagement terms clearly labelled
- application/login handoff preserves original shift intent
- SEO indexing policy defined

---

# 29. Admin surfaces

Web and mobile have many admin/owner/organization wrappers around shared functionality.

## Assessment

**Status: FUNCTIONALLY broad, maintainability risk**

The main issue is duplicated role-routing/page wrappers.

### Strengthen next

- Keep thin route adapters.
- Put shared feature UI in `features` or shared role modules.
- Do not copy business rules between admin/owner/organization pages.
- Delete stale `.backup` pages after diff verification.
- Continue splitting very large components such as post-shift, active-shift cards and shift boards.

---

# 30. Shared-core endpoint integrity

The shared-core package is doing valuable work and should become more authoritative.

It contains:

- global endpoint constants
- platform endpoint constants
- workforce contracts
- marketplace contracts
- ethical marketplace contracts
- attendance/roster contracts
- finance types/utilities
- transport/client

## Current concern

There are still two endpoint maps:

- `shared-core/src/constants/endpoints.ts`
- `shared-core/src/constants/platformEndpoints.ts`

This can become another source of drift.

## Recommendation

Create one endpoint ownership convention:

- legacy compatibility routes remain documented but isolated
- new domain routes live in domain-specific endpoint objects
- web/mobile import only from shared-core
- CI resolves every shared-core endpoint against Django URL configuration
- CI fails when a frontend hardcodes a backend API path outside approved transport modules

---

# 31. Highest-priority missing frontend work

## P0 — Finance coverage

1. Expenses and receipts UI on web.
2. Native/mobile receipt capture.
3. BAS worksheet UI.
4. Customer management.
5. Reusable invoice item management.
6. Received-invoice workflow.
7. External-customer invoice creation from scratch.
8. Separate-super invoice UX using backend-safe parent linkage.

## P0 — Employment/payroll completeness

1. Full mobile EmploymentEngagement management or intentional web-only policy.
2. Explicit payroll product boundary.
3. Pay-run/export/payslip lifecycle if ChemistTasker intends to operate payroll.
4. Historical rate/Award snapshot visibility in UI.

## P1 — Roster consolidation

1. Define authoritative roster API generation.
2. Migrate clients away from compatibility endpoints.
3. Mobile manager roster parity if required.

## P1 — Attendance mobile parity

1. Native worker attendance workflow.
2. Native manager review workflow if required.

## P1 — Marketplace mobile strategy

Decide whether general and ethical marketplace are:
- web-first by design, or
- required as native mobile workflows.

Do not build partial duplicate marketplace logic until this product decision is explicit.

---

# 32. Highest-priority backend strengthening

## P0 — State machines and concurrency

Apply explicit transaction-safe transitions to:

- shift claim/acceptance
- counter-offers
- marketplace exchange
- ethical transfer
- roster publish
- attendance corrections
- timesheet lock/reopen
- invoice finalisation/send
- membership approval

## P0 — Identity/source-of-truth constraints

Strengthen:

- membership dedupe
- worker identity linking
- immutable application identifiers
- owner/admin review audit
- employment engagement uniqueness/effective-date overlap

## P0 — Financial immutability

Add/verify:

- invoice revision snapshots
- timesheet calculation snapshots
- Award snapshot
- GST treatment snapshot
- sent-document immutability
- parent/child relation for separate super invoice
- BAS provenance

## P1 — Permission matrix

Build automated permission tests across:

- owner
- organization admin
- pharmacy admin
- pharmacist
- other staff
- explorer
- anonymous/public

Every endpoint should have an explicit expected role matrix.

## P1 — API version/deprecation policy

Because `client_profile` contains legacy and newer route generations, introduce deprecation metadata and prevent new code from extending obsolete route families.

---

# 33. Testing gaps to close

The backend has particularly strong attendance/roster coverage, but coverage should be normalized across domains.

Minimum test layers for every major feature:

1. model constraint tests
2. service/business-rule tests
3. permission tests
4. API contract tests
5. concurrency/idempotency tests
6. shared-core endpoint resolution test
7. web integration test
8. mobile integration test
9. one critical E2E happy path
10. one critical E2E failure/recovery path

Priority E2E scenarios:

- magic membership application → owner review/edit → approval → worker linked → engagement created
- post shift → interest/counter-offer → acceptance → confirmed → attendance → timesheet → invoice
- roster create → validate → publish → acknowledge → attendance
- external invoice → customer/item → send → expense/BAS inclusion
- ethical listing → request → transfer → documents → completion

---

# 34. Technical debt / “AI spaghetti” risk areas

The project has already started decomposition, but the following remain the highest-risk maintainability areas:

### 1. `client_profile` is still oversized

It currently owns many unrelated concerns:

- pharmacy
- membership
- shifts
- roster
- attendance
- chat
- notifications
- calendar
- hub
- dashboards

Do not physically move models/tables casually, but continue extracting service/API boundaries around stable domains.

### 2. Very large UI components remain

Examples visible in the tree include large:

- active-shift components
- post-shift screens
- shift-list/board components
- kiosk page

Continue decomposition by:
- data hook
- state machine
- view model
- dialogs
- pure presentational components

Do not split files merely by line count; split by responsibility.

### 3. Duplicate route wrappers

Mobile has both `app/*` route files and `roles/*` implementations. This is acceptable when app routes are thin wrappers. It becomes a problem if business logic is copied into both.

### 4. Legacy finance UI

Legacy invoice pages and newer finance workspace coexist. Mark legacy files explicitly and delete only after route/dependency verification.

### 5. Backup source files

`.backup` UI files remain in source. These should not stay indefinitely once the replacement is verified because they confuse audits and future agents.

---

# 35. Recommended implementation sequence

## Checkpoint 1 — Contract and source-of-truth hardening

- Endpoint ownership map.
- Shared-core/Django resolution test.
- Membership identity constraints.
- Employment engagement uniqueness/effective date validation.
- Shift/marketplace state transition audit.

## Checkpoint 2 — Finance completion

- Customer UI.
- Item UI.
- Expenses/receipts.
- BAS.
- Received invoices.
- External invoice workflow.
- Web + mobile parity where appropriate.

## Checkpoint 3 — Workforce parity

- Employment engagement mobile/read-only decision.
- Payroll boundary/pay-run implementation.
- Roster API consolidation.
- Attendance mobile parity.

## Checkpoint 4 — Cleanup and release hardening

- Remove verified backups/legacy duplicates.
- Permission matrix tests.
- E2E cross-domain flows.
- concurrency/idempotency tests.
- migration checks.
- API deprecation documentation.

---

# 36. Final assessment by category

## Areas that are already genuinely end-to-end

- authentication/OTP
- role onboarding
- pharmacy/org management
- core membership workflow
- shift posting and shift marketplace
- active/confirmed/history shifts
- availability
- talent board
- chat
- notifications
- calendar
- pharmacy hub/community
- public blog
- public job board
- core invoices
- timesheets/hours/leave
- web attendance/kiosk

## Areas that are built but still need stronger logic

- membership source-of-truth/dedupe
- employment engagement
- Award snapshot/rate semantics
- shift concurrency/state machine
- roster generation consolidation
- invoice immutability
- ratings/rewards policy
- ethical marketplace transfer controls

## Areas where backend exists but frontend is not yet complete

- expenses
- receipts workflow
- BAS
- received invoices
- customer management
- reusable invoice items
- complete payroll operations
- parts of employment engagement on mobile
- full attendance manager/worker flows on mobile
- full roster manager tooling on mobile

## Areas that are web-first and lack full native mobile parity

- general marketplace
- ethical marketplace
- public blog/editorial

These do not necessarily need native duplication. The product should decide intentionally whether native parity is required.

---

# 37. Definition of “done” for future domains

A ChemistTasker domain should not be called complete until all of the following exist:

- [ ] persistent model/source of truth
- [ ] DB constraints
- [ ] business/service rules
- [ ] role permissions
- [ ] API endpoint
- [ ] shared-core contract
- [ ] web surface where required
- [ ] mobile surface where required
- [ ] notification/email behavior where required
- [ ] audit trail for consequential changes
- [ ] unit/service tests
- [ ] API tests
- [ ] contract test
- [ ] E2E flow
- [ ] documented failure/recovery states
- [ ] no duplicate competing implementation

---

# 38. Immediate conclusion

ChemistTasker is **not** in a state where “the backend exists but most of the frontend is missing.” A large majority of the core staffing, shifts, roster, attendance, chat, hub and invoice domains already have substantial frontend implementations.

The biggest current mismatch is narrower and more actionable:

1. **Worker finance backend is ahead of its UI**, especially expenses, receipts, BAS, customers/items and received invoices.
2. **Workforce/employment backend is ahead of mobile**, especially EmploymentEngagement and payroll configuration/operation.
3. **Roster has multiple backend generations**, so the problem is consolidation rather than absence.
4. **Attendance is exceptionally strong on backend and web but not equally surfaced on mobile.**
5. **Marketplace and ethical marketplace are deliberately strongest in the Next public web application and are not yet native-mobile equivalents.**
6. **Membership/staff logic is broadly implemented, but identity deduplication, immutable identifiers and employment linkage need to remain hard backend invariants.**

The next development cycle should therefore prioritize **closing existing backend-to-client gaps and consolidating duplicate generations**, rather than creating new duplicate pages or parallel business logic.
