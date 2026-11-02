# Fixed-candidate acceptance and outstanding decisions

Source parent: #233, `a32ea5c73858e873109a2cc85244feb576164ed2`.
All related PRs remain draft and unmerged. No deployment or production data change.

## Candidate identity and recovery rehearsal

The opt-in `release-acceptance` workflow checks out the exact PR head and records
that SHA together with the fetched main SHA. It refuses a candidate that does not
contain main. Main remains `25ef200f0c32b2b6fc764a4d05a648b604038794` at this source
check; the workflow revalidates the actual integration relationship.

Against isolated PostgreSQL 16, it:

1. Migrates main, saves a synthetic user and encrypted historical TFN identity and
   inventories table row digests, columns, constraints and sequence positions.
2. Takes a pre-upgrade backup, applies candidate migrations and verifies pre-existing
   application rows and ciphertext. Django-generated migration/content-type/permission
   metadata is explicitly excluded from the cross-upgrade row comparison.
3. Saves synthetic paid-checkout reconciliation/reservation state and a genuine
   internally sourced invoice with two saved revisions; verifies both rendered PDFs.
4. Backs up the candidate, restores into a separate new database, compares inventories
   and verifies payment/reservation identity and invoice revisions/PDFs.
5. Restores the pre-upgrade backup into a second new database, loads it with main's
   code, verifies historical encrypted identity and compares the baseline inventory.

This rehearses rollback by restoring the pre-upgrade database backup and old code.
It does not claim that reversing candidate migrations in place is supported or that
an old binary can safely write to the new schema. PostgreSQL tools run inside the
same version-16 service container. Fixture guards require APP_ENV=test, PostgreSQL,
loopback and ct_release_ database names. No external provider or email is called.
The artifacts contain generated test records only, not production data or secrets.

The production-security job reuses the existing F07 deployment checks and exact
composition/historical route assertions. The historical F07 package remains intact:
its old fixed baseline and no-schema-change premise are not loosened for the new
additive billing migration. Full Isolated QA and authenticated browser checkouts now
also select the exact PR head. Native acceptance already takes the exact head SHA.
The separate CI jobs are evidence for their recorded commit, not a release approval.

## Combined milestone position

| Milestone | Current conclusion / exit evidence still needed |
| --- | --- |
| M1 current defects | #231 repaired the real internal invoice preview 404. #233 scopes the browser locator and repairs two array fixtures. Browser/native results must pass on the final candidate. Historical 390px screenshot differences need visual assessment; goldens remain unchanged. |
| M2 integration | Current main is an ancestor of the stack; rehearsal now upgrades populated main and exercises restore under both code versions. Require successful hosted result on the final head. No merge was performed. |
| M3 bounded dependencies | Assessed candidates retained. Zero direct cycles and 113 combined cyclic edges remain guarded; no further extraction to reach a numerical target. |
| P4 paid-checkout ownership | #229 has real PostgreSQL reservation-race evidence (488 tests passed in its PG job); #232 tightens worker/occurrence binding and payroll-lock recovery. Require current-head PostgreSQL success, real Stripe test-account lifecycle/replay, and reconciliation of historical open sessions before rollout. |
| P8 payroll freeze | #232 source guards and existing correction/re-lock contracts passed locally (282 passed, 15 PG-only skips). Hosted PostgreSQL job 123870323044 passed all 509 tests, including both new orderings and ABN-cover preservation controls. Emergency-cover freeze policy remains a separate decision, not an implemented change. |
| P5/P7 | #233 repairs one reproduced roster fan-out defect. Cancellation scope/time/obligation and uncertain buzz/reveal delivery decisions are recorded in BOUNDED_CANCELLATION_NOTIFICATION_20261030.md. Those decisions are not closed by green characterization tests. |
| M4 operational hardening | Real SMTP protocol tests and genuine invoice UI/revision/PDF acceptance are implemented. Configured email provider, test-mode Stripe and deployed invoice journeys remain unverified without access. |
| M5 final acceptance | Modern recovery and production checks are prepared for the exact head, alongside full QA, browser and native CI. Passing these is not deployed staging, physical-device or actual production restore evidence. No final release sign-off yet. |

## Access and decision boundaries

Public staging health and public smoke previously passed but exposed no candidate
commit identity. This workspace has no authenticated staging login/SSH/runtime env,
configured Stripe test secret/webhook destination, real email provider test inbox or
physical device. Local Docker/PostgreSQL/browser binary installation is unavailable;
use hosted CI for those reproducible checks. Do not bypass execution restrictions.

`scripts/verify-stripe-test-prices.py` is a read-only test-account price verifier. It
refuses absent/live credentials, checks the existing four IDs against active one-time
AUD per-unit amounts, and never creates sessions or charges. Access check here reports
BLOCKED: no configured test-account credentials. It does not establish webhook or
Checkout behavior. Keep credentials in the authorized environment, never source.

On authorized staging with the fixed candidate, capture configured price checks,
web/mobile checkout recovery (unknown acknowledgement, explicit unpaid expiry,
duplicate/concurrent attempts), actual signed provider events and replay after audited
payroll correction. Also exercise partial/full refunds, invoice preview/Save/revisions/
PDF/delivery and controlled provider outage recovery using designated test recipients.
Do not automatically resend an invoice after an uncertain provider acknowledgement.
Record provider request/event identities and exact source, without secrets.

The demonstrated cancellation charging exposure requires an explicit policy or a
verified feature restriction before launch. Emergency-cover correction scope and
ambiguous reminder/reveal delivery require their documented decisions. These are
reported for the owner; they were not silently decided to finish a checklist.

## Acceptance triage on 30 October

#233's real browser journey reached all invoice business assertions successfully:
preview, Save, two revisions, both PDF responses, captured delivery and stale/replay
fencing. Its only final failure was the runner denying an optional screenshot after
secret entry (POLICY_DENIED). Remove that optional capture; preserve every business
assertion and the runner's secret protection. It is not yet a green run.

The 390px appearance artifact was inspected against its stored baseline. The header
actions are 44px in the candidate versus 38px in the old screenshot, shifting the
page down by 6px. Git blame traces that source change to 54f1550a7 (26 October),
explicitly the C038/F14 44px touch-target repair; it is already on main and predates
this architecture/payroll work. Do not revert it to satisfy a pre-repair screenshot.
Other mobile wrapping differences remain part of the visual review. No application
style or approved golden was changed in this continuation.

The first recovery run passed all 94 identity/route/task startup tests and production
security. Candidate migration, synthetic invoice PDFs, dump and restore ran, but raw
constraint text differed in one PostgreSQL deparser spelling: an array-wide text cast
versus identical per-item text casts for provisional_decision_timestamp_matches_status.
The comparator accepts only those two exact complete predicates for that exact table
and constraint, while preserving strict comparisons for all data, schema, sequences
and other constraints. Both raw inventories remain in the evidence artifact. Added
negative controls reject changed predicates, rows and sequence state. No application
constraint or migration was changed. Re-run recovery is required before claiming pass.

The broad serializer suites identified two ownership violations in the new synthetic
fixture's historical-compatibility imports (not application runtime). Move that helper
under core/test_recovery_fixture.py, its actual test-only owner, so historical-path
assertions remain in the test boundary. The production import guard is unchanged.

The older fixture browser suite improved from 11 failures to one: 191 passed and
29 intentional skips on #233. The remaining attendance approval case uses its own
local API fixture; give its two array endpoints the same corrected responses. Keep
its real permission, approval body, pharmacy scope and timezone assertions unchanged.

Android #231 now receives HTTP 200 for invoice preview. Its failure artifact shows
the app on Home after the test tapped the floating Qty label and then hid an absent
keyboard, rather than proving the quantity field was edited. Give the real native
quantity input a stable testID and use that control in Maestro; assert the edited
value before dismissing the keyboard. This is test targeting metadata only, with no
calculation, layout or interaction policy change. Native rerun is still required.

A final HTTP-boundary review found that a plain staff roster rate PATCH could receive
an unhandled Django payroll-lock error. Map only locked_payroll_period into the
existing HTTP 400 validation envelope; keep all other exception handling unchanged.
The source write still rolls back, the original manifest/rate remains, and the same
authorized PATCH succeeds after the existing audited period correction. Worker access
remains denied. This is error translation, not a new rate-setting permission.

Final HTTP-boundary regression selection: 57/57 passed, zero skips. Native quantity
targeting: 15 component contracts passed, mobile typecheck and Maestro YAML passed.
Historical fixture ownership: four contracts passed. Recovery comparator: five
positive/negative controls passed. These selections overlap prior suites and are not
summed into a platform test total. Final-head hosted acceptance remains authoritative.
