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

## Important unfinished work — resume here

Do not mark the feature complete until all items below are resolved.

1. **Acceptance/rejection correspondence**
   - Implement `email_membership_application_rejected`.
   - Add rejected HTML + text templates.
   - Extend approved email + in-app notification with:
     - owner/admin edits from `review_changes`;
     - accepted role/employment type/job title;
     - EmploymentEngagement/pay rates when ChemistTasker Payroll is enabled.
   - Do not expose TFN or full super member number in email.

2. **Owner/admin application review UI**
   - Web MembershipApplicationsPanel:
     - show complete submitted data;
     - show locked identifier fields clearly;
     - edit allowed review/employment fields;
     - save review before approve;
     - show review-change summary;
     - show payroll ON/OFF status;
     - only request Award classification/rate workflow when payroll is ON.
   - Mobile equivalent needs parity.
   - Shared-core needs PATCH/update service + expanded application types.

3. **Payroll opt-in UI**
   - Add the switch/card in Manage Staff / pharmacy detail (web, then mobile):
     - “Use ChemistTasker Payroll”
     - explanatory requirements when enabling.
   - Surface payroll mode in Workforce Settings.
   - Hide/disable Employment & Pay setup when payroll is OFF, with explanatory text.
   - When payroll is ON, guide manager into missing EmploymentEngagement setup.

4. **Acceptance-time EmploymentEngagement**
   - For TFN pharmacy staff with payroll ON, owner/admin needs to enter/confirm dated employment/pay terms before approval is final.
   - Acceptance email must include the final frozen terms/rates.
   - Determine clean transaction boundary so Membership + EmploymentEngagement + application decision cannot partially succeed.
   - Do not require worker TFN/super merely to record the employment agreement; require TFN/super before ChemistTasker payroll processing.

5. **Shift model compatibility bug**
   - `Shift.EMPLOYMENT_TYPE_CHOICES` currently lacks `CASUAL`.
   - A direct casual employee shift can therefore conflict with model validation.
   - Inspect all serializers/UI assumptions and fix without conflating CASUAL employee with LOCUM/SHIFT_HERO.

6. **Direct staff offer validation**
   - When payroll ON, direct pharmacy staff offer path should validate that a dated EmploymentEngagement covers the occurrence(s).
   - When payroll OFF, no pay-rate/EmploymentEngagement gate.

7. **External TFN per-shift Award floor**
   - Current per-shift TFN terms carry agreed rate + employee status but do not yet resolve/freeze an Award classification/floor.
   - Need a non-duplicative classification source and floor check before production.

8. **ABN invoice integration**
   - ABN assignments/timesheets are marked INVOICE.
   - Still need to connect completed/approved worked time into the existing invoice system instead of creating a second invoice model.

9. **Payroll exclusion**
   - Explicitly verify that ABN/INVOICE and TIMESHEET_ONLY assignments cannot enter any ChemistTasker payroll export/processing path.
   - Metadata alone is not sufficient.

10. **Tests**
    - Membership application duplicate guards.
    - Locked identifier PATCH rejection.
    - Owner/admin review audit trail.
    - Approval links canonical Membership.
    - Rejection notification.
    - Payroll OFF direct roster without EmploymentEngagement.
    - Payroll ON direct roster requires dated EmploymentEngagement.
    - Timesheet missing-engagement warning only when payroll ON.
    - ABN invoice routing.
    - External TFN PAYROLL vs TIMESHEET_ONLY based on pharmacy setting.
    - Junior DOB cases and birthday successor.
    - Web/mobile/shared-core type checks.

11. **CI and migration verification**
    - Run/check current PR CI after all above work.
    - Verify migration graph and model state.
    - Keep PR draft until green.

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
