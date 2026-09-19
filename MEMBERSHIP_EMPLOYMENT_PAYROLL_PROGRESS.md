# EmploymentEngagement / Membership / Payroll Progress

Last updated: 2026-09-19 (Australia/Brisbane)

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

## Current remaining work after green validation

The earlier unfinished checklist below has been closed by the implementation and test passes recorded later in this file. The following are the only material follow-ups still intentionally open:

1. **External TFN Award floor before production ChemistTasker payroll for marketplace/favourite shifts**
   - Per-shift TFN acceptance already freezes the final agreed rate, dates, role, employee relationship, super readiness and settlement route.
   - When the pharmacy does **not** use ChemistTasker Payroll, its own payroll system remains responsible for Award classification/floor processing.
   - Before ChemistTasker itself calculates wages for an external TFN shift, add an explicit, non-guessed Award classification source and floor comparison. Do not infer an Experienced Pharmacist / higher classification from role name alone.

2. **Future payroll engine settlement filter**
   - There is currently no separate ChemistTasker payroll export/processor in this repository.
   - When that processor is introduced, it must accept only assignments explicitly routed as `PAYROLL`; `INVOICE` and `TIMESHEET_ONLY` must fail closed.
   - The current invoice path already fails closed to accepted `INVOICE + INDEPENDENT_CONTRACTOR` assignments.

3. **Re-enable/refine source-size budgets after functional validation**
   - The owner explicitly requested the “capped at xx KB” gate be removed temporarily.
   - Large-file splitting remains a refactor target, but byte size is no longer a blocking CI condition during this validation cycle.

4. **Next phase: preservation/security audit**
   - Endpoint permission matrix / anonymous-route preservation.
   - Object-level authorization / IDOR tests.
   - Continue the security-hardening backlog after this membership/employment/payroll workflow is accepted.

### Completed from the prior unfinished checklist

- Acceptance + rejection correspondence — COMPLETE.
- Owner/admin application review UI (web + mobile) — COMPLETE.
- Shared-core application PATCH/types — COMPLETE.
- Pharmacy “Use ChemistTasker Payroll” switch and explanatory UI — COMPLETE.
- Payroll mode surfaced in Workforce Settings — COMPLETE.
- Acceptance-time initial EmploymentEngagement for payroll-enabled pharmacy staff — COMPLETE and transactional.
- Shift CASUAL model compatibility — COMPLETE.
- Direct staff offer validation with payroll ON/OFF behavior — COMPLETE.
- ABN accepted-shift integration into the existing invoice system — COMPLETE.
- Duplicate guards / locked identifiers / review audit tests — COMPLETE.
- DOB junior-rate tests and birthday successor guard — COMPLETE.
- ABN/TFN settlement routing tests — COMPLETE.
- Invoice boundary tests excluding PAYROLL/TIMESHEET_ONLY assignments — COMPLETE.
- Full CI/migration verification — COMPLETE on functional head `7f2f11b53f544f345acbdc159bf15ce6a6d425d4`.

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
