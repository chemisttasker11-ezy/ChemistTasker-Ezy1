# Shift lifecycle journey register — discovery baseline

Source baseline: PR #181 SHA `9d1c6b760fcb3bb4e43215d03e37e0aacf047af3`. A code review is **not** an executed end-to-end test. Every `EXISTING_SOURCE_ONLY` row needs actual exact-head acceptance evidence before promotion to `VERIFIED`. A row marked `SOURCE_GAP` identifies a code-path omission, **not** proof that every affected runtime request fails.

## Core actors and intersecting dimensions

**Actors:** owner; delegated pharmacy manager; organisation admin; region admin (no assumed billing authority); worker pharmacist; Other Staff member; direct pharmacy employee; external locum/casual; unverified/ineligible worker; replacement worker; anonymous public viewer; billing-account contact; payroll/timesheet approver.

**Dimensions across every row:** one vs many slots, recurring vs dated, public vs community vs private, multiple pharmacies and roles, timezone/overnight, app reconnect/retry, simultaneous users, billing-required vs free/pre-live, web Vite/Next vs Expo, visibility/privacy, invitation/email/push history, audit, and irreversible effects.

## A. Before a shift is confirmed

| ID | Priority | Persona / journey | Source-level finding | Status | Evidence / tests to extend |
|---|---|---|---|---|---|
| SL-01 | P0 | Manager creates a dated shift with correct pharmacy/role/rate/slots | Serializer delegates to domain posting; existing posting/role tests | EXISTING_SOURCE_ONLY | `shifts/serialization/shifts.py`, `shifts/posting.py`, `shifts/test_shift_posting_contract.py`; Next → Vite → Django real create |
| SL-02 | P0 | Manager edits unfilled shift incl. recurrence and date rates without losing payload | Domain `revise_shift` and posting tests exist | EXISTING_SOURCE_ONLY | `shifts/posting.py`, `shifts/test_shift_posting_contract.py`; verify client edits & future slots |
| SL-03 | P0 | Private/dedicated booking prevents broadcast and escalation | Accepted privacy policy and dedicated-offer tests located | EXISTING_SOURCE_ONLY | `docs/handover/pr165/README.md`, `shifts/test_shift_posting_contract.py`; web and native |
| SL-04 | P1 | Manager publishes internal direct roster shift and employee acknowledges | Dedicated roster period publication and worker ack implemented | EXISTING_SOURCE_ONLY | `workforce/roster/publication.py`, `attendance_tests/test_acceptance_matrix.py`; live client path |
| SL-05 | P1 | Publication withdrawn per slot vs whole week; republish with valid revision | Separate audited roster-week/slot rules exist | EXISTING_SOURCE_ONLY | `workforce/roster/publication.py`, `docs/architecture/PRODUCTION_ACCEPTANCE_F07.md`; date changes |
| SL-06 | P0 | Worker sees only eligible community/public opportunities and correct pay visibility | Access tiers, roles and rate redaction exist | EXISTING_SOURCE_ONLY | `shifts/browse.py`, `shifts/access.py`, `shifts/rate_visibility.py`, `test_rate_visibility.py` |
| SL-07 | P1 | Scheduled/manual escalation follows allowed tier sequence and thresholds | Code implements allowed tiers and due escalations; no cross-platform proof | EXISTING_SOURCE_ONLY | `shifts/escalation.py`, `test_access_escalation_contract.py`; scheduling and daily public limit |
| SL-08 | P1 | Shift interest/rejection is scoped to slots and notifies managers | Domain and unit contracts located | EXISTING_SOURCE_ONLY | `shifts/interest.py`, `test_shift_actions_contract.py` |
| SL-09 | P1 | Candidate reveal/quota, anonymity and role work-profile restrictions | Domain and dedicated contracts located | EXISTING_SOURCE_ONLY | `shifts/candidates.py`, `test_shift_actions_contract.py`; alternate persona negatives |
| SL-10 | P1 | Worker proposes counteroffer; manager accepts/rejects; worker must confirm | Counteroffer creates worker offer rather than final assignment | EXISTING_SOURCE_ONLY | `shifts/counter_offers.py`; `test_shift_actions_contract.py`; invalid slot and concurrent decision |
| SL-11 | P0 | Manager issues pending offer to one candidate, preserving 48-hour expiry | Pending offer refresh and expiry timestamp implemented | EXISTING_SOURCE_ONLY | `shifts/assignment.py`, `shifts/offers.py`; verify notification, retries and time |
| SL-12 | P0 | Direct staff claims an unassigned shift; external worker cannot bypass acceptance | Explicit split and role checks present | EXISTING_SOURCE_ONLY | `shifts/browse.py` claim-shift; `shifts/assignment.py`; multiple actors |
| SL-13 | P0 | Worker accepts agreed ABN/TFN terms and immutable rates | Engagement snapshot fields and validation path exist | EXISTING_SOURCE_ONLY | `shifts/offers.py`, `shifts/engagement.py`, `shifts/finalize.py` |
| SL-14 | P0 | Worker declines offer; candidate, manager and visibility flow are reconciled | Decline notifies owner; fallback/escalation outcome not established | PARTIAL | `shifts/offers.py` decline; investigate stale interest and automatic re-offer, decision D06 |
| SL-15 | P1 | Unaccepted offer expires without stale UI/visibility | Pending expiry happens lazily on offers `list`; time-driven worker visibility/proactive handling needs proof | PARTIAL | `shifts/offers.py` list; `shifts/assignment.py`; expiry job and candidate notices D06 |
| SL-16 | P0 | Two candidates accept same slot (including concurrent requests) | Acceptance checks status before transaction and does not visibly lock slot or competing pending offer in this path | RISK_TO_PROVE | `shifts/offers.py` accept; `shifts/finalize.py`; PostgreSQL race with two workers |
| SL-17 | P0 | Multiple-slot shift: two distinct workers, partial acceptance, single-user-only constraint | Slot/offer distinction exists; idempotence and all-or-nothing confirmation require proof | NOT_YET_VERIFIED | `shifts/models.py`, `shifts/finalize.py`, `test_shift_actions_contract.py`; date+slot matrix |
| SL-18 | P1 | Ineligible professional or expired verification is rejected at action time | Some eligibility tests and role predicates exist; changing status between interest and acceptance needs proof | RISK_TO_PROVE | `shifts/access.py`, `test_claim_eligibility.py`; revoke verification race |

## B. Confirming, charging, changing and cancelling

| ID | Priority | Persona / journey | Source-level finding | Status | Evidence / tests to extend |
|---|---|---|---|---|---|
| SL-19 | P0 | Billing-required offer is accepted but not yet paid | Code sets offer `ACCEPTED_AWAITING_PAYMENT`, shift `PENDING`; no assignment yet | EXISTING_SOURCE_ONLY | `shifts/offers.py` accept; decision D01 for who is committed |
| SL-20 | P0 | Free/pre-live offer is accepted and creates assignment exactly once | `finalize_shift_offer` creates assignments and sends payment-finalized notifications | EXISTING_SOURCE_ONLY | `shifts/offers.py`, `shifts/finalize.py`, `billing/views.py` |
| SL-21 | P0 | Correct operational payer checks out; unrelated personas forbidden | Shift charge payer authority differs from subscriptions; tests exist | EXISTING_SOURCE_ONLY | `billing/utils.py`, `billing/tests.py`; web, native, scoped pharmacy |
| SL-22 | P0 | Paid Stripe completion finalizes **only selected** offers and persists successful checkout | Webhook invokes `_finalize_pending_offers_for_shift`; retries tested, but multiple candidates/slot scenarios need proof | RISK_TO_PROVE | `billing/views.py`, `billing/tests.py`; replay, out-of-order, offer_ids, candidate_id |
| SL-23 | P0 | Stripe penalty payment never unintentionally finalizes unpaid fulfillment offers | Generic paid-payment block also calls `_finalize_pending_offers_for_shift` without visibly filtering `payment_type` to fulfillment | RISK_TO_PROVE | `billing/views.py` `_process_stripe_event`; targeted isolated webhook test |
| SL-24 | P0 | Two awaiting-payment candidates for same slot cannot both become accepted | Finalizer marks each processed offer accepted even if slot assignment already exists; selection/replay needs proof | RISK_TO_PROVE | `billing/views.py` `_finalize_pending_offers_for_shift`; PG concurrent retry |
| SL-25 | P0 | Owner leaves checkout, card fails, webhook delayed, or user retries | Clear timeout/unblock, fee retry and assignment lock are not fully specified | DECISION_REQUIRED | `billing/views.py`, `shifts/assignment.py`; D01,D02,D03 |
| SL-26 | P0 | Accepted payment remains unpaid when shift start passes | No overdue model state or sweeping task in the inspected shift code | SOURCE_GAP | `shifts/models.py`, `shifts/tasks.py`, `Project_Review.md`; D02,D03 |
| SL-27 | P0 | Manager deletes *unfilled* shift | DRF generic `destroy` inherited; must prove published-roster/foreign-key behavior | RISK_TO_PROVE | `shifts/base.py` and `shifts/models.py`; test DELETE effect and audit |
| SL-28 | P0 | Manager cancels a confirmed/paid or partly filled shift | No dedicated shift cancellation state/action observed; cannot treat generic deletion as customer cancellation | SOURCE_GAP | `shifts/base.py`, `shifts/models.py`; D04,D05,D08 |
| SL-29 | P0 | Worker cancels a confirmed external engagement | Roster cover/swap services exist, but no explicit external cancellation flow is established | DECISION_REQUIRED | `workforce/roster/worker_actions.py`; D04,D07 |
| SL-30 | P0 | Worker says "can't work" before manager's decision | **Settled:** original assignment remains; approved replacement/release required | EXISTING_SOURCE_ONLY | `workforce/roster/worker_actions.py`, `ROSTER-ATTENDANCE-PLAN.md` |
| SL-31 | P0 | Manager approves replacement/swap after revalidating eligibility | Atomic replacement and stale-request protections are implemented for roster action | EXISTING_SOURCE_ONLY | `workforce/roster/worker_actions.py`, roster tests; cross-app/notification acceptance |
| SL-32 | P0 | Manager releases worker without replacement; original shift re-enters escalation | Existing shift/slot reused and audited by roster service | EXISTING_SOURCE_ONLY | `workforce/roster/worker_actions.py`; worker + managers + candidate visibility |
| SL-33 | P0 | Partial multi-slot cancellation/adjustment leaves other slots and financial records intact | No agreed partial-cancellation semantics established for paid external offers | DECISION_REQUIRED | `shifts/posting.py`, roster slot guards; D05,D09 |
| SL-34 | P0 | Cancellation fee eligible/waived; refund, adjustment and dispute authority | Manual `charge_penalty` checkout calculates 10%/20% wage windows but is not a full cancellation transition | PARTIAL | `billing/views.py` `charge_penalty`; D08,D10,D11 |
| SL-35 | P0 | Old worker, replacement and managers receive once-only truthful notifications | Offer, roster and shift notification mechanisms exist; consolidated cancellation/replace notice not verified | PARTIAL | `shifts/notifications.py`, `shifts/emails.py`, `worker_actions.py`; D07 |
| SL-36 | P1 | Change shift date/rate **after external acceptance** preserves accepted legal terms/audit | Frozen terms exist; policy for material change/re-consent not agreed | DECISION_REQUIRED | `shifts/engagement.py`, `shifts/posting.py`; D09 |
| SL-37 | P0 | Non-manager, unrelated pharmacy, inactive admin cannot cancel/alter another's shift | Base manage-scope guards exist; new cancellation action needs explicit permission and negative tests | NOT_YET_VERIFIED | `shifts/base.py`, `organizations/access.py`; D04 |
| SL-38 | P1 | Multiple user personas/organisation-admin and manager checkout navigation | Scoped permissions, shared adapters, separate finance authority; live native proof missing | NOT_YET_VERIFIED | `billing/tests.py`, `shared-core/src/domains/shifts/api.ts` |

## C. Workday, completion, history

| ID | Priority | Persona / journey | Source-level finding | Status | Evidence / tests to extend |
|---|---|---|---|---|---|
| SL-39 | P0 | Worker receives upcoming reminder with correct pharmacy local time | 12–13-hour window reminder task exists | EXISTING_SOURCE_ONLY | `shifts/tasks.py`; midnight, DST, resend and cancellation suppression D12 |
| SL-40 | P0 | Worker arrives: authorised clock-in, breaks, clock-out and correction | Separate attendance domain and test matrix exist | EXISTING_SOURCE_ONLY | `attendance_tests/test_acceptance_matrix.py`, `attendance/transitions.py`; kiosk vs native |
| SL-41 | P0 | Worker does not attend or arrives late; manager replacement/dispute & audit | End-to-end no-show/cancellation semantics not agreed | DECISION_REQUIRED | Attendance vs shift vs billing boundary; D13 |
| SL-42 | P0 | Manager approves timesheet; invoice/payroll settlement is reconciled without duplicate charge | Separate workforce, invoicing and billing flows exist but no single end-to-end evidence | NOT_YET_VERIFIED | `workforce`, `worker_finance`, `invoicing`; D14 |
| SL-43 | P1 | Historical shift preserves correct identities/rates with privacy and audit | History derived via temporal selectors; work-profile redaction in tests | EXISTING_SOURCE_ONLY | `shifts/lifecycle.py`, `shifts/test_shift_listing_contract.py`; cancelled/history state D15 |
| SL-44 | P1 | Ratings/reviews or complaints follow actually completed shifts | Separate rating UX/logic indicated; eligibility following cancel/no-show not established | DECISION_REQUIRED | Worker history UI, rating domain; D15 |
| SL-45 | P0 | Retry/double click/network drop/timeouts produce one financial & booking outcome | Partial idempotence in offered slots and webhook tests; whole-journey proof missing | RISK_TO_PROVE | `billing/tests.py`, `shifts/finalize.py`, PG race |
| SL-46 | P0 | Web Vite/Next + Android/iOS role parity, including resume after app restart | Existing web + native tests exist; no exact-head completed journey evidence | NOT_YET_VERIFIED | `frontend_web/e2e`, `native_mobile_acceptance.yml`, per-platform artifacts |
| SL-47 | P1 | New PR #181 operations planner reads roster state without changing shift ownership | Planner keeps calendar WorkNote authority; interaction with cancellation remains to be checked, not rewritten | NOT_YET_VERIFIED | `docs/architecture/operations_planner_components.md`, `team_calendar`; verify after agreed transitions |
| SL-48 | P0 | E2E proof never touches real workers or production payments | Required harness constraint, not existing journey evidence | NOT_YET_VERIFIED | `scripts/run-staging-qa.sh`, isolated backend, test Stripe events only |

## Convergence acceptance

Every P0/P1 row must either:
- link to exact-head backend, PostgreSQL, Playwright, native (where relevant) tests with a passed result and saved artifact;
- carry an explicit owner-approved `NOT_APPLICABLE`/scope decision; or
- remain `BLOCKED` with owner decision and no merge-ready claim.

**No scenario in this audit has been promoted to VERIFIED.** These 48 rows are a starting completeness inventory, not a declaration that all undiscovered paths are covered. Expand via exploratory TesterArmy agent findings and user interviews; freeze each new scenario ID rather than silently renumbering.
