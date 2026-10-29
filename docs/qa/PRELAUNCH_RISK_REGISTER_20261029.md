# Pre-launch integrity register

Baseline: draft #225, `e80a89784d6481da2604dee86c342281bf92bbfe`.
This continuation implements M4 release hardening. It does not authorize a merge,
deployment, live payment, provider message or production data change.

## Milestone position

| Milestone | Evidence and remaining work |
| --- | --- |
| M1: current failures | #225 Full Isolated QA run `40880723593`, Shared Core run `40880624487`, E2E run `40880624421` and security run `40880624405` all succeeded. The separate skipped QA run is not counted as a pass. New source requires new-head verification. |
| M2: integration rehearsal | Main `25ef200f0c32b2b6fc764a4d05a648b604038794` is an ancestor of #225; the isolated rehearsal used its exact tree, including all earlier stacked dependencies. Startup/routes/migrations passed locally; no merge was performed. |
| M3: bounded dependency assessment | Retain the reviewed identity/session enrichment, public discovery and verification orchestration boundaries. The remaining 113 combined cyclic edges are retained debt, not 113 defects; this bounded assessment does not certify every edge. No further extraction is scheduled just to lower that number. |
| M4: release hardening | In progress. This batch repairs payroll replay and frozen settlement data. Paid checkout duplication remains a launch blocker for that workflow. Other rows below distinguish current evidence from untested candidates. |
| M5: fixed-candidate acceptance | Pending M4 closure and final source selection. Re-run applicable CI, F07, staging smoke, device/provider acceptance where relevant, and backup/restore and rollback rehearsal on that selected candidate. |

## Launch exposure

Deployment configuration and pharmacy opt-in records have not been inspected. Do not
claim a feature is disabled merely because this local runtime has no provider credentials.
Source `core/settings.py` sets `BILLING_LIVE_DATE` to 2025-06-01 and `FREE_TRIAL_DAYS`
to zero; the nearby comment has a different year. Both dates are already past at this
review. The penalty endpoint does not consult the fulfillment billing-state gate.
`Pharmacy.use_chemisttasker_payroll` defaults false, but a manager can enable it through
the workforce settings endpoint. That default is not proof that launch pharmacies opted out.

| Risk / invariant | Reachable owners and current evidence | Status / required exit evidence |
| --- | --- | --- |
| P1: activation retries preserve the first timestamp and accepted terms | `POST shift-offers/<id>/activate-payroll/` in `shifts.offers`; later assignment creation in `shifts.finalize` copies the offer timestamp. On the parent, a retry one hour later rewrote both timestamps. | Repaired in this batch; replay returns the original activation time and does not invalidate unchanged projections. Existing permission, opt-in, accepted-offer, TFN/super and Award-review guards remain. Verify on the published head. |
| P2: open timesheets must not retain obsolete settlement routing | The activation endpoint bulk-updated assignments without model-save invalidation. A clean open timesheet remained clean. Workforce owns projection invalidation and rebuild dispatch. | Repaired through a shift-owned activation event inside the same transaction. Workforce persists `needs_rebuild` and schedules its existing robust after-commit task. Published roster identity and accepted rates/terms are not edited. Queue failure retains the dirty marker; durable invalidation failure rolls activation back. |
| P3: locked payroll exports must include the reviewed PAYROLL assignments and exclude INVOICE/TIMESHEET_ONLY | `workforce.timesheet_builder` calculated roster settlement inputs but omitted `snapshot.roster`; `lock_period` read that missing field as an empty list. A PAYROLL fixture produced an empty export. | Repaired by freezing the existing serialized roster input. Legacy unlocked payroll revisions missing that evidence require recalculation and review before locking. Rebuilding creates a new revision even when other inputs match. Locked manifests are preserved; historical exports require separate operator reconciliation, never silent rewriting. |
| P4: one booking obligation must not collect two payments | `billing.charge-fulfillment` -> `shift_payments`; signed checkout webhook -> `payment_events` -> fulfillment. Existing endpoint tests create two different idempotency keys for web/mobile requests selecting the same offer. Two different paid intents create two paid ledger records; the second raises a refund-required alert. Same-event/same-intent replay is deduplicated. | **Durable prevention and recovery implemented in the 30 October continuation; rollout acceptance remains open.** See `FULFILLMENT_CHECKOUT_RECOVERY_20261030.md`. Reservations commit before provider creation; explicit resume/confirmed unpaid expiry, paid metadata/currency/amount binding, free/pill guards and reconciliation flags are covered in source. Legacy open sessions must be drained/reconciled before rollout. Exit: durable obligation/session ownership across actors, platforms, overlapping selections, time boundaries and concurrent requests; replay-safe reconciliation and refund recovery; PostgreSQL races and provider test-mode evidence. A verified backend restriction is an alternative only after an explicit launch decision. No such restriction exists in this batch. |
| P5: cancellation charges must follow one declared occurrence/time/obligation policy | `billing.charge-penalty` -> `shift_payments.charge_penalty` -> signed cancellation webhook. Current source uses all assignments, the default Django timezone, <=24/72-hour thresholds and no checkout idempotency key. Existing overnight and cent-rounding controls are retained. | **Open source-grounded risk, not newly reproduced in this batch.** Reproduce store-zone/DST boundaries, completed/past work, repeated sessions and mixed occurrence selection; decide the intended payable cancellation unit before changing calculations. Do not treat the fulfillment pre-live date as containment for this endpoint. |
| P6: each saved invoice representation agrees within its existing monetary convention | `invoicing` generation/preview/legacy editor/adoption; `worker_finance` saved revisions and delivery. Internal per-line and external aggregate rounding deliberately differ. Existing integrity contracts cover half cents, GST, super, immutable source identity and cross-tenant refusal. | Preserve these conventions. Re-run the integrity selection for this batch. Cross-flow convention unification is a deferred policy decision; any reproduced disagreement between a saved invoice and its delivered revision/PDF is a launch blocker for the affected route. No fresh real SMTP/provider acceptance is claimed. |
| P7: message transport failures must not lose business recovery state or hide failed security delivery | Offer buzz, candidate reveal, interest/rejection, cover requests and roster publication have different transaction/fan-out boundaries. PIN verification requires immediate delivery acceptance; invoice delivery has a dedicated uncertainty protocol. Current `notifications.services` catches WebSocket and counter delivery separately, superseding the older inventory's channel-suppression candidate. | **Bounded outage work remains.** Reproduce a two-recipient outage, offer-buzz cooldown after failure, reveal quota/audit response and rollback. Classify by durable state/recovery impact before changing policy. Keep immediate OTP failure and ambiguous-invoice-send fencing intact. Do not claim durable guaranteed delivery from robust callbacks. |
| P8: activation and locked work require an audited adjustment | #226 preserved locked manifests but still permitted activation of their live assignments. The 30 October continuation requires the existing correction workflow: same-transaction period locks, structured 409/rollback, then recalculation/review and adjustment. Unchanged retries remain successful. | **Activation entry point repaired in source; new-head PostgreSQL evidence required.** Pending slot/whole-shift dates are checked too. Tests cover both freeze orderings and simultaneous activation. Other assignment writers and later fulfillment remain separate coverage boundaries; see `PAYROLL_PERIOD_FREEZE_20261030.md`. Do not describe this as a universal freeze guard. |

## This batch's regression contract

The payroll correction uses the existing offer lock and transaction. A shift-owned event
contains only the affected pharmacy, worker and work dates; workforce reacts without a
reverse import from shifts. The event runs after the bulk settlement write and before
commit. Its durable invalidation is not swallowed; queue dispatch remains after commit.
The bulk write remains bounded to the same source offer, TFN preference and employee kind.
Response fields and assignment count are preserved. A repeated activation with unchanged
assignment settlement sends no event. Activation before fulfillment still propagates to
the later assignment.

Frozen roster rows use the builder's existing serialized inputs, rather than new payroll
calculations. The frozen data records the existing settlement inputs and references.
It does not certify Award values or change holiday data, GST, super, cancellation
rates or employee eligibility. A legacy unlocked revision upgrade creates a new reviewable
revision; approved status cannot silently carry across that upgrade. Already locked revisions
remain readable and require the existing explicit correction workflow for adjustments.

Positive and negative controls cover timestamp replay, activation before fulfillment,
published-roster projection refresh, PAYROLL export inclusion, INVOICE and TIMESHEET_ONLY
exclusion, old-revision review, locked-manifest preservation, queue outage and transaction
rollback. The PostgreSQL CI selection includes the activation and timesheet state-machine
contracts as well as the existing concurrency selection. No SQLite result is described as
proof of PostgreSQL race behavior.

## Acceptance record

Parent reproduction: the initial five-test activation selection had two assertion failures
(stale dirty marker and rewritten timestamp). The expanded nine-test selection had four
assertion failures and two errors caused by missing frozen roster/export data. Parent
controls for successful activation, activation before fulfillment and locked-period dispatch
exclusion passed. Source files were edited while the already-loaded test processes finished;
the displayed traceback source lines can therefore differ from the loaded baseline code.

Corrected-source local validation:

| Check | Result |
| --- | --- |
| Membership/payroll, timesheet projection/state machine, billing/fulfillment/refunds/cancellation, invoice integrity and six required holiday/Award/pricing selections | 222 discovered; **221 passed, one PostgreSQL-only skip**, 17.099 seconds after database setup. |
| Module-size/ownership, serializer runtime/lifecycle and cold startup controls | **37/37 passed**, no skips, 13.185 seconds after setup. |
| Import scanner regression suite | **13/13 passed**. |
| Full graph, reviewed baseline, generated ledger and architecture-boundary audit | Passed; zero direct cyclic edges, 113 combined cyclic edges; no baseline expansion. |
| `makemigrations --check --dry-run` | No changes detected. |
| Offline holiday reconciliation | Passed; eight state/territory calendars, 56 local regions, ten part-day records. Explicitly pending declarations remain pending. No fresh government-source certification is claimed. |
| Patch whitespace / source stability | `git diff --check` passed. All 870 Python source hashes captured during final validation were unchanged afterward. |

The initial corrected-source run had two test-harness failures because queue mocks were
exited before captured commit callbacks executed. Keeping those contexts active during
callback execution fixed the fixtures; production code was unchanged for the successful
rerun. Exploratory nonexistent test-module/script names ran no corresponding tests and
are excluded from the passing counts above.

Hosted checks on the new source do not inherit #225's green status. The PostgreSQL job
now explicitly selects the activation and timesheet state-machine contracts; its results
and new-head Full Isolated QA remain separate acceptance evidence. The current repair
does not resolve P4/P5/P7/P8, authorize a release, or certify deployed recovery behavior.

## Next implementation decision: paid obligation ownership

The smallest durable repair belongs to billing: persist one obligation per selected payable
offer/occurrence and the associated checkout attempt, lock/reserve it before provider
creation, and reconcile every signed paid intent against that obligation. Different return
URLs or actors must not create an independent payable obligation. Repeating an unchanged
selection can reuse a compatible active checkout; changed/overlapping selections require
an explicit expiry/supersession protocol so an older open session cannot still charge the
same work. Provider calls must use a stable persisted attempt key and recover after a
timeout between provider success and local acknowledgment. Webhooks and refund handling
remain enabled even when creation is restricted.

Before implementing its schema, enumerate partial selections, mixed prices/subscriptions,
session expiry and late paid delivery. Tests must cover both blocked duplication and valid
independent purchases. Refund policy/automation and cancellation obligation scope need
explicit product decisions; a silent key-only change cannot solve these cases. This batch
does not introduce a payment schema or claim that the obligation problem is fixed.

## 30 October continuation

Draft #226 at `912d26b9470dbb7b2226d7b1d4b60e36a3bc9f73` passed all non-skipped workflows,
including Full Isolated QA `40887999239`. Its PostgreSQL job passed 474/474 with no skips.
The active source continuation is `PAYROLL_PERIOD_FREEZE_20261030.md`; it does not inherit
those passes. P8 above now describes the explicit correction guard under implementation.
M4 remains open; no merge, deployment or release certification is implied.
