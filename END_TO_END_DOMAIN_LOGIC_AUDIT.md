# ChemistTasker — End-to-End Domain Logic Audit

**Repository:** chemisttasker11-ezy/ChemistTasker-Ezy1  
**Audited branch:** main  
**Code snapshot audited:** 292d217378ed3ef92d513c69f48158a1bc2ab967  
**Audit date:** 2026-09-20  
**Supersedes:** BACKEND_FRONTEND_FULL_COVERAGE_AUDIT.md

---

# 0. Why this report exists

The earlier audit answered the wrong question. It mostly asked whether a model, endpoint, web page, or mobile screen existed.

This audit asks the product-engineering question that actually matters:

> If a real user starts a workflow, can ChemistTasker carry that workflow from the first valid action to the final business outcome with one coherent source of truth, valid state transitions, permissions, notifications, audit history, concurrency protection, recovery paths, and matching web/mobile behavior?

For every major domain this report therefore separates:

1. **The mature SaaS lifecycle ChemistTasker should implement.**
2. **The backend logic that actually exists today.**
3. **The web behavior that actually exists today.**
4. **The mobile behavior that actually exists today.**
5. **The exact state transitions that are implemented.**
6. **States or actions that exist in models but are not fully reachable.**
7. **Backend defects or missing invariants.**
8. **Frontend gaps or misleading UX.**
9. **The final end-to-end logic required before the domain should be called complete.**

This is a source-level business-logic audit. It is intentionally more demanding than a page inventory.

---

# 1. Status language used in this audit

| Label | Meaning |
|---|---|
| **ACHIEVED** | The business action exists end to end and the important backend guard is present. |
| **PARTIAL** | The flow exists, but a transition, guard, client action, recovery path, or audit requirement is missing. |
| **MODEL-ONLY** | A status/model exists but the product cannot reliably enter/leave that state through supported endpoints. |
| **BACKEND-AHEAD** | Backend capability exists but one or more clients do not expose it. |
| **CLIENT-AHEAD** | UI implies behavior that backend does not fully enforce or deliver. |
| **P0** | Can create incorrect business state, money/compliance error, data loss, or serious cross-domain inconsistency. |
| **P1** | Material product incompleteness or maintainability/integrity risk. |
| **P2** | Important maturity/UX/operational improvement but not a core integrity blocker. |

---

# 2. Executive findings — the important issues are logic issues, not missing pages

## P0 findings

### P0-1 — General marketplace exchange cancellation can leave a listing permanently reserved

The ordinary marketplace correctly creates an active MarketplaceReservation when the seller accepts an exchange. The listing moves from AVAILABLE to RESERVED.

However, the generic ExchangeAction path maps cancel directly to CANCELLED without releasing that reservation or restoring the listing to AVAILABLE.

Result:

- exchange can say CANCELLED;
- reservation can remain active;
- listing can remain RESERVED;
- later buyers can be blocked by ALREADY_RESERVED;
- there is no visible reservation expiry/release worker closing the loop.

This is a state-machine defect, not a frontend gap.

### P0-2 — General marketplace server does not enforce its own advertised exchange transition matrix

ExchangeSerializer computes allowed_actions based on state and seller/buyer role, but ExchangeAction does not use that matrix for decline, cancel, or propose-terms.

Except for accept, the endpoint effectively:

- checks participant membership;
- checks expected_version;
- maps action to a target state;
- saves it.

It does not robustly verify the current source state or actor-specific permission for those actions.

A mature marketplace must enforce transition legality on the server, not merely use allowed_actions to hide buttons.

### P0-3 — Public marketplace discovery returns RESERVED and COMPLETED listings

public_listings() filters publication_status=PUBLISHED and excludes only WITHDRAWN and EXPIRED availability.

Therefore RESERVED and COMPLETED listings still satisfy the public queryset.

A completed item should not remain an active discoverable listing. A reserved item may be displayable as reserved, but must not behave like an available listing. Discovery and enquiry behavior need explicit policy.

### P0-4 — Ethical marketplace receipt does not complete the inventory movement

Dispatch reduces the source lot and releases its reservation. Receive transitions the transfer to RECEIVED.

In the inspected receive path, there is no corresponding creation/increment of the destination lot or destination stock-movement entry.

If the ethical inventory ledger is intended to be authoritative, a transfer that leaves the source but does not enter destination inventory is incomplete accounting of stock.

### P0-5 — Ethical marketplace listing can remain RESERVED after transfer cancellation/completion

Request creation reserves stock and moves the listing into RESERVED.

The inspected transfer cancel/receive transitions release stock reservations where appropriate, but there is no complete listing reconciliation step that:

- returns remaining quantity to PUBLISHED/AVAILABLE after cancellation;
- marks the listing COMPLETED when all offered quantity is transferred;
- reduces listing quantity for partial transfer;
- reopens remaining quantity when only part is transferred.

The transfer state and listing state are not yet one coherent state machine.

### P0-6 — Shift History currently includes future assigned shifts

The helper _matching_shift_slot_exists has the proper historical date predicate commented out. The current history branch only requires:

- assignment exists;
- no pending payment.

Therefore a future confirmed assignment can satisfy History semantics.

Confirmed and History are not currently mutually exclusive lifecycle views.

### P0-7 — Multi-slot community shift direct claim can be blocked after one slot is filled

The community claim path performs a broad any_assigned check before later slot-specific logic.

For a multi-slot shift, one existing assignment can therefore make the entire shift unavailable to direct claim even if other slots remain open.

The source of truth must be the occurrence/slot, not the parent Shift row.

### P0-8 — Subscription UI advertises a discount the fulfillment checkout does not apply

OwnerBillingPage tells an active subscriber that public shift fulfillment fees are discounted by 50%.

backend/billing/views.py:

- calculates is_subscriber;
- documents subscriber Stripe price IDs;
- then selects the standard locum or standard FT/PT price IDs regardless of is_subscriber.

This is a direct pricing inconsistency between UI promise and charged checkout path.

### P0-9 — Membership deletion intentionally destroys chat history

MembershipViewSet.destroy explicitly:

- removes chat Participant rows;
- permanently deletes the Membership;
- warns in its own docstring that messages sent by that membership will also be deleted.

That is incompatible with the rest of the system's employment, roster, attendance, shift, financial, and audit-history design.

A worker leaving a pharmacy must not erase historical communications or break historical foreign-key identity.

### P0-10 — “Activate payroll” stops at payroll-ready manifest/export data

The system has strong employment terms, Award snapshots, attendance and timesheet locking. But TimesheetManifest explicitly says:

> Future payroll/integration boundary. No payroll execution lives here.

There is currently no complete ChemistTasker payroll engine for:

- pay runs;
- PAYG withholding;
- super contribution calculation/payment;
- payslip generation;
- STP/finalisation;
- pay-run correction/reversal;
- payment files.

The product must either finish payroll or rename/present this as payroll preparation/export. “Payroll activated” currently promises more than the backend executes.

---

# 3. Cross-domain source-of-truth model that ChemistTasker should enforce

Before individual domains, the project needs five universal rules.

## 3.1 User is the identity; Membership is the worker-at-pharmacy relationship

A real person must not be copied into multiple pseudo-staff rows.

Correct hierarchy:

User
→ role/onboarding identity
→ Membership at a pharmacy
→ effective-dated EmploymentEngagement when employment terms are needed
→ ShiftSlotAssignment/Roster assignment when work is scheduled
→ AttendanceSession when work occurs
→ TimesheetRevision when work is reviewed
→ Invoice or payroll/export route depending on settlement channel.

Favourite/preferred status should be a relationship flag/entity pointing at that identity, not a second worker record.

## 3.2 Historical operational records must never depend on a deletable current relationship

Past:

- messages;
- assignments;
- attendance;
- timesheets;
- invoices;
- ratings;
- audits

must remain interpretable after a worker leaves.

Therefore Membership should transition to LEFT/inactive/effective-ended, not be hard-deleted from normal product actions.

## 3.3 Every consequential workflow needs a server-side state machine

The client may render buttons, but the server must independently enforce:

- allowed source states;
- allowed actor;
- allowed target state;
- required payload;
- optimistic version or row lock;
- side effects;
- notifications;
- audit event;
- idempotency where retry is possible.

## 3.4 Derived dashboards must not become the lifecycle source of truth

Active/Confirmed/History currently derive state from dates, assignments and payment flags. That works only while every predicate is perfect.

For complex workflows, ChemistTasker should distinguish:

- parent business object;
- occurrence/slot;
- engagement/assignment;
- settlement;
- work completion.

## 3.5 “Archive” should mean retained historical record, not deletion

Across marketplace, staff, invoices, roster, content and chats:

- archive removes from active workspace;
- historical/audit links continue to work;
- irreversible deletion is exceptional and retention-aware.

---

# 4. Authentication, verification and onboarding

## Intended end-to-end lifecycle

REGISTERED
→ EMAIL/OTP VERIFIED
→ MOBILE VERIFIED where required
→ ROLE SELECTED
→ ROLE ONBOARDING INCOMPLETE
→ ONBOARDING SUBMITTED
→ ADMIN/REGULATORY REVIEW
→ VERIFIED
→ domain eligibility enabled.

Marketplace and shift actions should consume these verified capabilities rather than duplicate verification rules.

## Backend achieved

Shared endpoints cover:

- login;
- registration;
- token refresh;
- OTP verify/resend;
- mobile OTP request/verify/resend;
- password reset;
- account deletion;
- role-specific onboarding;
- referee submission/rejection.

Marketplace access goes further and explicitly checks OTP, mobile, onboarding, identity, age/assurance, marketplace terms and restrictions.

## Web achieved

Vite contains:

- OTP;
- reset;
- role onboarding;
- pharmacist/staff/explorer/owner flows;
- referee pages.

## Mobile achieved

Expo contains:

- login/register;
- OTP/mobile verification;
- reset;
- owner/pharmacist onboarding;
- profile screens for worker roles.

## Remaining logic

### P1 — verification is capability-driven in some domains and role-driven in others

Create one server capability resolver such as:

- identity_verified;
- mobile_verified;
- pharmacist_verified;
- worker_marketplace_eligible;
- pharmacy_owner_verified;
- can_manage_staff;
- can_manage_roster;
- can_manage_billing.

Do not let each domain re-interpret onboarding completion independently.

### P1 — account deletion needs historical-record policy

Account deletion must preserve legally/operationally necessary historical records through anonymisation or retained identifiers rather than cascade deletion of work history.

---

# 5. Pharmacy, organization, chain, claims and pharmacy-admin authority

## Intended lifecycle

### Pharmacy

UNCLAIMED/CREATED
→ CLAIM REQUESTED
→ CLAIM VERIFIED
→ ACTIVE
→ organization/chain links
→ administrative roles
→ SUSPENDED/ARCHIVED while historical work remains readable.

### Organization

CREATED
→ pharmacies linked
→ org administrators scoped
→ billing account scoped
→ organization-level visibility and permissions.

### Pharmacy admin

INVITED
→ ACCEPTED/ACTIVE
→ capability set
→ optionally pharmacy-scoped
→ REVOKED/INACTIVE.

## Backend achieved

client_profile exposes:

- organizations;
- chains;
- pharmacies;
- pharmacy claims;
- pharmacy admins;
- memberships;
- owner/org dashboard data.

Authority helpers distinguish owner, org admin and PharmacyAdmin in multiple operational domains.

This is important: ordinary pharmacy-owned marketplace selling correctly requires actual verified ownership and does not automatically let a PharmacyAdmin sell pharmacy assets.

## Web achieved

Strong owner/organization/pharmacy detail and admin tooling exists.

## Mobile achieved

Organization pharmacy management, owner pharmacy and pharmacy staff/admin routes exist.

## Remaining logic

### P1 — document one authority matrix

The project currently has several helper families:

- owner checks;
- org membership checks;
- pharmacy-admin capability checks;
- billing management checks;
- kiosk manager checks;
- marketplace ownership checks.

Create one permission matrix document and contract tests because “admin” does not mean the same authority in each domain.

### P1 — pharmacy archival/deactivation needs explicit downstream behavior

When a pharmacy becomes inactive:

- future roster publishing;
- shift posting;
- marketplace listings;
- ethical stock;
- kiosk tokens;
- memberships;
- payroll preparation

must transition consistently.

---

# 6. Memberships, internal staff, favourite staff and public application flow

This domain is more developed than the first audit suggested, but one destructive legacy action is unacceptable.

## 6.1 Intended concepts

### Internal staff

A person employed by the pharmacy:

- FULL_TIME;
- PART_TIME;
- CASUAL.

They should have:

- accepted Membership;
- verified platform User;
- TFN worker profile where employment/payroll requires it;
- Award classification;
- effective-dated EmploymentEngagement when ChemistTasker is used for pay/time terms.

### Favourite/external staff

A worker preferred for locum/casual marketplace allocation.

Preference should not create a second identity.

Recommended model:

PharmacyPreferredWorker
- pharmacy;
- user/membership reference;
- preferred role;
- tags/notes;
- priority/routing;
- active;
- created_by.

The current LOCUM/SHIFT_HERO membership classification can still represent a local relationship, but “favourite” should not be synonymous with an employment category.

---

## 6.2 Owner/admin direct-add flow — current backend

MembershipViewSet._create_membership_invite:

1. normalizes email;
2. requires pharmacy and role;
3. disallows PHARMACY_ADMIN through this route;
4. row-locks Pharmacy;
5. blocks another pending MembershipApplication for same pharmacy/email;
6. finds or creates User;
7. requires compatible platform user role;
8. enforces maximum active pharmacy memberships;
9. blocks duplicate pending/active Membership;
10. uses MembershipSerializer for role/classification rules;
11. creates accepted membership immediately for new user or activate_immediately;
12. otherwise creates pending invitation;
13. sends invitation/reset/membership notification flows.

### Achieved

- duplicate pending application protection;
- canonical existing-user reuse by email;
- role mismatch protection;
- classification fields;
- new/existing user email flows;
- no duplicated admin pathway.

### Remaining

#### P1 — new user can become accepted membership before completing platform identity

The source-of-truth distinction needs to remain explicit:

- accepted relationship may exist;
- work/payroll eligibility must remain blocked until User verification/onboarding requirements are complete.

This must be obvious in UI and API, not inferred.

---

## 6.3 Magic-link application flow — current backend

Public applicant:

1. owner generates MembershipInviteLink;
2. applicant opens token;
3. public endpoint validates link;
4. applicant submits identifying and employment/application data;
5. pharmacy is row-locked during submission;
6. application is stored as PENDING;
7. owner/admin receives async notification;
8. application is reviewed in owner tools.

Application fields include DOB and classification information.

## Web

MembershipApplyPage implements the public form.

Owner web has:

- MembershipApplicationsPanel;
- MembershipApplicationReviewDialog;
- ManageMembershipsPage;
- staff manager/invite tools.

## Mobile

Shared membership review panels/dialogs and worker membership pages exist.

---

## 6.4 Review and approval — current backend

MembershipApplicationViewSet:

- limits visible applications to authorized pharmacies;
- uses a dedicated review serializer for updates;
- appends review_changes;
- sends review-update emails for new changes;
- has Award preview for FULL_PART_TIME applications.

### Approval

For FULL_PART_TIME:

- employment_type restricted to FULL_TIME/PART_TIME/CASUAL;
- staff payment profile must be TFN;
- if ChemistTasker Payroll is enabled, TFN/super setup must be payroll-ready;
- payroll-enabled approval requires an employment_engagement payload.

For favourite/external category:

- employment_type restricted to LOCUM/SHIFT_HERO.

Inside a transaction approval:

- row-locks application;
- allows only PENDING;
- normalizes email;
- reuses existing User when present;
- DOB mismatch with existing onboarding blocks approval;
- calls the common membership-invite creation helper;
- populates a newly created worker identity;
- creates initial EmploymentEngagement when payroll requires it;
- marks application APPROVED;
- sends applicant communication.

### Rejection

Rejection endpoint and rejection email exist.

### Achieved

This is substantially end to end.

---

## 6.5 Critical defect — Membership delete

Current MembershipViewSet.destroy explicitly hard-deletes chat participations and then Membership, with the warning that sent messages are cascade-deleted.

### Why this breaks the domain model

A membership can be referenced conceptually by:

- employment terms;
- roster;
- assignments;
- attendance eligibility;
- hub authorship;
- chats;
- timesheets;
- historical staff relationship.

Normal “remove staff” must be:

ACTIVE/ACCEPTED
→ LEFT/INACTIVE at effective date.

It must not be DELETE.

### Required final behavior

Add a staff-relationship lifecycle:

PENDING
→ ACCEPTED_ACTIVE
→ SUSPENDED optional
→ LEFT/ENDED.

Store:

- effective_from;
- effective_to;
- end_reason;
- ended_by;
- rehire eligibility.

Historical messages and work remain.

Hard delete should exist only for safe orphan/test/pre-activation records.

**Priority: P0.**

---

# 7. EmploymentEngagement and Award-rate logic

This is one of the strongest newer backend domains.

## Intended lifecycle

MEMBERSHIP ACTIVE
→ draft/proposed employment terms
→ worker acknowledged/accepted
→ EFFECTIVE
→ historical immutable terms
→ successor terms for rate/classification change
→ ENDED.

The actual implementation already handles most of the effective-dated rate logic, but it does not yet model worker acceptance/document execution.

---

## 7.1 Current backend source of truth

EmploymentEngagement stores:

- membership;
- effective_from/effective_to;
- role;
- employment_type;
- job title;
- pay basis AWARD or ABOVE_AWARD;
- Award code/classification/source;
- Award effective date;
- complete Award rate snapshot;
- ordinary-hours pattern;
- weekday/Saturday/Sunday/public holiday agreed rates;
- early morning and late-night rates/applicability;
- notes;
- creator/updater;
- timestamps.

Constraints:

- one engagement per membership/effective_from;
- valid date range;
- application-level overlap check;
- pharmacy membership required;
- new engagement role must match membership role.

---

## 7.2 Award resolution logic achieved

build_employment_engagement_payload:

1. resolves role/employment type from membership/request;
2. validates FULL_TIME/PART_TIME/CASUAL;
3. validates AWARD/ABOVE_AWARD;
4. resolves classification;
5. resolves DOB;
6. always resolves the Award underpinning;
7. snapshots source/correspondence;
8. for junior rates, forces a successor before the next birthday/rate review;
9. AWARD terms take calculated schedule rates;
10. ABOVE_AWARD requires explicit agreed rates;
11. every agreed rate must be at least the Award floor;
12. at least one rate must actually be above the Award;
13. penalty windows use max(agreed, Award floor).

This is correct architecture: the Award minimum is not discarded merely because the contract is above Award.

---

## 7.3 Part-time pattern logic achieved

Part-time ordinary hours validate:

- weekday values;
- duplicate days;
- HH:MM;
- ordinary start not before 07:00;
- finish after start;
- midnight end handling;
- meal break values;
- meal break positioning;
- daily paid-work maximum;
- meal break requirement after >5 paid hours;
- timing window for long-day meal break;
- minimum 3 paid hours;
- weekly hours below 38;
- written variation/overtime metadata.

---

## 7.4 Historical immutability achieved

Create supports supersedes_public_id:

- successor must start after prior;
- successor cannot retroactively rewrite past terms;
- prior is closed the day before successor.

PATCH:

- started engagement: only end date and notes;
- completed historical end date: immutable;
- future engagement: terms may still change.

This is exactly the kind of historical-rate protection the rest of payroll should follow.

---

## 7.5 What is missing

### P1 — no worker acceptance/e-sign state

Employment terms are manager-created records.

A mature employment flow needs:

PROPOSED
→ SENT_TO_WORKER
→ ACKNOWLEDGED/ACCEPTED
→ EFFECTIVE.

Store:

- terms document/version;
- sent_at;
- accepted_at;
- accepted_by worker;
- IP/device evidence if required;
- declined/queried state;
- successor relationship.

Do not equate “manager saved record” with “employment terms communicated and agreed”.

### P1 — employment termination metadata

effective_to exists but no structured:

- resignation;
- termination;
- end of casual relationship;
- transfer;
- classification correction.

### P1 — classification changes should have a guided successor workflow

Promotion/year progression/intern stage changes should generate a successor engagement and show before/after rate impact.

---

# 8. Shift posting — from creation to visibility

The shift domain is functionally broad, but its lifecycle is spread across parent Shift state, visibility, offers, assignments and payment.

## 8.1 Who can post

Owner/admin/organization-managed pharmacy pathways use the shared shift backend.

Role-specific web/mobile pages are wrappers around the same operational feature.

Post-shift surfaces exist in:

- Vite owner/admin flows;
- organization flows;
- mobile owner/admin/organization flows.

## 8.2 Shift structure

A Shift carries, among other data:

- pharmacy;
- role needed;
- employment type;
- rate model;
- fixed/flexible/worker-provided rate concepts;
- visibility;
- anonymity;
- escalation timing;
- travel/accommodation flags;
- single-user behavior;
- payment state.

ShiftSlot carries occurrence date/time/rate/recurrence.

ShiftSlotAssignment is the actual frozen allocation and includes:

- worker;
- occurrence;
- locked rate;
- payment-preference snapshot;
- settlement channel;
- engagement kind;
- accepted engagement terms;
- payroll activation;
- source offer;
- roster flag.

**The assignment, not the Shift, is the durable worker commitment.**

---

# 9. Shift visibility and escalation

## Intended lifecycle

For local staffing:

INTERNAL STAFF
→ FAVOURITES/LOCAL CASUAL
→ OWNER CHAIN
→ ORGANIZATION
→ PLATFORM/PUBLIC

according to pharmacy configuration and explicit/escalation timing.

## Backend achieved

BaseShiftViewSet:

- computes allowed visibility tiers;
- supports manual escalation;
- supports scheduled auto-escalation;
- stops at configured hierarchy;
- applies public daily-limit check;
- tracks visibility/escalation level;
- can preserve historical member-tier status after public escalation.

_auto_escalate_shifts currently runs as part of shift queryset access for eligible candidates.

## Missing maturity

### P1 — escalation side effects should not depend on a read request

A GET that happens to load shifts should not be the primary scheduler.

Move scheduled escalation into a background job/queue with:

- due time;
- idempotency;
- event/audit row;
- retry visibility.

The read path can retain a safety reconciliation check.

---

# 10. Worker response: internal claim, interest, reject and counter-offer

There are intentionally two different pathways.

## 10.1 Internal staff claim

Community claim is for true internal staff membership.

Favourite/locum workers are not supposed to bypass engagement terms through direct claim.

### Achieved

- membership/role checks;
- assignment creation;
- distinction from external offer flow.

### P0 defect

The current any_assigned shortcut treats a multi-slot parent shift too broadly.

Final rule must be occurrence-specific:

- slot A filled must not close slot B;
- recurring occurrence on date X must not close occurrence on date Y;
- single_user_only can legitimately lock the parent shift.

---

## 10.2 Public/external interest

express_interest:

- requires eligible/verified onboarding for public applicants;
- supports specific slot IDs;
- supports whole-shift interest where allowed;
- validates slot membership;
- creates ShiftInterest idempotently via get_or_create;
- notifies owner;
- preserves anonymous/public profile behavior.

## Reject

ShiftRejection records a member response for community visibility.

## Counter-offer

Counter-offer records support:

- worker;
- one or more slots;
- changed start/end/rate;
- travel request;
- status PENDING/ACCEPTED/REJECTED.

Web and mobile contain dialogs/hooks for counter-offers.

### Missing maturity

- Counter-offer and ShiftOffer should share one formally documented transition graph.
- Concurrent owner acceptance of competing counter-offers must lock the same occurrence.
- A counter-offer supersession chain should explicitly identify which proposal replaced which.

---

# 11. Candidate review, profile reveal and offer

## 11.1 Profile reveal

For public applicants, owner initially sees privacy-safe candidate data.

reveal_profile:

- checks manager authority;
- applies reveal quota;
- records reveal/audit;
- returns contact/profile detail;
- notifies worker.

This is a good privacy boundary.

## 11.2 Owner acceptance is intentionally an offer, not immediate assignment

accept_user creates/refreshes a ShiftOffer rather than immediately binding the worker.

This is correct: the worker must confirm the engagement.

ShiftOffer includes:

PENDING
ACCEPTED_AWAITING_PAYMENT
ACCEPTED
DECLINED
EXPIRED.

The offer also carries expiry and can be “buzzed” by manager with cooldown.

---

# 12. Worker offer acceptance and engagement terms

ShiftOffer.accept:

1. worker-only;
2. PENDING-only;
3. checks expiry;
4. validates slot;
5. builds engagement terms;
6. requires explicit acceptance payload where needed;
7. freezes accepted terms snapshot;
8. determines settlement/payment path;
9. if owner payment is required:
   - offer → ACCEPTED_AWAITING_PAYMENT;
   - shift payment → PENDING;
10. otherwise:
   - finalizes ShiftSlotAssignment;
   - offer becomes accepted;
   - competing offers for the occurrence expire;
11. sends worker and owner notifications/emails.

This is strong end-to-end logic.

## TFN payroll activation

activate-payroll:

- manager only;
- pharmacy must enable ChemistTasker Payroll;
- accepted external TFN employee shift only;
- blocks if Award/overtime review is required;
- verifies worker TFN/super profile;
- freezes assignment settlement channel to PAYROLL.

Again: this is routing into payroll preparation, not a completed pay-run system.

---

# 13. Active Shifts

## What “Active” should mean

An owner Active Shift workspace should contain only occurrences that still require action:

- vacancy;
- applicants;
- counter-offer;
- offer awaiting worker;
- worker accepted but payment pending;
- partially filled multi-slot shift.

Once an occurrence is completely confirmed and financially finalized, it belongs in Confirmed.

## Current backend

ActiveShiftViewSet derives active state from:

- managed/created pharmacy;
- future/current slot;
- whether assignment exists;
- pending payment;
- parent employment type;
- recurring conditions.

It then performs a second in-memory _has_open_active_occurrence filter.

## Web

The Vite ActiveShiftsPage is a major operational UI with:

- candidate levels;
- reveal;
- counter-offers;
- status cards;
- escalation;
- delete dialog;
- sharing;
- ratings integration;
- slot selection.

## Mobile

A similarly broad shared ActiveShifts implementation exists.

## Problems

### P1 — state is derived in several different helpers

This makes Active/Confirmed/History drift likely, which has already happened in History.

### P1 — dead code remains after member_status return

ActiveShiftViewSet.member_status immediately returns _build_member_status_response, leaving a large legacy implementation after the return.

Remove it after regression comparison. Dead lifecycle code is dangerous because future edits may hit the wrong copy.

### Recommended final design

Create an occurrence projection service that produces one authoritative status:

OPEN
APPLICATIONS
OFFER_PENDING
PAYMENT_PENDING
CONFIRMED
IN_PROGRESS
COMPLETED
CANCELLED.

All three dashboards should consume that projection.

---

# 14. Confirmed and History shifts

## Confirmed — current intended predicate

- future/current occurrence;
- assignment exists;
- no accepted-awaiting-payment.

## History — current intended predicate

Should be:

- past occurrence;
- assignment exists;
- no accepted-awaiting-payment.

## Actual defect

The past-date predicate in _matching_shift_slot_exists(state="history") is commented out.

Current branch only checks assignment and no pending payment.

**Fix first before adding any more History UI.**

## Final lifecycle recommendation

Do not let “past date” alone mean completed.

A robust occurrence should distinguish:

CONFIRMED
→ IN_PROGRESS when attendance starts
→ WORKED_PENDING_REVIEW after clock-out
→ COMPLETED after attendance/timesheet business completion
→ FINANCIALLY_SETTLED optional.

A no-show or cancelled assignment should not be treated as ordinary completed history.

---

# 15. Shift billing and cancellation

## Fulfillment charge

Backend resolves billing account and whether payment is required.

For payment-required offers, fulfillment checkout finalizes accepted offers after successful billing flow.

## Critical subscriber pricing defect

The code identifies active subscription and includes comments for subscriber Stripe price IDs, but selects the standard price IDs.

OwnerBillingPage promises:

- $30/month;
- 5 included seats;
- $5 additional;
- 50% public shift fulfillment fee discount.

The fulfillment charge path currently does not apply that discount.

**P0: pricing contract violation.**

## Cancellation penalty

A dedicated billing endpoint computes owner cancellation penalties from time-to-shift and expected wage.

## Required final cancellation state machine

Owner cancellation of a filled occurrence should atomically coordinate:

- occurrence CANCELLED;
- assignment cancellation record;
- cancellation actor/reason;
- worker notification;
- penalty eligibility;
- payment/penalty record;
- attendance prevention;
- roster/calendar update;
- invoice/payroll settlement exclusion;
- audit.

Do not let billing penalty be a side operation detached from a formal cancellation state.

---

# 16. Availability and Talent Board

## Backend today

UserAvailability stores:

- date;
- start/end time;
- all-day;
- recurring flag;
- recurring days;
- recurring end date;
- notify-new-shifts;
- notes.

The ViewSet scopes rows to the authenticated user.

## Web

SetAvailabilityPage and Talent Board provide:

- availability;
- radius/location UI;
- filters;
- worker cards;
- pitch dialog.

## Mobile

Strong equivalent surfaces exist, including native/web radius map variants.

## Logic gap

UserAvailabilitySerializer is currently a plain ModelSerializer with no custom validation.

Missing backend invariants include:

- end > start for timed availability;
- all-day vs time-field consistency;
- recurring requires recurring_days;
- recurring end cannot precede start;
- duplicate/overlap policy;
- timezone semantics;
- recurrence exceptions.

### Final behavior

Availability should be normalized into a backend interval engine.

Worker action:

CREATE ONE-OFF / CREATE RECURRING
→ validate
→ merge/reject overlap
→ persist timezone
→ match to future shift occurrences
→ deduplicated notification
→ exception/cancel occurrence support.

**Priority: P1 because matching quality depends on data integrity.**

---

# 17. Roster — two generations currently coexist

Roster is not “missing”. It is sophisticated but has two overlapping API generations.

## 17.1 Legacy/Roster V2 family

client_profile attendance roster endpoints include:

- period;
- validate;
- publish;
- unpublish;
- archive;
- worker published roster;
- acknowledgement;
- acknowledgement status;
- copy week;
- templates;
- template apply;
- bulk edit;
- swap request;
- cover request;
- manager approve swap;
- manager approve replacement;
- release worker;
- reject request;
- audits.

Models include:

- RosterPeriod DRAFT/PUBLISHED/ARCHIVED;
- RosterAcknowledgement;
- RosterTemplate;
- RosterActionAudit.

This is a real workforce workflow, not a placeholder.

---

## 17.2 New workforce revision layer

workforce adds concurrency and safe publish:

### RosterRevisionState

- draft_revision;
- published_revision;
- validated_revision;
- validation snapshot.

### RosterOperation

- operation UUID;
- period;
- operation type;
- request hash;
- result;
- actor.

### Workspace

serialize_workspace returns:

- week/period;
- status;
- revisions;
- grid;
- validation;
- coverage requirements;
- staffing summary.

Only assignments with is_rostered=True appear as editable roster rows. Marketplace commitments remain visible elsewhere rather than being silently converted into roster-owned rows.

### Validation

validate_period_command:

- requires manager permission;
- row/revision consistency;
- rejects stale expected_revision;
- calculates errors and warnings;
- stores exactly which draft revision was validated.

### Publish

publish_period_command:

1. manager permission;
2. computes request hash;
3. row-locks period;
4. idempotency via operation_id;
5. verifies expected draft revision;
6. runs validation;
7. blocks errors;
8. computes stable warning keys;
9. requires acknowledgement of every current warning;
10. publishes;
11. stores published_revision;
12. records idempotent operation result.

This is excellent publish architecture.

---

# 18. Roster problems to fix before calling it final

## P1 — two write paths can undermine the revision model

If a legacy roster mutation can change assignments without bumping RosterRevisionState, the safe-publish layer can validate revision N and then publish a different underlying roster.

Required invariant:

> Every roster-owned mutation must bump the same draft_revision.

Contract-test every mutation endpoint.

## P1 — published revision number is not the same as an immutable published snapshot

RosterRevisionState knows which revision number was published, but a mature roster should retain exactly what workers were sent.

Add RosterPublishedSnapshot:

- period;
- published_revision;
- complete assignment snapshot;
- coverage/validation snapshot;
- published_by;
- published_at;
- superseded_at.

## P1 — post-publication edits should be amendments, not invisible mutation

Desired lifecycle:

DRAFT r1
→ VALIDATED r1
→ PUBLISHED r1
→ worker acknowledgements
→ manager change creates DRAFT r2 / amendment
→ affected workers notified
→ PUBLISHED r2
→ r1 retained.

## P1 — acknowledgement semantics need change awareness

Do not merely have “worker acknowledged the week”.

A worker who acknowledged r1 must be re-notified if r2 changes one of their shifts.

## P1 — leave systems must converge

Roster has legacy leave-related behavior while workforce has WorkforceLeaveRequest.

Choose one authoritative leave source and adapt legacy endpoints.

---

# 19. Roster web/mobile

## Web

Owner roster and worker roster pages exist, with dialogs and workforce safe-publish review.

Web is the strongest roster management client.

## Mobile

Worker-facing roster behaviors and broad role routing exist, but manager-level revision/validation/publish functionality is not as clearly complete as web.

## Final client rule

If roster administration is intentionally web-first:

- mobile should be explicit read/ack/request-swap/request-cover;
- do not create partial duplicate manager logic.

If mobile manager editing is a requirement, it must use the revision-safe workforce endpoints, not legacy direct mutations.

---

# 20. Attendance and kiosk

Attendance is one of the strongest backend domains in the project.

## 20.1 Source of truth

### AttendanceSession

Represents one continuous work session.

There is a database invariant preventing more than one open session per worker.

### AttendanceEvent

Append-only:

- CLOCK_IN;
- BREAK_START;
- BREAK_END;
- CLOCK_OUT.

Original events are not rewritten.

### AttendanceCorrection

Append-only corrected timestamp + reason + manager + created time.

### ProvisionalAttendance

For legitimate work that did not match a normal roster membership/assignment:

- PENDING;
- APPROVED;
- REJECTED.

Approval can backfill work records without inventing a permanent Membership.

This is correct architecture.

---

# 21. Clock-in state machine

clock_in:

1. requires user/pharmacy;
2. starts transaction;
3. row-locks/checks any existing open session;
4. allows a same-pharmacy retry within 30 seconds as idempotent retry;
5. otherwise rejects double clock-in;
6. requires physical-presence credential:
   - signed pharmacy QR; or
   - verified kiosk event; or
   - kiosk + worker PIN;
7. verifies kiosk/pharmacy scope;
8. resolves attendance eligibility;
9. creates AttendanceSession;
10. creates immutable CLOCK_IN event;
11. creates ProvisionalAttendance when necessary.

Break transitions enforce correct order.

Clock-out resolves the already-open session even if roster/membership changed later and auto-closes an active break.

This is materially production-grade logic.

---

# 22. Kiosk security lifecycle

Backend supports:

KIOSK AUTHORISATION
→ pairing code
→ device key proof
→ device activation
→ restricted device token
→ signed rotating QR/PIN events
→ revoke.

Strengths:

- hashed device token;
- manager authorization;
- pharmacy scoping;
- Ed25519 recovery proof;
- active/revoked device check;
- short-lived signed QR;
- PIN lockout;
- same-owner/org cross-site logic;
- offline protocol and tests.

## Remaining

### P1 — expose complete device administration operationally

Manager UI should show:

- active devices;
- last seen;
- platform/app version;
- revoke;
- replacement/recovery;
- suspicious failed PIN/credential activity.

### P1 — mobile attendance parity

Web has:

- kiosk activation;
- kiosk screen;
- worker attendance;
- manager review.

Mobile has attendance-pin/kiosk-link infrastructure but not an equally obvious complete worker + manager attendance operating surface.

### P2 — retention/privacy policy

IP/device/security event retention should be explicit.

---

# 23. Leave

Two leave concepts exist.

## New workforce leave

WorkforceLeaveRequest:

PENDING
→ APPROVED
→ REJECTED

Worker can also:

PENDING
→ CANCELLED.

Backend:

- worker can submit only for own active accepted membership;
- manager can approve/reject;
- worker can cancel only own pending request;
- approved leave overlap is rejected;
- decision actor/time/note is stored.

Web and mobile My Leave / Manager Leave surfaces exist.

## Legacy LeaveRequest

Older leave request logic remains in client_profile and is still connected to existing assignment/notification behavior.

## Required final state

Migrate consumers to WorkforceLeaveRequest and make legacy an adapter/read compatibility layer.

One leave request must feed:

- roster validation;
- coverage;
- calendar;
- timesheet leave segments;
- payroll/export.

---

# 24. Timesheets

The new timesheet engine is stronger than the earlier audit conveyed.

## Source entities

TimesheetPeriod:

OPEN
REVIEW
APPROVED
LOCKED.

Timesheet:

OPEN
NEEDS_REVIEW
READY
SUBMITTED
APPROVED
REOPENED.

Additional immutable/review entities:

- TimesheetRevision;
- TimesheetSegment;
- TimesheetCheck;
- TimesheetCheckDecision;
- TimesheetComment;
- correction request;
- TimesheetApproval;
- TimesheetManifest.

## Recalculate

Timesheet revisions snapshot source data and fingerprints.

The engine can compare:

- roster;
- attendance;
- leave;
- employment engagements;
- settlement route.

## Submit

Worker only.

Requires:

- current exact revision number;
- no pending rebuild.

Creates EMPLOYEE_SUBMIT approval and status SUBMITTED.

## Manager approval

Requires:

- manager authority;
- unlocked period;
- exact current revision;
- no rebuild;
- no unresolved BLOCKER checks.

Creates TIME_APPROVAL and status APPROVED.

## Reopen

Manager only, unlocked period, reason required.

## Check decisions

Certain source-integrity blockers cannot be waived at the timesheet layer:

- missing clock in/out;
- unresolved provisional attendance.

They must be corrected at attendance source.

This is an excellent source-of-truth rule.

---

# 25. Timesheet lock and payroll boundary

lock_period:

1. manager authority;
2. row-lock period;
3. ensures all expected timesheets;
4. blocks if any needs rebuild;
5. blocks if any not APPROVED;
6. snapshots each worker/revision;
7. freezes assignment settlement routing:
   - PAYROLL;
   - INVOICE;
   - TIMESHEET_ONLY;
8. if payroll enabled, creates payroll_export subset containing only PAYROLL assignments;
9. hashes manifest;
10. prevents a different second manifest;
11. marks period LOCKED.

This is a strong final-review boundary.

## But it is not payroll execution

TimesheetManifest's own model comment says no payroll execution lives here.

### Missing payroll product

If ChemistTasker intends to be payroll:

PAY PERIOD LOCKED
→ PAY RUN DRAFT
→ calculate ordinary/penalty/overtime/allowance
→ tax withholding
→ super
→ manager review
→ FINALIZED
→ payslip
→ STP/reporting integration
→ bank/payment file
→ PAID
→ adjustment/reversal process.

None of that lifecycle is complete in the inspected backend.

**Status: payroll-ready workforce engine, not finished payroll.**

---

# 26. Invoice and worker finance — correction to the previous audit

The previous report incorrectly said expenses/BAS/customer/item UI were largely missing.

They are not.

The newer finance workspace is materially broader.

---

# 27. Finance source of truth

## Customer

Reusable customer/contact for external invoices.

## CatalogueItem

Reusable invoice item with:

- name;
- price;
- tax code;
- super eligibility;
- active state.

## InvoiceRecord

Wraps the legacy Invoice and adds:

- owner;
- customer;
- parent super-document relation;
- kind;
- internal/external source;
- optimistic version;
- idempotent request key;
- normalized payload;
- calculated values;
- lock/void fields;
- owner review state.

## InvoiceRevision

Immutable version snapshots.

## InvoiceReviewRequest

Receiver's structured request for revision.

## Payment

Idempotent by record/request_key.

## Delivery

One send attempt per invoice version.

## Expense + Receipt

Versioned expense and private evidence store.

---

# 28. Invoice authoring lifecycle implemented

## Create

User can create:

- external invoice from scratch;
- internal/shift-based invoice from eligible work.

Internal source/prefill endpoints exist.

## Save/update

PATCH:

- uses optimistic versioning;
- validates full invoice input;
- creates the next audited InvoiceRevision.

This is much stronger than editing one mutable invoice row.

## Preview/PDF

Backend-calculated preview and PDF rendering exist.

## Duplicate

Duplicate action exists with request-key/idempotency semantics.

## Separate super document

super_document creates a linked child document. The OneToOne parent relation prevents uncontrolled duplicates.

## Issue

Issue is now a review action rather than a hard immutable lock; revisions remain possible through the audited revision mechanism.

---

# 29. Invoice sending lifecycle

This is one of the better retry designs in the project.

send:

1. row-locks invoice;
2. checks expected version;
3. requires explicit confirmed=true;
4. rejects void invoice;
5. validates recipient;
6. get_or_create Delivery by record+version;
7. if prior preparation failed, safe render retry is allowed;
8. otherwise prior send attempt prevents blind duplicate send;
9. renders PDF before SMTP;
10. render failure → Delivery failed, no SMTP attempted;
11. before SMTP → sending;
12. SMTP exception/uncertain acceptance → uncertain;
13. explicitly tells caller not to resend blindly;
14. confirmed provider acceptance → sent;
15. Invoice status → sent;
16. records revision state.

This is mature idempotency thinking.

---

# 30. Received invoices

Owner/admin can see internal worker invoices sent to managed pharmacies.

Workflow includes:

- list/retrieve;
- request revision with note/version;
- approve for payment;
- mark paid;
- notification back to worker.

Web FinanceWorkspace has received-invoice tools.

This is a real accounts-payable review path for ChemistTasker-generated internal invoices.

---

# 31. Payments

Invoice payments support:

- payment date;
- amount;
- GST/sales allocation;
- reference;
- idempotent request key.

Payment date is constrained between invoice date and current date.

The model supports multiple Payment rows.

## Gap

mark_paid can directly set the invoice paid state independently of recorded payment allocation.

A mature finance source of truth should reconcile:

invoice total
- sum(Payment)
= outstanding.

Then derive:

SENT
PART_PAID
PAID
OVERPAID.

Manual “mark paid” should either create a balancing payment record or explicitly be an accounting override with reason.

---

# 32. Expenses and receipts

Backend:

- create expense idempotently;
- optimistic version update;
- business-use percent;
- tax code;
- GST amount;
- GST registration flag;
- evidence confirmation;
- reimbursable flag;
- paid/incurred dates;
- private receipt bytes;
- PDF/PNG/JPEG signature validation;
- 5 MB per receipt;
- duplicate hash protection;
- owner-level 50 MB bounded first-release store;
- authenticated no-cache download.

Web includes Expenses & receipts.

Mobile shared FinanceWorkspace exposes finance tools as well.

## Missing

### P1 — archive endpoint/action is not exposed

Expense has archived_at and default queryset excludes archived rows, but the inspected ExpenseViewSet has no explicit archive action.

### P1 — supplier payment lifecycle is shallow

Expense has one paid_on date, not supplier payment allocations.

The BAS endpoint explicitly warns partial supplier payments require manual review.

---

# 33. BAS / GST worksheet

Backend bas_worksheet supports:

- date range max 366 days;
- cash or accrual basis;
- issued workspace invoices;
- invoice payments for cash basis;
- expenses;
- GST credit calculation;
- evidence warnings;
- G1;
- 1A;
- 1B;
- estimated GST net.

It intentionally returns lodgement_ready=false.

It also explicitly warns it excludes:

- legacy invoices not migrated to finance workspace;
- bank feeds;
- credit notes;
- prepayments;
- PAYG;
- WET;
- LCT;
- adjustments.

This is correctly labelled a worksheet, not a full BAS product.

Web FinanceWorkspace has a GST/BAS tool.

## Final finance maturity required

### P1 — credit notes / refunds

A sent invoice should not be “edited into history”.

Required:

SENT invoice
→ CREDIT NOTE linked to original
→ allocation/refund
→ BAS adjustment.

### P1 — void lifecycle

InvoiceRecord has voided_at, but no complete inspected public action provides:

- void reason;
- version;
- actor;
- notification;
- credit/BAS handling.

### P1 — delivery reconciliation

Delivery can become uncertain.

Need operator action:

UNCERTAIN
→ confirmed delivered
or
→ confirmed failed → resend new controlled attempt.

### P1 — bank/payment reconciliation

Needed for mature bookkeeping:

- bank transaction import/feed;
- match to invoice/expense;
- split payment;
- overpayment;
- unmatched payment;
- reconciliation audit.

### P1 — accounting export

Export/API handoff for MYOB/Xero/accounting needs formal mapping.

---

# 34. Finance frontend — current achieved surface

## Web

FinanceWorkspace includes tools for:

- invoices;
- customers;
- reusable items;
- expenses & receipts;
- GST/BAS;
- received invoices.

InvoiceComposer supports:

- internal assignment prefill;
- external customer;
- saved items;
- issuer/business/bank details;
- super;
- backend preview;
- versioned save.

## Mobile

Shared invoice/finance components include:

- invoice list/detail/generate;
- FinanceWorkspace;
- FinanceInvoiceEditor;
- invoice statistics.

## Remaining UX

Do not build another invoice page. Strengthen the existing workspace with:

- outstanding balance;
- part-paid timeline;
- credit/void actions;
- delivery state;
- overdue/reminder;
- reconciliation;
- supplier payment allocations;
- export.

---

# 35. Subscription and platform billing

## Current subscription source

OwnerSubscription is attached to exactly one owner or organization and stores:

- Stripe customer;
- base subscription;
- extra-seat subscription;
- status;
- staff count;
- current period end.

StripeWebhookEvent gives idempotent webhook-event tracking.

## Web lifecycle

OwnerBillingPage supports:

- PAYG comparison;
- $30 owner subscription;
- 5 included seats;
- $5 extra seats;
- card or invoice checkout;
- seat-management view;
- active subscription status.

## Gaps

### P0 — subscriber shift discount not applied

Fix pricing selection first.

### P1 — extra-seat lifecycle cannot properly resize an existing add-on

The backend indicates incremental changes to an existing extra-seat subscription are not fully supported.

Need:

- increase seats;
- decrease seats;
- effective date/proration;
- minimum seat floor;
- cancel extra-seat product;
- webhook reconciliation.

### P1 — no complete self-service subscription lifecycle

Needed:

ACTIVE
→ payment failure/past due
→ retry/update payment method
→ cancel at period end
→ cancelled
→ reactivate.

Expose invoice history and billing portal or equivalent.

### P1 — Stripe price IDs should not be hardcoded business logic

Move product/price mapping into configuration/catalog with environment validation.

---

# 36. Chat and direct messaging

## Backend source

Conversation:

- DM/GROUP;
- pharmacy-linked community conversation;
- unique DM key;
- creator/title.

Participant:

- Membership;
- last read;
- pin state;
- per-user settings.

Message:

- Membership sender;
- body/attachment;
- deleted/edited flags;
- original body;
- reactions/pin support.

## Web

Full chat UI:

- sidebar;
- conversation panel;
- new chat;
- message bubble;
- unread behavior.

## Mobile

Shared chat UI plus role routes.

## Strong behavior

- one logical DM pair;
- unread/read state;
- group/community context;
- edit/delete history fields;
- websocket/realtime infrastructure.

## Critical cross-domain issue

Message sender is tied to Membership and normal membership deletion deliberately deletes messages.

Fix the Membership lifecycle rather than trying to patch chat around it.

## Additional maturity

### P1

- attachment malware/content scanning;
- private object storage/retention;
- block/report/mute;
- removed member access policy;
- admin export/audit where required;
- notification preferences.

---

# 37. Notifications

## Backend

Notification records, device tokens, shift notification helpers and email tasks are broad.

Shift lifecycle has explicit email templates for:

- interest;
- member interest;
- offer;
- offer reminder;
- offer accepted/rejected;
- payment finalized;
- availability match;
- claim.

Membership application has:

- submitted;
- review changed;
- approved;
- rejected.

Hub mentions/reactions/comments have notification behavior.

## Mobile

- push token utility;
- notification screen;
- notification-to-route resolver;
- role wrappers.

## Final design rule

Every notification must use structured routing:

type
entity_type
entity_id
action
version/context

Do not route by parsing message text.

Add deduplication keys for retryable background events.

---

# 38. Calendar and Work Notes

## Backend

CalendarEvent supports:

- manual;
- birthday;
- shift;
- organization source;
- recurrence data;
- pharmacy/org scope.

Only manual events are meant to be manually editable.

CalendarFeed combines data in a date range.

WorkNote supports:

- task-like state;
- assignment/general scope;
- recurrence;
- per-member completion;
- shift-start notification behavior.

## Web/mobile

Both have substantial calendar surfaces.

## Logic issue

The current permission helper allows an active pharmacy member to create work notes, and the same broad membership context is used for management actions.

If work notes are managerial operational tasks, this is too broad.

Define:

- create own note;
- create shared pharmacy note;
- assign to someone;
- edit/delete another person's note;
- complete note;
- admin manage.

These should be separate permissions.

## Missing recurrence maturity

A mature recurring calendar needs:

- edit this occurrence;
- edit this and following;
- edit entire series;
- exception/cancel occurrence;
- timezone/DST semantics.

---

# 39. Pharmacy Hub / authenticated community

This is another strong domain.

## Scopes

- pharmacy;
- organization;
- community group;
- organization group;
- platform/ChemistTasker hub.

## Features

- posts;
- comments;
- reactions;
- polls;
- groups;
- pharmacy/org profiles;
- mentions;
- attachments;
- pin/unpin;
- soft deletion;
- edit history fields.

## Backend authority

HubScopeResolver determines membership/admin scope.

Posts/comments are scoped and author/admin edit permissions are enforced.

Mention notifications use both notification and email.

Editorial ContentDocument-backed hub posts cannot be edited through ordinary social-post endpoints; the API tells the caller to use publishing workspace.

That separation is good.

## Web/mobile

Both have strong, shared implementations.

## Remaining

- moderation/report/appeal lifecycle;
- attachment scanning/private-storage maturity;
- notification preferences;
- retention;
- moderator-visible revision history.

---

# 40. Blog and public editorial content

This domain is far more complete than “a blog page”.

## 40.1 Public Article

Article supports:

- BLOG/NEWS kind;
- topic;
- stable slug;
- rich body;
- cover/attribution;
- DRAFT;
- PUBLISHED;
- ARCHIVED;
- published_at;
- SEO metadata.

Public query only exposes:

- PUBLISHED;
- published_at <= now.

Published content has stronger immutability rules around URL identity.

Comments, reactions and reporting exist.

## Web

Next public app has:

- blog list;
- article route;
- article card/detail;
- canonical metadata;
- social metadata;
- structured data;
- source attribution;
- discussion/related content.

This is the correct place for public SEO content.

---

# 41. Editorial publishing workspace

public_hub also has a real editorial workflow:

ContentDocument
→ ContentRevision.

Revision states include:

DRAFT
SUBMITTED
SCHEDULED
PUBLISHED
SUPERSEDED.

Important behavior:

- optimistic version check;
- submitted/scheduled revisions are locked from ordinary editing;
- content schema validation;
- public URL fields protected;
- editing a published/superseded document creates a new working draft instead of overwriting live copy.

Actions include:

- submit;
- return with feedback;
- schedule/publish;
- archive.

ContentAdministrator/ContentAssignment provide writer/publisher permissions.

Next /content workspace exposes editor, preview and workflow actions.

## Achieved state machine

DRAFT
→ SUBMITTED
→ RETURNED(DRAFT with feedback)
or
→ SCHEDULED
→ PUBLISHED
→ SUPERSEDED by newer published revision
→ ARCHIVED at document level.

This is a mature pattern.

## Remaining content maturity

### P2

- rollback/restore a previous published revision;
- rich revision-diff UI;
- scheduled-publish worker observability/retry dashboard;
- media library lifecycle;
- moderation appeal workflow;
- content retention/archive policy;
- autosave/recovery UX.

---

# 42. General marketplace — complete end-to-end audit

This section is intentionally detailed because this is where “page exists” is least useful.

---

# 43. Marketplace actors and eligibility

## Personal seller

Can be a verified eligible platform member whose role is allowed by the category.

Supported policy roles include owner, pharmacist, intern, technician, assistant, student and explorer/career-switcher variants.

## Pharmacy seller

Must be the verified current OWNER of the pharmacy.

A PharmacyAdmin does not automatically get ordinary asset-selling authority.

## Buyer

Must:

- pass marketplace access;
- not be listing creator;
- have a buyer role allowed by audience;
- where pharmacy context is required, select a pharmacy they actually own;
- fall inside the listing's current audience circle.

## Access gate

evaluate_marketplace_access checks:

- authenticated active account;
- not deleted;
- OTP;
- mobile verification;
- role onboarding verification;
- identity verification;
- adult/age assurance rules;
- marketplace terms version;
- restrictions.

This is appropriately strict.

---

# 44. Marketplace listing creation

## Backend

POST /api/marketplace/listings/

Creates a private DRAFT.

It validates:

- feature flags;
- access gate;
- seller context;
- pharmacy ownership;
- category/mode;
- medicines excluded;
- sell price;
- swap description;
- buyer-role subset;
- delivery data.

Creates:

- MarketplaceListing;
- ListingAudiencePolicy;
- ListingDeliveryTerms;
- audit event LISTING_CREATED.

## Web

The Next add-item wizard is substantially complete.

Steps:

1. personal vs pharmacy vs ethical;
2. SELL/SWAP/FREE;
3. category;
4. details/photos;
5. audience;
6. location/delivery;
7. privacy-safe preview;
8. save draft or submit.

Pharmacy listing starts at OWNED_CHAIN and can define maximum escalation.

## Mobile

No equivalent full native ordinary-marketplace workflow exists.

That is acceptable only if marketplace is explicitly web-first and mobile deep-links into web.

---

# 45. Marketplace listing edit/revision/moderation

## Current editable state

PATCH is allowed only for:

- DRAFT;
- REJECTED.

It uses expected_version.

Published content is rejected with the instruction that it must use a reviewed revision.

## Problem

MarketplaceListingRevision exists, but no supported product endpoint/workspace was found that creates/submits/applies a published-listing revision.

Therefore the model advertises a reviewed-revision architecture that is not actually complete.

**Status: MODEL-ONLY / PARTIAL.**

## Moderation

submit:

DRAFT/REJECTED
→ PENDING_REVIEW if category.requires_review
or
→ PUBLISHED if no review required.

Django admin contains bulk actions to:

- publish PENDING_REVIEW/REJECTED;
- reject;
- hide.

### Problems with admin moderation

Bulk update:

- does not use optimistic version;
- does not create the normal marketplace audit event;
- reject action stores no rejection reason;
- seller notification is not evident;
- image/listing moderation are separate and can drift.

## Final moderation flow

DRAFT
→ SUBMITTED
→ PENDING_REVIEW
→ APPROVED/PUBLISHED
or
→ REJECTED_WITH_REASON
→ seller edits
→ resubmits.

Moderator action must write:

- reviewer;
- reason;
- safe diff;
- reviewed_at;
- version;
- audit event;
- notification.

---

# 46. Marketplace images

Upload limits and image moderation exist.

Public serializer only returns APPROVED images with derivative assets.

This is good privacy/moderation behavior.

## Missing integration

Listing publication should explicitly define:

- whether at least one approved image is required by category;
- whether pending/rejected images block publication;
- how seller sees image rejection reason.

---

# 47. Marketplace publication/withdraw/archive

Current actions:

DRAFT/REJECTED
→ submit
→ PENDING_REVIEW or PUBLISHED.

PUBLISHED/PENDING_REVIEW
→ withdraw
→ publication WITHDRAWN
and availability WITHDRAWN.

Model also contains:

HIDDEN
ARCHIVED.

No complete seller-facing archive/relist lifecycle is exposed.

## Final desired lifecycle

DRAFT
→ PENDING_REVIEW
→ PUBLISHED/AVAILABLE
→ RESERVED
→ COMPLETED
→ ARCHIVED.

Alternative:

PUBLISHED
→ WITHDRAWN
→ RELISTED/PUBLISHED if seller reopens.

Moderation:

PUBLISHED
→ HIDDEN
→ restored or archived.

---

# 48. Marketplace discovery bug

public_listings currently returns PUBLISHED listings unless availability is WITHDRAWN or EXPIRED.

Therefore it includes:

- AVAILABLE;
- RESERVED;
- COMPLETED.

Final query should have explicit modes:

### Browse available
PUBLISHED + AVAILABLE.

### Direct historical/detail link
May show RESERVED/COMPLETED with non-actionable status if policy allows.

Do not let COMPLETED listings remain ordinary catalogue results.

---

# 49. Marketplace enquiry and private communication

## Current creation

Eligible buyer POSTs enquiry with client_request_id.

Backend:

1. checks CONTACT feature flag;
2. requires listing PUBLISHED + AVAILABLE;
3. evaluates buyer contact policy;
4. requires idempotency key;
5. creates MarketplaceExchange ENQUIRY;
6. creates buyer/seller participant records;
7. optionally creates first message;
8. stores request receipt.

This is a good first transaction.

## Messages

Both participants can fetch/post private exchange messages.

## Missing communication maturity

MarketplaceNotificationOutbox model exists, but inspected marketplace task/signal code does not yet show a complete outbox processor driving exchange notifications.

Need event notifications for:

- new enquiry;
- new terms;
- accepted;
- declined;
- cancelled;
- reservation expiring;
- completion requested;
- report/moderation.

Also define message availability after terminal states. Today messages are not visibly state-gated.

---

# 50. Marketplace negotiation

Model supports:

- proposed_terms;
- agreed_terms;
- TERMS_PROPOSED.

Serializer advertises propose-terms.

## Frontend gap

GoodsExchangeManager does not render a propose-terms editor/action. It renders:

- message;
- accept;
- decline;
- confirm completion;
- cancel.

So structured terms negotiation is backend-visible but not product-complete.

## Backend defect

For propose-terms/decline/cancel, ExchangeAction does not enforce the same role/state matrix returned by allowed_actions.

Final state machine:

ENQUIRY
→ buyer/seller PROPOSE_TERMS version N
→ counterparty explicitly ACCEPT_TERMS version N
→ ACCEPTED.

Store:

- proposal version;
- proposer;
- exact terms;
- proposed_at;
- accepted_by;
- accepted_at.

A message is not a substitute for structured agreed terms.

---

# 51. Marketplace reservation

accept_exchange is strong:

- idempotency receipt;
- locks exchange/listing;
- seller authority;
- optimistic version;
- only ENQUIRY/TERMS_PROPOSED;
- blocks another active reservation;
- creates reservation;
- listing → RESERVED;
- exchange → ACCEPTED;
- agreed_terms snapshot;
- audit.

## Broken release path

Reservation has:

- active;
- expires_at;
- release_reason.

But current cancel path does not reliably deactivate it or restore listing.

## Final required reservation service

reserve_listing(exchange)
release_reservation(exchange, reason)
expire_reservations(now)
complete_reservation(exchange).

All cancellation/decline/timeout paths must call the same service transactionally.

---

# 52. Marketplace completion

Current:

either party can confirm completion in ACCEPTED/AWAITING_COMPLETION.

When both confirm:

- exchange → COMPLETED;
- listing availability → COMPLETED.

## Missing

- reservation release;
- AWAITING_COMPLETION transition is not clearly entered;
- dispute path;
- quantity semantics if listing quantity > 1;
- handover/delivery confirmation;
- payment tracking if ChemistTasker later mediates payment;
- post-completion rating eligibility;
- automatic archive/relist.

---

# 53. Marketplace internal transfers

For ordinary pharmacy-owned goods:

PROPOSED
→ AUTHORISED
→ IN_TRANSIT
→ RECEIVED.

Cancel only from PROPOSED.

Transitions enforce source state + expected_version.

This is actually stricter than the generic exchange endpoint.

## Mature additions

- dispatch/receive actor and timestamp;
- transfer document/evidence;
- discrepancy;
- partial receipt;
- inventory linkage if these goods become inventory-accounted.

---

# 54. Marketplace report/moderation

Reports can be created, including anonymous reports, and have OPEN status.

No full product workflow was found for:

OPEN
→ TRIAGED
→ ACTIONED/DISMISSED
→ CLOSED.

Add:

- moderator;
- reason;
- action;
- content/listing freeze;
- seller notice;
- appeal where appropriate.

---

# 55. General marketplace final acceptance criteria

Do not call this domain final until:

- [ ] server enforces every exchange source-state/action/actor transition;
- [ ] cancel/decline/expiry releases reservation;
- [ ] reserved listing can safely recover;
- [ ] completed listing leaves active discovery;
- [ ] reservation TTL worker exists;
- [ ] terms proposal UI exists;
- [ ] published revision workflow exists;
- [ ] moderation records reason/audit/notification;
- [ ] quantity/partial exchange semantics are defined;
- [ ] AWAITING_COMPLETION has a real transition;
- [ ] terminal-state message policy is defined;
- [ ] reports can be resolved;
- [ ] notification outbox is operational;
- [ ] mobile strategy is explicit.

---

# 56. Ethical marketplace — intended product boundary

This must remain a separate private workflow from ordinary goods.

The code correctly separates medicines/ethical stock from public marketplace categories.

Mature lifecycle:

PHARMACY VERIFIED
→ authorized person/grant
→ product/catalogue verification
→ lot/provenance import
→ reconciled available stock
→ owner listing draft
→ owner publish
→ restricted buyer discovery
→ transfer request
→ stock reservation
→ review/agreement
→ authorization for dispatch
→ dispatch + source stock movement
→ receive + destination stock movement
→ discrepancy/quarantine if needed
→ transfer closed
→ listing quantity/state reconciled
→ immutable audit retained.

---

# 57. Ethical pharmacy access

EthicalPharmacyApproval states:

NOT_SUBMITTED
PENDING_REVIEW
VERIFIED
REJECTED
REVERIFY_REQUIRED
SUSPENDED
REVOKED.

Professional access and owner-issued admin grants add capability scope and expiry/revocation.

## Backend achieved

- pharmacy approval submission;
- owner confirmation;
- capability policy;
- explicit grant/revoke;
- owner-only grant control;
- active PharmacyAdmin target checks.

## Missing product path

The platform review that takes PENDING_REVIEW to VERIFIED is not represented as a full first-class end-user/admin workspace in the inspected client route set.

This may currently depend on Django admin/back office.

For a mature regulated workflow, expose a dedicated reviewer queue with:

- evidence;
- reviewer;
- decision reason;
- expiry/reverification;
- suspension/revocation;
- audit.

---

# 58. Ethical inventory import

CSV staging/commit is substantial.

Import:

- bounded file size;
- source-rights attestation;
- whitelisted data;
- staging rows;
- row limits.

Commit:

- resolves approved products;
- validates batch/expiry/quantity;
- creates/updates lots;
- prevents reducing below reserved quantity;
- creates stock movement;
- records COMMITTED/PARTIAL/REJECTED outcomes.

This is real inventory ingestion logic.

---

# 59. Ethical lots

Lots track:

- product;
- batch/expiry;
- on_hand;
- reserved;
- status;
- version;
- provenance/reconciliation.

Listing creation requires reconciled available stock.

This is correct: listing is derived from stock, not a free-text quantity claim.

---

# 60. Ethical listing

Statuses:

DRAFT
PUBLISHED
RESERVED
WITHDRAWN
COMPLETED
QUARANTINED.

Visibility circle:

CHAIN_PHARMACIES
ORGANISATION_OWNERS
PLATFORM_OWNERS.

## Create

Requires admitted PREPARE_LISTING capability.

Backend checks:

- approved product;
- regulatory/capability policy;
- S8 platform ceiling;
- reconciled available lot;
- requested quantity <= available.

Creates DRAFT.

## Publish

Owner/accountable authority required.

DRAFT
→ PUBLISHED.

## Escalate

PUBLISHED → broader allowed circle, bounded by maximum and product policy.

## Withdraw

PUBLISHED/RESERVED
→ WITHDRAWN.

## Web

Next ethical workspace exposes:

- access;
- inventory;
- listings;
- new listing;
- transfers;
- grants/approval UX.

## Mobile

No full equivalent native ethical workspace.

Web-first is reasonable given complexity, but mobile should deep-link rather than partially reimplement policy.

---

# 61. Ethical transfer request and stock reservation

Transfer request:

1. listing must be PUBLISHED;
2. destination must have REQUEST_TRANSFER permission;
3. source != destination;
4. S8 same-organization policy enforced;
5. idempotency key;
6. row locks stock;
7. creates transfer and lines;
8. creates reservations;
9. increments reserved quantity;
10. listing → RESERVED.

This is a strong start.

---

# 62. Ethical transfer transitions

The inspected server enforces source state + expected_version for important actions.

REQUESTED / REVIEWED
→ AGREE
→ AGREED.

AGREED
→ AUTHORISE
→ AUTHORISED_FOR_DISPATCH.

AUTHORISED_FOR_DISPATCH
→ DISPATCH
→ DISPATCHED.

DISPATCH:

- locks lots;
- reduces reserved;
- reduces on_hand;
- creates movement;
- deactivates/release reservation;
- stamps dispatch.

DISPATCHED
→ RECEIVE
→ RECEIVED.

Pre-dispatch states may cancel and release reservations.

This is materially better than the ordinary marketplace generic exchange action.

---

# 63. Ethical critical missing stock-receipt logic

The inspected receive path changes the transfer to RECEIVED but does not complete destination inventory.

Final receive must atomically:

1. record actual received quantities by line;
2. create/increment destination lot;
3. preserve source batch/expiry/product provenance;
4. create destination RECEIVE stock movement;
5. handle short/over/damaged quantity;
6. route mismatch to DISCREPANCY/QUARANTINED;
7. close transfer only when resolved.

Without this, the inventory ledger loses stock between pharmacies.

**Priority P0.**

---

# 64. Ethical listing/transfer reconciliation gap

After transfer cancellation or receipt, reconcile listing:

If cancelled before dispatch:
RESERVED → PUBLISHED, assuming quantity remains available.

If full quantity dispatched/received:
listing → COMPLETED.

If partial:
- decrement remaining listed quantity;
- listing → PUBLISHED with remaining quantity.

If discrepancy/quarantine:
- affected quantity unavailable;
- listing state reflects safe remainder.

Currently listing and transfer state can diverge.

**Priority P0.**

---

# 65. Ethical model states that are not yet full product states

Models contain useful states such as:

- REVIEWED;
- DECLINED;
- EXPIRED;
- QUARANTINED;
- DISCREPANCY.

But the current action surface does not provide a complete path through every state.

Do not count a state enum as implemented behavior.

For each state define:

- who can enter it;
- from what source states;
- required reason/evidence;
- stock effect;
- listing effect;
- notification;
- next legal actions.

---

# 66. Ethical documents and messages

Transfer messages and documents exist with protected access.

## Missing maturity

- message policy after terminal transfer;
- required document checklist by transfer/product type;
- immutable final document bundle;
- malware/file validation beyond size/type where applicable;
- discrepancy evidence attachments;
- document retention and audit hash.

---

# 67. Ethical marketplace final acceptance criteria

- [ ] reviewer workflow completes pharmacy verification lifecycle;
- [ ] every transfer state is reachable only through explicit allowed transition;
- [ ] receive creates destination stock;
- [ ] discrepancy path exists;
- [ ] quarantine path exists;
- [ ] expiry task exists;
- [ ] listing quantity/state reconciles after every transfer outcome;
- [ ] source and destination stock movement ledgers balance;
- [ ] required docs are enforced;
- [ ] notifications/outbox cover transfer events;
- [ ] reports/suspension feed access instantly;
- [ ] mobile/web strategy is explicit.

---

# 68. Public job board and shared shift links

## Current

Backend/shared-core exposes:

- public job board;
- public shift detail;
- generated share link;
- shared shift landing.

Web has PublicJobBoardPage and SharedShiftLandingPage.

## Intended lifecycle

Owner publishes/escalates shift
→ public privacy-safe listing
→ share token/link
→ anonymous visitor views allowed fields
→ sign-in/onboarding handoff
→ returns to original shift
→ interest.

## Remaining

- explicit share-link expiry/revocation;
- deep-link preservation after registration/onboarding;
- no private pharmacy data leakage when anonymous;
- canonical/SEO policy for public shift pages;
- closed/filled link behavior should be informative but non-actionable.

---

# 69. Ratings

## Current backend

Directions:

OWNER_TO_WORKER
WORKER_TO_PHARMACY.

One editable relationship-level rating per rater/target/direction.

Owner/admin eligibility currently checks whether any ShiftSlotAssignment exists at a controlled pharmacy.

Worker eligibility checks whether any assignment exists at the pharmacy.

pending() uses past slot_date to suggest ratings.

## Defect in business meaning

Methods are named _has_completed_relationship..., but they do not require completion.

An assignment alone can qualify.

Therefore:

- future assignment can satisfy create eligibility in helper;
- cancelled/no-show/past assignment can be rateable;
- attendance/timesheet completion is ignored.

## Final eligibility

A relationship becomes rateable only from a completed work outcome, e.g.:

assignment
+ occurrence ended
+ not cancelled/no-show
+ attendance/timesheet completion policy.

Then create an immutable RatingEligibility record referencing the qualifying work relationship.

## Missing maturity

- report/dispute;
- moderation;
- freeze/edit window;
- anti-retaliation/privacy policy;
- rating deletion/anonymisation;
- minimum-count display rules if desired.

---

# 70. Pill rewards / loyalty

Backend has a meaningful rules/history/referral/claim surface.

Do not let points become a mutable integer with side effects scattered across actions.

Final source should be an immutable ledger:

EARN
REVERSE
REDEEM
EXPIRE
ADJUST.

Balance = sum ledger.

Every reward-producing event should have a deduplication key.

If this already exists under the current model, expose it consistently; if not, move toward this rather than adding more balance mutations.

---

# 71. Learning

## Existing

- public Next learning surface;
- Vite LearningMaterialsPage;
- mobile learning route for staff.

## Backend

No equally distinct LMS domain was found.

## Interpretation

If learning is editorial/static content:

**Current architecture is acceptable.**

If ChemistTasker intends:

- enrolment;
- progress;
- quiz;
- assessment;
- certificate;
- CPD record;
- expiry/renewal;

then those are not implemented by having a learning page.

Create a dedicated learning domain only when those product requirements exist.

---

# 72. Shared-core and endpoint ownership

Shared-core already contains:

- endpoint constants;
- platform endpoints;
- marketplace contracts;
- ethical marketplace contracts;
- workforce contracts;
- attendance/roster contracts;
- transport/client;
- finance types/helpers.

This is the right direction.

## Problem

There are still two broad endpoint registries:

- shared-core/src/constants/endpoints.ts;
- shared-core/src/constants/platformEndpoints.ts.

And legacy/new backend route families coexist.

## Required contract policy

1. each domain owns one endpoint object;
2. legacy endpoints are explicitly tagged deprecated;
3. frontend code cannot hardcode /api paths outside approved transport;
4. CI resolves every shared endpoint against Django;
5. generated OpenAPI/contract tests compare request/response where practical;
6. Vite and mobile use the same domain contract.

---

# 73. Duplicate/legacy architecture that should be retired carefully

Do not delete blindly. Use dependency tests and staged migration.

## Areas

### Roster
legacy client_profile + workforce revision API.

### Leave
legacy LeaveRequest + WorkforceLeaveRequest.

### Finance
legacy Invoice endpoints + worker_finance workspace.

### UI
.backup files in active source trees.

### Shift member_status
dead code after early return.

### Role wrappers
mobile app/* and roles/* are fine only if app files remain thin route adapters.

---

# 74. What “complete” means for each domain

Every consequential domain should pass this checklist.

## Source of truth

- [ ] one authoritative entity/aggregate;
- [ ] no copied competing identity;
- [ ] database constraints for uniqueness;
- [ ] effective dates where terms change over time.

## State machine

- [ ] every state has a documented meaning;
- [ ] every transition has explicit allowed source state;
- [ ] actor permission enforced server-side;
- [ ] transition payload validated;
- [ ] terminal states cannot accidentally reopen;
- [ ] cancellation side effects are symmetric.

## Concurrency

- [ ] row locks or unique constraints around scarce resources;
- [ ] optimistic version for user-edited aggregates;
- [ ] idempotency keys for retryable POST/financial action.

## Side effects

- [ ] notifications;
- [ ] email if required;
- [ ] audit event;
- [ ] dependent projections updated;
- [ ] background task retry.

## Client parity

- [ ] web action exists where product requires it;
- [ ] mobile action exists or is explicitly web-only;
- [ ] UI cannot promise a behavior backend does not implement;
- [ ] client never decides security/transition legality.

## History

- [ ] no operational hard-delete;
- [ ] previous revisions retained;
- [ ] archive rather than erase;
- [ ] actor/reason/timestamp for consequential changes.

## Tests

- [ ] model invariant;
- [ ] service transition;
- [ ] permission matrix;
- [ ] API transition;
- [ ] idempotency;
- [ ] concurrency;
- [ ] web integration;
- [ ] mobile integration where applicable;
- [ ] full E2E happy path;
- [ ] failure/recovery E2E.

---

# 75. Recommended implementation order based on actual logic risk

## Checkpoint 1 — P0 integrity fixes before adding features

### General marketplace

1. central Exchange state-transition service;
2. release reservation on cancel/decline/expiry where applicable;
3. restore/reconcile listing availability;
4. exclude COMPLETED from active public discovery;
5. reservation expiry worker;
6. structured terms transition enforcement.

### Ethical marketplace

7. destination inventory receipt movement;
8. listing quantity/state reconciliation;
9. discrepancy/quarantine completion paths.

### Shifts/billing

10. restore History past-date predicate;
11. fix multi-slot direct claim scope;
12. apply subscriber shift price correctly.

### Membership

13. replace destructive Membership DELETE with end/deactivate transition.

These fixes should precede new visual work.

---

## Checkpoint 2 — close state-machine holes

### Marketplace

- reviewed revisions;
- moderation reason/audit/notification;
- relist/archive;
- report resolution;
- exchange terms editor;
- completion/dispute.

### Roster

- authoritative mutation API;
- immutable published snapshots;
- amendment + acknowledgement reset.

### Finance

- void;
- credit note/refund;
- outstanding balance;
- reconciliation.

### Billing

- subscription cancel/reactivate;
- seat resize;
- billing portal/history.

---

## Checkpoint 3 — workforce completion

- unify leave;
- employment terms worker acceptance;
- pay-run product decision;
- if payroll is in scope, implement pay run → payslip → STP/payment lifecycle;
- otherwise rename features to “payroll-ready/export” and build export integrations.

---

## Checkpoint 4 — maturity and client parity

- mobile marketplace strategy;
- mobile manager attendance/roster strategy;
- availability backend validation;
- ratings completion correctness;
- hub/chat moderation;
- learning scope decision;
- remove verified backup/dead/legacy code.

---

# 76. End-to-end E2E scenarios the repository should prove

## E2E 1 — staff application to worked payroll-ready shift

1. owner creates staff invite link;
2. worker submits application;
3. owner reviews/editable fields;
4. identity fields stay immutable;
5. worker account is linked;
6. TFN profile gate;
7. Award preview;
8. employment engagement created;
9. worker receives terms;
10. roster assignment;
11. publish + acknowledgement;
12. QR/PIN clock in;
13. breaks;
14. clock out;
15. timesheet recalculation;
16. worker submit;
17. manager approve;
18. period lock;
19. correct PAYROLL manifest routing.

If actual payroll is in scope, continue through pay run/payslip.

---

## E2E 2 — public shift to invoice

1. owner posts multi-slot public shift;
2. worker applies to one slot;
3. owner reveals;
4. worker counter-offers;
5. owner accepts counter-offer into ShiftOffer;
6. worker accepts engagement terms;
7. billing finalizes;
8. assignment created;
9. competing offer expires;
10. shift appears Confirmed, not History;
11. attendance occurs;
12. history appears after completion;
13. settlement channel INVOICE;
14. invoice prefills exact assignment/rate snapshot;
15. worker saves/sends;
16. owner receives;
17. owner requests revision;
18. worker revises;
19. owner approves;
20. payment allocation closes invoice.

---

## E2E 3 — ordinary marketplace sale/exchange

1. verified seller creates DRAFT;
2. uploads photos;
3. submits;
4. reviewer approves;
5. listing appears AVAILABLE;
6. eligible buyer enquires;
7. parties exchange private messages;
8. buyer proposes structured terms;
9. seller accepts exact proposal version;
10. reservation created;
11. listing removed from available discovery;
12. one side cancels;
13. reservation releases;
14. listing returns AVAILABLE;
15. second buyer enquires;
16. seller accepts;
17. both confirm handover;
18. listing COMPLETED;
19. listing leaves discovery;
20. archived history retained.

The current code cannot yet pass this scenario because of reservation/recovery/transition holes.

---

## E2E 4 — ethical transfer

1. source pharmacy VERIFIED;
2. authorized user imports lot;
3. lot reconciled;
4. owner creates listing;
5. owner publishes within visibility ceiling;
6. destination authorized pharmacy requests;
7. lot quantity reserved;
8. source agrees/authorizes;
9. dispatch decrements source;
10. chain-of-custody document attached;
11. destination receives exact quantities;
12. destination lot/movement created;
13. reservation cleared;
14. transfer RECEIVED;
15. listing completes or reopens remaining quantity;
16. both inventory ledgers balance.

The current receive flow is incomplete at step 12.

---

## E2E 5 — roster amendment

1. manager builds draft r1;
2. validate;
3. acknowledge warnings;
4. publish r1;
5. workers notified;
6. worker acknowledges;
7. manager changes Tuesday;
8. draft becomes r2;
9. r1 snapshot remains immutable;
10. only affected worker acknowledgement becomes stale;
11. publish r2;
12. worker receives change notice;
13. attendance links to r2 assignment;
14. audit can reconstruct both versions.

---

## E2E 6 — finance/BAS

1. external customer created;
2. reusable service item created;
3. invoice draft;
4. preview;
5. save revision 1;
6. send;
7. provider acceptance recorded;
8. partial payment;
9. outstanding balance visible;
10. second payment closes invoice;
11. business expense + receipt;
12. credit note/refund scenario;
13. BAS accrual worksheet;
14. BAS cash worksheet;
15. source drill-down explains each figure.

Current product is strong through steps 1–11 except outstanding-status derivation needs strengthening; credit-note/reconciliation steps remain missing.

---

# 77. Final assessment by domain — not a page-count score

| Domain | What is genuinely achieved | What blocks “final” |
|---|---|---|
| Auth/verification | Full core identity entry flows | unify capability model; deletion retention |
| Pharmacy/org | Broad management and scoped authority | archive/deactivation semantics; permission matrix |
| Membership applications | Detailed invite/apply/review/approve/reject | destructive Membership delete; favourite relation semantics |
| EmploymentEngagement | Strong effective-dated Award/above-Award snapshots | worker acceptance/e-sign; termination/change workflow |
| Shift posting | Broad web/mobile posting/visibility | formal occurrence lifecycle |
| Interest/counter-offer | Real applications and counter-offers | central concurrency/state service |
| Active shifts | Rich operational UI | derived-state complexity/dead code |
| Confirmed shifts | Correct future assignment concept | share common occurrence projection |
| History | UI/API exists | **future shifts can appear due commented date filter** |
| Shift billing | checkout/penalty/subscription concepts | **subscriber discount bug**; cancellation atomicity |
| Availability | web/mobile strong | backend validation/timezone/overlap |
| Talent board | broad web/mobile | privacy/indexing/match rules maturity |
| Roster | very strong workflow + new revision layer | two generations; immutable published snapshots |
| Attendance/kiosk | one of strongest domains | mobile parity/device ops/retention |
| Leave | new strong workflow | legacy/new duplication |
| Timesheets | strong revision/check/approval/lock | payroll execution downstream |
| Payroll | employment/time/export foundations | **actual payroll engine absent** |
| Invoices | strong revision/send/review/super flow | credit/void/reconciliation/outstanding lifecycle |
| Customers/items | present in finance workspace | accounting polish, not absence |
| Expenses/receipts | present web/backend/mobile shared finance | archive + partial supplier payment |
| BAS | real worksheet | intentionally not lodgement-ready/full accounting |
| Subscription | Stripe/webhook/basic seats | **discount mismatch**, cancellation/seat resize/history |
| Chat | full web/mobile | Membership deletion destroys history; moderation/attachments |
| Notifications | broad | standard structured schema/dedupe |
| Calendar | broad web/mobile | recurrence exceptions/timezone maturity |
| Work notes | real backend/client flow | permission granularity |
| Pharmacy Hub | strong web/mobile scoped social product | moderation/retention |
| Blog | strong public web | publishing operations maturity |
| Editorial CMS | sophisticated revision workflow | rollback/diff/ops visibility |
| General marketplace | broad backend + Next UI | **state-machine/reservation/moderation/revision defects** |
| Ethical marketplace | sophisticated policy/inventory/transfer | **destination receipt + listing reconciliation** |
| Ratings | relationship ratings implemented | assignment ≠ completed work |
| Rewards | broad utility | immutable ledger/fraud maturity |
| Learning | useful content surfaces | no LMS if progression/certification is desired |
| Public job board | strong public shift entry | token/deep-link lifecycle |

---

# 78. The product-level conclusion

ChemistTasker does **not** mainly suffer from “backend exists, frontend missing”.

The deeper reality is:

1. Many domains already have a surprisingly complete frontend.
2. Several newer backend domains are architecturally strong.
3. The most dangerous remaining gaps are **between states**, not between pages.
4. Some model enums create the appearance of completeness even though no safe transition reaches them.
5. Some clients advertise business behavior that backend does not yet honor.
6. Legacy hard-delete and duplicate API generations can undermine newer audit-safe architecture.

The next engineering phase should therefore stop using “screen built” as the definition of done.

For each domain, implementation should proceed by an explicit aggregate/state-machine contract:

**actor → command → allowed source state → transaction/lock → target state → side effects → audit → notification → client projection → failure recovery.**

That is the standard required to finish ChemistTasker end to end without adding another layer of duplicated or contradictory logic.
