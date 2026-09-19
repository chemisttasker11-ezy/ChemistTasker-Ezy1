# EmploymentEngagement / Membership / Payroll Progress

Last updated: 2026-09-19 16:00+ AEST (Australia/Brisbane)

## Current branch

- Branch: `workforce/employment-engagement-20260919`
- Draft PR: #3
- Preserved head before this progress checkpoint: `22c2001cbb7d10ea53ec8dec78c739636e2e6bb2`
- Base branch: `senior-hardening/checkpointed-refactor-20260919`
- PR remains draft.

## User direction now in force

The implementation must converge the staff/favourite membership workflows around one canonical worker identity and avoid duplicate shadow records.

### Membership / favourite application

- Pharmacy owner/admin may invite a person directly.
- Pharmacy owner/admin may generate a membership link.
- A worker using the generated link submits a pending MembershipApplication.
- Pending applications must not duplicate an existing Membership or another pending application for the same pharmacy/person.
- Owner/admin reviews all submitted details before acceptance.
- Applicant identifiers are locked after submission:
  - email
  - mobile number
  - date of birth
  - username
- Employment-facing fields may be corrected by the authorised owner/admin before acceptance.
- Owner/admin edits must be audited field-by-field.
- Acceptance correspondence must show what the owner/admin changed.
- Rejection must email/notify the applicant.
- Approved application must link to the canonical Membership rather than create duplicate profile data.

### ChemistTasker Payroll opt-in

- Pharmacy-level option: **Use ChemistTasker Payroll**.
- Default is OFF for existing/new pharmacies until intentionally enabled.
- When OFF:
  - no Award classification or ChemistTasker rate entry is required for ordinary pharmacy staff;
  - roster, attendance and timesheets continue;
  - timesheets are the hand-off point to the pharmacy's own payroll system;
  - direct pharmacy staff roster assignment must NOT require a dated EmploymentEngagement.
- When ON:
  - dated EmploymentEngagement terms are required for ChemistTasker payroll;
  - owner/admin supplies Award classification and Award/above-award agreed rates;
  - TFN/super readiness is required before payroll processing;
  - accepted employment/pay terms should be included in acceptance correspondence.
- ABN workers remain invoice-routed.
- External/favourite/marketplace workers still use per-shift offer acceptance and freeze the final agreed shift rate/terms.
- External TFN shift terms remain employee terms, but settlement is:
  - PAYROLL when ChemistTasker Payroll is ON;
  - TIMESHEET_ONLY when it is OFF.
- ABN remains INVOICE settlement.

## Commits completed in this resumed session

### `f82acb45f3c314e9d2435213a5a1641095385c0e`
**feat(memberships): audit application review and add payroll opt-in**

Implemented:

- `Pharmacy.use_chemisttasker_payroll` boolean, default false.
- MembershipApplication audit fields:
  - `pending_identity_key`
  - `submitted_snapshot`
  - `review_changes`
  - `reviewed_at`
  - `reviewed_by`
  - `approved_membership`
- Added index on pharmacy/email/status.
- Added migration:
  - `backend/client_profile/migrations/0054_membership_application_review_payroll_optin.py`
- Link-submitted application duplicate protections:
  - existing Membership at the same pharmacy blocks a new application;
  - same pending email/pharmacy blocks another application;
  - same pending mobile + DOB/pharmacy blocks another application.
- Added application submission snapshot.
- Added separate owner/admin review serializer.
- Locked identifiers after submission:
  - email
  - mobile
  - DOB
  - username
- Owner/admin can edit review/employment fields while application is pending.
- Review changes are stored field-by-field with old/new value, editor and timestamp.
- Direct owner invite now refuses to create a duplicate Membership when a pending application already exists for that email/pharmacy.
- Approved application links to the created/updated canonical Membership.
- Rejected application now queues a rejection notification task hook.
- Award/classification fields in MembershipApplication are only mandatory when the pharmacy has ChemistTasker Payroll enabled.
- Job title remains required for pharmacy staff applications.

### `6218d6b7f3dae35572ce85d108d4ec52b95ce5b8`
**feat(workforce): make ChemistTasker payroll opt-in**

Implemented:

- New settlement channel constant:
  - `TIMESHEET_ONLY`
- Direct pharmacy staff assignment:
  - payroll OFF -> no EmploymentEngagement gate, assignment routes TIMESHEET_ONLY;
  - payroll ON -> existing strict EmploymentEngagement/payroll path remains.
- Existing pharmacy staff accepting/being included in offer paths:
  - PAYROLL when payroll ON;
  - TIMESHEET_ONLY when payroll OFF.
- External TFN offer terms:
  - PAYROLL when payroll ON;
  - TIMESHEET_ONLY when payroll OFF.
- External ABN remains INVOICE.
- Per-shift agreed rate now falls back in this order:
  - accepted offer rate;
  - slot rate;
  - shift fixed rate.
- Added workforce payroll configuration API:
  - GET/PATCH `/client-profile/workforce/payroll-configuration/`
- Payroll config API returns human-readable requirements for:
  - staff EmploymentEngagement terms,
  - TFN/super data,
  - payroll-off behaviour,
  - ABN invoicing.
- Timesheet EmploymentEngagement checks now only run when ChemistTasker Payroll is enabled.
- Timesheet snapshot records the pharmacy payroll mode.

## Existing related commits still part of this PR

- `47032b16620c59551f296529bb1693c843efae92` DOB-derived junior Award rates.
- `2a6331c4a9b754c76135382e4da9aa47c8dd12ad` DOB added to membership application UI/contracts.
- `16fe7548810272ea49e9b27edf99cd24d8316d64` immutable shift engagement routing snapshots.
- `83e6fb2809ae16bf9e72943b61e0e1e0d586ebf8` accepted shift terms + settlement route.
- `ed0b66e1facd191576221120da5282ffd060d6ed` cross-platform terms confirmation UI.
- `85b8863a542730abc8ad13bd987a338e66ee2b8f` web terms acceptance.
- `a989c6bfe8b75ce4e0296e97b32254f8361a31e8` mobile terms acceptance.
- `245f55ae048e40bd89e0718aca6cff0c655d1ffd` dated employee engagement boundary for direct roster assignment.
- `aed92651f83a09da1e2c2274b5bcf0bd4d43033b` external workers forced through offer acceptance.

## Current remaining work after production-blocker closure

The production blockers found in the final PR #3 source review have now been addressed in code. The remaining items are validation/release sequencing and future payroll-engine work, not a second implementation of the same membership/engagement logic.

1. **Execute the new head through runners once GitHub Actions allocates steps**
   - The previous stacked PR #3 head passed the full clean-checkout suite.
   - The new production-blocker fixes have **not** yet executed in Actions because current repository jobs are ending before a runner step is allocated (zero steps, no job logs).
   - Latest affected runs at this checkpoint: Shared Core Consolidation 35427741247 and Mobile Lint 35427741224. A direct Mobile Lint retry also ended with zero steps.
   - Do not call the new head green until these commands actually execute.
   - GitHub's public status page showed Actions operational, so this is recorded as a repository/account/runner-allocation validation blocker, not as a code-test failure.

2. **Future ChemistTasker payroll processor**
   - The repository still does not contain the final wage-run/STP payroll processor.
   - When introduced, it must consume only assignments explicitly routed to PAYROLL; TIMESHEET_ONLY and INVOICE must fail closed.
   - Marketplace TFN terms now freeze the worker-specific Award/above-Award basis needed by that future processor.
   - TIMESHEET_ONLY remains the deliberate hand-off to the pharmacy's own payroll system.

3. **Fair Work rate maintenance**
   - Current code is aligned to the Pharmacy Industry Award state effective from 1 July 2026 and the current clause 16.2 junior percentages.
   - Fair Work has announced further junior-wage changes for ages 18–20 but, as of this review date, says the changes are still being introduced with further detail/timing to be confirmed.
   - Refresh the Award resolver when final effective rules are published; do not implement speculative future percentages/dates.

4. **Next phase after executable validation**
   - Preservation/security audit: endpoint permission matrix, anonymous-route preservation, object-level authorization/IDOR tests, upload and sensitive-field review.
   - Source-size caps remain intentionally removed; large-file splitting is a refactor target, not a CI byte-budget gate.

### Production blockers closed in this final pass

#### Junior Pharmacy Award rates
- Fixed the age selector that incorrectly collapsed ages 16–20 to the under-16 percentage.
- Current mapping: under 16 -> 45%, 16 -> 50%, 17 -> 60%, 18 -> 70%, 19 -> 80%, 20 -> 90%, 21+ -> adult.
- Added boundary regression coverage across ages 15–21 and corrected the inconsistent 19-year-old expectation.

#### Marketplace / favourite TFN engagement
- **Other staff:** reuses the classification already captured at public-platform onboarding; no duplicate classification source was created.
- Assistant/technician uses onboarding classification level; intern uses first/second half; pharmacy student uses course year.
- Existing post-shift owner_adjusted_rate is applied on top of the worker-specific applicable casual Award floor.
- Frozen final other-staff rate is the higher of the negotiated/posted rate and Award floor + owner bonus.
- **Pharmacists:** marketplace TFN is a per-shift casual employee engagement; the final agreed hourly rate must be above the applicable casual Pharmacist Award floor. No higher pharmacist classification is guessed.
- Pharmacy payroll OFF -> accepted TFN shift is TIMESHEET_ONLY and ChemistTasker records the casual agreement/terms.
- Pharmacy payroll ON + TFN/super ready + no Award review flag -> PAYROLL.
- Pharmacy payroll ON + incomplete TFN/super -> assignment is not blocked; it is accepted as TIMESHEET_ONLY with payroll setup DEFERRED.
- Award/overtime review may also defer payroll without blocking assignment.
- Added owner/admin activate-payroll utility plus web and mobile confirmed-shift UI.
- Activation is stored separately from the frozen accepted terms and can be copied into an assignment created later after fulfillment.

#### ABN invoice integration
- Reuses the existing canonical client_profile Invoice / InvoiceLineItem lifecycle rather than creating a second invoice engine.
- Accepted ABN labour is rebuilt server-side from frozen accepted assignment terms.
- Invoice.source_snapshot stores exact assignment ids, shift ids, offer ids, settlement route, acceptance time and frozen accepted terms.
- InvoiceLineItem.source_assignment ties each labour line to the exact accepted assignment.
- A database conditional unique constraint prevents two ProfessionalServices lines for the same assignment.
- Internal generation is transactional, row-locks accepted invoice-routed assignments and rejects already invoiced work.
- The newer worker_finance workspace wraps the **same canonical Invoice** through InvoiceRecord; it does not clone it.
- Accepted labour rows and the pharmacy/customer are locked in the new web/mobile editors; reimbursements and separately reviewed super remain editable while draft.
- Duplicating an internal invoice strips source identities and produces a clean external/editable draft.
- Legacy send is row-locked/idempotent and freezes the newer finance wrapper too; both old and new editors respect issuance locks.
- The existing recipient/email/PDF lifecycle remains the sending mechanism.

#### Super / invoice total reconciliation
- One canonical total calculation is shared by legacy invoice create/update paths.
- Worker payable is consistently services/reimbursements + GST; super is tracked separately.
- Contractor super_review_required no longer means super is automatically payable; accepted ABN terms also carry super_payable_confirmed=false until separately reviewed.
- Reviewed super can still be represented manually or via the newer workspace's summary/separate-super mode.
- Legacy PDF now reads stored canonical totals and labels super separately.
- Billed shift hours are rounded to the actual 2-decimal InvoiceLineItem.quantity precision before money calculation, preventing partial-hour drift.
- Default super snapshot for **new** legacy invoices is now 12%; historical snapshots are untouched.

#### PostgreSQL concurrency coverage
- Added PostgreSQL-backed test settings and a postgres-concurrency CI job.
- Tests cover concurrent same-identity membership applications and concurrent attempts to invoice the same accepted ABN assignment.
- The job performs a PostgreSQL migration rehearsal first and is now required by the release gate.
- SQLite contract coverage was expanded for classified TFN routing, bonus/floor rules, pharmacist above-Award enforcement, deferred payroll activation, invoice snapshots/idempotency, partial hours, super, and old/new invoice immutability.
## Known design constraints

- Keep both Vite and Next. Do not rewrite the Vite dashboard in Next.
- Membership is the stable worker-at-pharmacy identity for kiosk, attendance, roster and site.
- MembershipApplication is the pending review/audit record, not a second worker profile.
- EmploymentEngagement is dated pay/employment terms only where ChemistTasker Payroll is used.
- Owner/admin edits cannot change applicant identifiers after submission.
- ABN does not by itself determine contractor legal status. Keep relationship/classification confirmation separate.
- Favourite/external/marketplace workers use per-shift final terms because their rates may be fixed, flexible or negotiated.

## Pause checkpoint

Work is committed and the branch is safe to resume from. Continue from the unfinished work list above, starting with correspondence + shared-core/application review UI, then payroll opt-in UI, then the remaining routing/payroll/invoice hardening and tests.

## Validation checkpoint — 2026-09-19 14:38 AEST

Validated functional head: `c4ce7aef7d360529ce6e88aa14a8dbfc009a3e16`.

### Temporary architecture gate change requested by owner

- Removed the source byte-size / "capped at xx KB" budget enforcement from `scripts/audit-architecture-boundaries.mjs` for this validation cycle.
- The architecture audit still enforces forbidden duplicate/stale paths and required lazy/Suspense boundaries.
- Source-size splitting remains a follow-up code-quality concern, but is not blocking the current test suite.

### Migration repairs found by CLI/CI validation

- Fixed `0052_membershipapplication_date_of_birth` dependency to the real parent: `0051_kiosk_pairing_recovery_attempt`.
- Aligned the MembershipApplication email/status index name between model state and migration: `cp_memapp_email_status_idx`.
- After those fixes, Django `check` and `makemigrations --check --dry-run` both passed.

### Full command-level validation result

GitHub Actions was used as the authoritative CLI runner because the local container cannot resolve github.com to clone the private repository. The workflow executes the same project commands in a clean checkout.

Run: `Shared Core Consolidation #265` / Actions run `35421644670` on functional head `c4ce7aef...`.

All gates passed:

- backend Django system check — PASS
- migration drift check — PASS
- auth/account contract tests — PASS
- marketplace contract tests — PASS
- public-content contract tests — PASS
- membership/application/engagement integrity tests — PASS
- workforce + finance contract tests — PASS
- shared-core typecheck — PASS
- shared-core tests — PASS
- shared-core build — PASS
- shared-core boundary audit — PASS
- Vite TypeScript check — PASS
- cross-frontend auth-flow tests — PASS
- Vite production build — PASS
- Next typecheck — PASS
- Next production build — PASS
- mobile lint — PASS
- mobile TypeScript check — PASS
- standalone Mobile Lint workflow — PASS
- kiosk Cargo tests — PASS
- architecture audit with source-size budget disabled — PASS
- release gate — PASS

### Membership / Employment / Payroll state after validation

- DOB is part of new membership applications and drives junior Award age handling.
- Pending applications are duplicate-guarded and owner review edits are audited.
- Applicant identifiers remain locked after submission (email, mobile, DOB, username).
- Approval is transactional with canonical Membership linkage and, when ChemistTasker Payroll is enabled, initial EmploymentEngagement creation.
- Approval correspondence contains manager edits and final employment/pay terms when payroll is enabled.
- Rejection correspondence/email + notification is implemented.
- Pharmacy-level "Use ChemistTasker Payroll" is opt-in; OFF means timesheet-only and no rate/Award setup requirement for direct staff.
- ABN external assignees remain invoice-routed; TFN external assignees freeze per-shift terms and route to payroll or timesheet-only according to pharmacy payroll mode.
- Direct roster assignment no longer forces EmploymentEngagement when ChemistTasker Payroll is OFF.
- External/favourite/marketplace workers must use final offer acceptance so fixed/flexible/negotiated rates and engagement terms are frozen.

### Current merge posture

- PR #3 remains DRAFT intentionally.
- Functional code at `c4ce7aef...` passed the entire current CI/release gate.
- Remaining work should now be preservation/security review rather than fixing failing functional tests.

## Final command-level validation — 2026-09-19

Functional head: `7f2f11b53f544f345acbdc159bf15ce6a6d425d4`.

Additional regression coverage added after the first green run:

- external ABN shift -> `INVOICE` + independent-contractor route, with accepted rate frozen;
- external TFN shift -> `PAYROLL` when ChemistTasker Payroll is enabled;
- external TFN shift -> `TIMESHEET_ONLY` when ChemistTasker Payroll is disabled;
- internal invoice accepts only accepted `INVOICE + INDEPENDENT_CONTRACTOR` assignments;
- `PAYROLL` and `TIMESHEET_ONLY` assignments are rejected by internal invoice selection.

Authoritative clean-checkout validation:

- Shared Core Consolidation run `35422029915` — **PASS**
  - backend — PASS
  - Django check — PASS
  - migration drift — PASS
  - auth/account contracts — PASS
  - marketplace contracts — PASS
  - public-content contracts — PASS
  - membership/engagement/settlement contracts — PASS
  - workforce + finance contracts — PASS
  - shared-core typecheck/tests/build — PASS
  - Vite typecheck/auth-flow/build — PASS
  - Next typecheck/build — PASS
  - mobile lint/typecheck — PASS
  - shared-core boundary audit — PASS
  - architecture audit with byte cap disabled — PASS
  - kiosk Cargo tests — PASS
  - release gate — PASS
- Standalone Mobile Lint run `35422029920` — **PASS**

The private repository cannot be cloned from the local container because that runtime cannot resolve `github.com`; GitHub Actions therefore served as the clean CLI runner for the exact branch commands.

## Production-blocker implementation checkpoint — 2026-09-19

Functional code head before this documentation update: 55e1f62be010022e43e3392657b800c859935512.

### Regulatory references rechecked during implementation
- Fair Work Pharmacy Industry Award 2020 [MA000012], current consolidated award including 1 July 2026 amendments.
- Current clause 16.2 junior rates remain 45/50/60/70/80/90% for under-16 through age 20 respectively.
- Fair Work's April 2026 junior-wage-change notice says further 18–20 changes are upcoming and timing/details remain subject to implementation.
- ATO material confirms the SG rate is 12% for 1 July 2026–30 June 2027.

### Validation status of this new head
- Static/source review: completed across routing, invoices, worker-finance wrapper, migrations, shared-core, web and mobile.
- New regression tests: committed.
- PostgreSQL CI job and release-gate dependency: committed.
- Executable latest-head CI: **BLOCKED BEFORE RUNNER STEPS**.
  - Shared Core Consolidation run 35427741247: all jobs ended with zero steps/no command logs.
  - Mobile Lint run 35427741224: zero steps/no command logs.
  - Direct Mobile Lint retry: again zero steps.
- The previous green CI remains evidence for the pre-fix stack only; it is not being misrepresented as validation of these new fixes.
- Before merge: rerun the exact latest head once GitHub allocates runners, fix any real command/test failures if they appear, and only then mark PR #3 ready.
