## Complete owner interview: eight independent subdomains

- [x] Inspect current parent/child refs, roster publishing, explicit roster escalation, community discovery, owner/organisation/public tiers, favourite outreach, and existing charge_penalty code.
- [x] Create a 59-question owner interview with individual choice and notes space: `OWNER_DECISION_INTERVIEW_D04_D15.md`.
- [x] Distinguish roster publication from market posting; distinguish audience from favourites notifications and worker employment contract.
- [ ] Owner answer rounds R/C/E/X/P/F/N/H as appropriate (59 questions in eight sections); log decisions and exceptions with date.
- [ ] Resolve conflicting direct-cancel versus manager-reviewed worker cancellation; treat prior D04=A as binding until explicitly changed.
- [ ] Resolve the unsafe explicit roster escalation release path and source of authorisation/audit; do not disable or rewrite accepted published-roster behaviour without domain tests.
- [ ] Decide whether approved cover releases are always LOCUM_CASUAL or need manager-selected audience.
- [ ] Replace global wage-percentage cancellation checkout assumptions with audience/contract/actor/occurrence-aware policy after explicit agreement and Australian employment/contract review.
- [ ] Implement later agreed changes only in their owning workforce/shifts/billing/attendance domains, each with exact-head Django+Postgres+web+Expo proof.
- [ ] Github CI diagnosis remains deferred until owner-directed QA stage.

# Tasks and convergence backlog

- [x] Identify exact PR #181 parent head and create isolated child branch.
- [x] Inspect Docker runbook, Playwright, TesterArmy, and native acceptance workflow definitions.
- [x] Audit primary shift source paths and record 48 candidate journey scenarios.
- [x] Extract existing accepted rules, note source gaps and proposed questions.
- [ ] Run disposable targeted tests against child exact head; save commands, counts, job URLs/traces.
- [ ] Verify generic shift DELETE outcome for every consequential shift state (including source-offer FK and published-roster constraints).
- [ ] Prove/refute SL-23 cancellation webhook finalization and SL-16/24 concurrent acceptance anomalies.
- [ ] Obtain owner decisions D01–D03; update `GRILL.md` and specification before changing payment behaviour.
- [ ] Implement confirmed payment transitions in owning domain with dedicated tests.
- [ ] Obtain owner decisions D04–D11; implement audited cancellation, replacement and notifications without parallel tables.
- [ ] Obtain owner decisions D12–D15; implement confirmed attendance/settlement/history handling.
- [ ] Expand real-stack acceptance with owner → worker → manager → cancellation/replacement multi-persona path.
- [ ] Run targeted Django/PostgreSQL, full isolated Docker, web/visual and native gates on exact head.
- [ ] Converge spec/plan/tasks until no unexplained gap remains, then independently verify artifacts.
- [ ] Rebase/update with later PR #181 changes after explicit source ancestry review.
- [ ] Mark MERGE-READY only after authorisation, all mandatory gates, and resolved P0 decisions.

All unchecked items are **not done**; a static source investigation never marks a runtime check green.

## 17 October 2026 progress
- [x] Record D01=C, D02=D, D03=B on the child PR without changing parent PR #181.
- [x] Correct a financial cross-purpose path: cancellation penalty checkout must not finalize pending fulfillment offers; add Django regression coverage.
- [ ] Run `billing.tests.StripeWebhookIdempotencyTests.test_paid_cancellation_penalty_does_not_confirm_reserved_worker` in isolated Django backend and record exact-head evidence.
- [ ] D02: agree lead-time bands and corresponding deadlines; **do not** activate arbitrary threshold values.
- [ ] Enforce expiry with persisted deadline, atomic state transition, original-audience restoration, idempotent notifications, Stripe late-paid reconciliation, and tests once D02 numeric policy is approved.

## D02 generous policy and implementation checkpoint — 17 October 2026

- [x] Owner approved generous D02 deadline bands; record branch thresholds at 48h, 12h and 2h and cap at shift start.
- [x] Persist payment deadline/expiry and financial reconciliation via additive, domain-owned migrations.
- [x] On payment-required worker acceptance, set deadline under shift/offer lock and distinguish reserved from confirmed notifications.
- [x] Register every-minute Celery beat expiry task; expire with shift-row lock and transaction-on-commit notifications to affected worker and pharmacy managers.
- [x] Preserve same audience and original Shift/Slot: no duplicate publication or automatic escalation.
- [x] Reject stale Stripe checkout attempts and stale Pills payments, and make Pills debit+finalisation atomic.
- [x] Leave verified late Stripe funds recorded for reconciliation without silently rebooking worker.
- [x] Add deadline, expiry, late-event, replay, positive fulfillment and PostgreSQL race tests; include PG tests in isolated QA script.
- [ ] Record actual execution results for Django test subset and PG test subset; code presence is not a pass.
- [ ] Inspect exact-head GitHub workflow results and full isolated QA job logs. At present many jobs have failed/queued and log download is unavailable.
- [ ] Populate migrated/synthetic Postgres and rehearse rollback/backup/upgrade safely.
- [ ] Independently verify real Next/Vite/Expo payment countdown and cross-persona notifications/refresh, Android and iOS.
- [ ] Design an explicitly approved disposition for historical `ACCEPTED_AWAITING_PAYMENT` offers with `payment_due_at IS NULL`.
- [ ] Owner grill D04–D11 cancellation/fees; no unilateral cancellation policy invented.

**NOT MERGE-READY**, even though the implementation paths are committed. Do not merge or deploy.

## D04–D15 continuation — irreversible-operation safety gate

- [x] Audit inherited DELETE and destructive slot replacement against existing assignment, applicant, published roster and payment models.
- [x] Add domain-owned hard-delete guard: only pristine unengaged shifts may use ordinary deletion; rostered, offered, paid, reserved, candidate-history or audited shifts require future explicit cancellation.
- [x] Block destructive collection replacement once the shift has offers, interest, counteroffers or assignments.
- [x] Add Django endpoint regression coverage for unchanged pristine delete, linked offer/interest/payment refusal, slot identity retention and cross-tenant worker permission refusal.
- [x] Re-read existing roster/worker-request safeguards and refuse to substitute a new release engine for roster manager approval.
- [ ] Execute `python3 backend/manage.py test shifts.test_deletion_safety shifts.test_reservations --settings=core.contract_test_settings` in the authenticated Codex Docker environment; record actual output.
- [ ] D04/D05 owner policy: cancel confirmed external worker, authority, whole-shift/occurrence/recurring selection, preserving payment/audit.
- [ ] D06/D07 owner policy: standard offer decline/expiry audience, notifications and privacy.
- [ ] D08–D11 owner policy: penalties, refunds, post-acceptance amendments, fee overrides, audit and disputes.
- [ ] D12–D15 owner policy: reminders, no-show threshold, completion authority, ratings/history.
- [ ] Only after each owner choice, implement approved transitions in existing shifts/workforce/billing/attendance domains and test real PostgreSQL, web and native flows.

**Do not interpret the guardrail as completion of D04–D15.** Nothing has been merged, deployed or passed in runtime testing here. GitHub CI remains deferred by owner request.

## Publication/workflow separation — user correction

- [x] Verify workforce's weekly publication/unpublication and worker-action ownership against architecture and prior roster contract.
- [x] Verify internal community vacancy tiers and distinct favourites recipient outreach (not a visibility tier).
- [x] Verify Owner Chain/Organisation/Public escalation only through owning shift marketplace domain and eligibility/quota.
- [x] Add read-only classification + generic marketplace escalation guard against widening roster-owned/dedicated shifts.
- [x] Add boundary tests for roster ownership, manual vs auto escalation, explicit release and private offers.
- [x] Extend PR182 container test script with roster-versus-posting boundary tests.
- [ ] Review roster-specific `roster-shifts/{id}/escalate` as an **explicit manager action** and determine its safe release auditing contract, without silently changing its existing accepted behaviour.
- [ ] Owner D04-D15 cancellation and timing rules still require distinct responses by roster/community/marketplace context.
- [ ] Execute targeted tests in a real Codex/Docker checkout; not executed here.
