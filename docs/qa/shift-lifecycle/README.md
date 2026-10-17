## Decision interview — highest-risk domain

The owner requested a comprehensive question-by-question review instead of guessing at cancellation penalties. See [59-question owner interview](OWNER_DECISION_INTERVIEW_D04_D15.md) and [domain separation](WORKFLOW_BOUNDARIES.md). The interview distinguishes roster vs community vs dedicated/private vs owner-chain vs organisation-chain vs public, with favourites as an outreach option, not a visibility tier. Owner-specific notes are required for every question to settle threshold exceptions. Existing D01–D05 answers remain authoritative.

The current `charge_penalty` service's 10%/20% calculation is **not automatically approved for any channel**. The explicit roster-shift escalation endpoint's assignment-clear behaviour and cover approval's automatic LOCUM_CASUAL audience need special D04–D15 tests/decisions. Do not merge or enable new penalties before these decisions are documented.
# Shift lifecycle | journey gap closure

**Status:** Phase 1 discovery and Grill With Docs; **DRAFT, NOT MERGE-READY**.  
**Based on:** PR [#181](https://github.com/chemisttasker11-ezy/ChemistTasker-Ezy1/pull/181), source head `9d1c6b760fcb3bb4e43215d03e37e0aacf047af3`, 17 October 2026.  
**Stacking:** the PR for this folder must target `feat/pharmacy-ops-calendar-publishing-20261016`, **not main**. Do not squash or merge parent work into main.  
**Scope:** end-to-end shift lifecycle, including community/public discovery, direct rostering, candidate interest, counteroffers, accepted offers, payment, changes, cancellation, replacement, attendance, and settlement. PR #181's pharmacy operations planner is **out of scope** except for read-only integration verification.

## Read in this order

1. [Journey register](JOURNEYS.md): stable scenario IDs, evidence, status, and uncovered branches.
2. [Grill With Docs](GRILL.md): accepted decisions versus unanswered questions. Ask only genuinely undecided policy; preserve the owner's prior decisions.
3. [Specification](spec.md): existing invariants and open contracts, not fabricated user policy.
4. [Implementation plan](plan.md) and [tasks](tasks.md): implementation and convergence only after decisions.
5. [Testing and containers](TESTING.md): the project's canonical test commands and explicit limits.

## Evidence hierarchy

1. Owner's explicit accepted business decisions in dated PR handovers and product records.
2. Current **PR #181-head** Django domain source, shared-core and web/native client code.
3. Existing tests and historical execution evidence (do not treat historical passes as current passes).
4. Proposed scenarios from the gap audit (marked as proposals until accepted).

Do **not** call a branch complete because a menu, API route, UI card, or unit test exists. An end-to-end journey is verified only when the actor, initiating action, backend transition, permissions, second-actor effects, notifications, time/financial impact, and platform evidence line up. `IMPLEMENTED_SOURCE_ONLY` is not `VERIFIED`.

## Status legend

- `EXISTING_SOURCE_ONLY` — implementation found, but full end-to-end evidence for this exact head not established.
- `PARTIAL` — part of the required journey exists, but a linked step is absent or unverified.
- `SOURCE_GAP` — source-level absence/mismatch observed in inspected paths; dynamic evidence may still be needed.
- `RISK_TO_PROVE` — potential defect; do not report as reproduced.
- `DECISION_REQUIRED` — current rule cannot be safely inferred.
- `NOT_YET_VERIFIED` — proposed acceptance coverage is not evidenced.
- `VERIFIED` — exact-head recorded test evidence, link, actor, platform and result (currently **none** for this audit).

## Owner-agreed invariants already located

- A direct full-time/part-time/casual pharmacy staff member may be rostered; external locum/Shift Hero workers must accept engagement/offer terms first. See `backend/shifts/assignment.py`, `backend/shifts/browse.py`, `backend/shifts/engagement.py`.
- A "can't work"/cover request **preserves the original assignment** until an authorised manager approves a replacement or release. See `ROSTER-ATTENDANCE-PLAN.md` and `backend/workforce/roster/worker_actions.py`.
- Releasing a worker through the roster route reuses the existing Shift/ShiftSlot and escalation rather than creating a duplicate marketplace shift. See `backend/workforce/roster/worker_actions.py`.
- Private/dedicated bookings must not widen or broadcast; external accepted terms and agreed rates are snapshotted; manager/worker pay visibility follows existing scoped policy. See `docs/handover/pr165/REVIEW_CROSSCHECK_2026-10-12.md`.
- Publication/withdrawal rules for a roster week and an individual shift are distinct. See `docs/architecture/PRODUCTION_ACCEPTANCE_F07.md` and `backend/workforce/roster/publication.py`.
- Owner/org/admin permissions are not interchangeable with billing-account authority. See `backend/billing/utils.py` and `backend/billing/tests.py`.

## Current audit observations — NOT blanket conclusions

- `ShiftOffer.Status` includes `PENDING`, `ACCEPTED_AWAITING_PAYMENT`, `ACCEPTED`, `DECLINED`, and `EXPIRED`. `Shift.payment_status` has `NOT_REQUIRED`, `PENDING`, `PAID`; no dedicated overdue state in these model choices. `backend/shifts/tasks.py` currently contains a reminder task only. See L-16 in the register.
- `BaseShiftViewSet` inherits DRF `ModelViewSet` (including generic destroy), with no shift cancellation/notification action visible there. The shift model enforces save-time roster immutability, not an explicit shift-level delete policy. **Do not assume a destructive DELETE succeeds in every case; test foreign key and publication constraints.**
- The worker's offer acceptance branch checks `PENDING` before `transaction.atomic`, while assignment uniqueness is stored at `(slot,slot_date)`. This is a **concurrency investigation**, not a proven race.
- Billing checkout completion processes payment type and pending-offer finalisation together. Test separately for fulfilment, cancellation penalty, replay, outstanding offers, and delayed events; do not assert incorrect charging or finalisation without execution evidence.
- Current TesterArmy/e2e authenticated suite has login/role-scope journeys, not a complete shift lifecycle. Existing Django contracts/Playwright coverage provide components, but no evidence of the full cross-persona path on this PR head.

## Safety rules

- No schema change, billing charge, webhook replay to live Stripe, real worker messaging, production database mutation, staging deployment, merge, or unapproved policy change in the discovery phase.
- Use disposable accounts and database. Simulate billing with test events; never create a real payment merely to satisfy a test.
- No separate shift state machine, notification ledger, payment engine, or duplicated mobile rules. Implementation must happen in the current owning domain with precise regression evidence.
- Protect PR #181's operations planner: do not touch `team_calendar` or planner UI to solve unrelated shift issues. Work from the exact parent SHA, check for later parent-head movement before final integration.
- Continue one decision branch at a time; record the owner's answer and source before adding implementation tasks.

**Current release verdict: NOT MERGE-READY.** This is a discovery/specification stack, not completed journey fixes.

## 17 October 2026 — Round 1 owner decision update
The owner chose D01=C (reserved, not yet confirmed), D02=D (time-to-start-sensitive deadline, **bands not supplied**), and D03=B (unpaid expiry returns the opening to its original audience with notifications, not an escalated tier). The draft PR now includes a narrow billing guard and a regression test preventing a cancellation-penalty payment from finalizing unpaid fulfillment offers. This is not proof that the new test has passed or that full reservation timeout is implemented. Exact numeric D02 timing must be approved before the automatic expiry rule is enabled.

## Approved generous reservation release — D02 implementation

PR #182 contains Django source changes, additive migrations, Celery expiry, both-party notifications, Stripe late-payment reconciliation, Pills atomic settlement, contract tests and PostgreSQL concurrency tests. The parent PR #181 is still unchanged. See `GRILL.md`, `TESTING.md`, `tasks.md`. Exact-head CI is required: there are **no claimed passing full QA, migration or device results** for this change.

Known release questions: historical legacy unpaid offers, partial-payment Stripe reconciliation, real device countdown UX, full cross-persona cancellation policy. Treat the new implementation as reviewable but not released.

## Implementation checkpoint — final review scope

Source changes now include `shifts/reservations.py`, `shifts/offers.py`, `shifts/finalize.py`, scheduled `shifts/tasks.py`, billing Stripe and Pills settlement guards, payment-deadline/reconciliation model fields with additive migrations, plain-text + HTML worker/manager expiry notices, and date display on Vite and Expo owner cards. Existing Shift/Slot visibility is left unchanged when a reservation times out. Neither cancellation penalties nor refunds occur automatically.

**Known remaining release gates:** CI consistently reports failures across multiple workflows including non-shift/security/linters. Runner logs returned 404 `BlobNotFound`, so no test result is claimed green. The local container has no authenticated GitHub DNS or Docker, so execution of the source repository's Django/PostgreSQL suite was not possible here. A passing PostgreSQL concurrency test and full container run, migration rehearsal, browser and Android/iOS acceptance are mandatory before merge. Full QA label was added to PR #182.

**Known product exception:** historical `ACCEPTED_AWAITING_PAYMENT` rows whose `payment_due_at` is null are deliberately grandfathered rather than expired from guessed legacy timestamps. Finance owners must review pre-existing stuck rows before launch. Paid Stripe events after an expired reservation are flagged for manual reconciliation; no automatic refund has been authorised.

**Branch isolation:** stacked on PR #181, draft, no merge/deployment. Follow `tasks.md` for remaining verification and D04–D15 decisions.

## Round 2 owner decision record

R01=A, R04=A, R06=A, E01=A, E03=A and P02=B are recorded, including all free-text exceptions, in [OWNER_DECISION_REGISTER.md](OWNER_DECISION_REGISTER.md). The interview master file marks those six decisions answered. **No fee, manager window, self-publication permission defaults or direct cancellation conditions are invented.** PR #181 remains unchanged; GitHub CI diagnosis stays deferred.

## Round 3 cumulative-audience correction

The owner specified existing higher-tier publication as **cumulative access** with optional email/notification to earlier groups, not a tier-exclusion feature. PR #182 now contains a narrow backend `CommunityShiftViewSet` access correction and five Django contract tests under `shifts.test_cumulative_community_visibility`. No organisation broadcast or new notification UI added. See `OWNER_DECISION_REGISTER.md`.

## Round 4 — platform warning vs owner fee policy

The owner selected P04=A, P05=OTHER, P06=C, P07=C, P08=B. See exact explanations in [OWNER_DECISION_REGISTER.md](OWNER_DECISION_REGISTER.md). External platform workers face warnings and **platform-reviewed, case-by-case** restrictions; managers only report evidence. Pharmacy/chain/organisation cancellation remains internal in the first instance, but no-show/repeated cancellation badges may apply with evidence review. **Owner-side** cancellation charges apply to external confirmed engagements by notice band, **not** internal employed/roster shifts. The existing flat legacy 10%/20% computation is **not approval of amounts**. PR #182 adds a narrow billing guard and negative tests. No automatic punitive action, refund or fee schedule introduced.
