# Stage D — Booking / roster assignment protection evidence

**Historical checkpoint — superseded by [the completed Stage D route/writer ledger](SURGICAL_STAGE_D_EVIDENCE_20261029.md).** Subsequent deterministic verification found additional invoice/leave-history gaps, parent deletion cascades and lock-order deadlocks. In particular, the single-assignment PATCH and obsolete-recurring-cleanup rows below were not fully history-guarded at the stated evidence head. The later ledger records the actual reproductions, surgical fixes, positive controls and final execution results. This preserved checkpoint is not the final closure evidence.

**Date:** 29 October 2026, Australia/Brisbane  
**Repository / draft PR:** `chemisttasker11-ezy/ChemistTasker-Ezy1`, PR #213  
**Branch:** `fix/surgical-backend-consistency-20261029`  
**Evidence head before this document:** `49dd1f15c31b3a468654e95cb544ec4bdc86910a`  
**Status:** Production mutation-path review substantially complete. One genuine bulk-move history gap was repaired in `0bc2da97c8d31c511bd0f7ccece60a7d9f834e91`. The finalisation-vs-manual-assignment PostgreSQL race was added in `060b3b3b760ed15556505e39be609cd7f5757c42` and its test-only billing-state import was corrected in `49dd1f15c31b3a468654e95cb544ec4bdc86910a`. Final closure still depends on exact-head targeted CI being green.

## Protected business rule

A shift occurrence that is already booked, payment-pending, or tied to protected workforce history must not be silently erased, moved, reassigned, or mutated through a different writer. Legitimate edits to ordinary unprotected roster rows must continue to work.

For concurrent legitimate entry points, row locking must serialize ownership so that at most one assignment survives for an occurrence.

## Mutation-path ledger

| Writer / route | Protection / behaviour | Evidence | Status |
| --- | --- | --- | --- |
| Public offer finalisation | Locks Shift and ShiftSlot rows before assignment creation; refuses conflicting assignment and preserves idempotent own assignment | `backend/shifts/finalize.py`; offer acceptance contract tests | Guarded |
| Manual assignment | Uses the roster direct-staff service and occurrence locking/guards; booked and payment-pending occurrences are rejected | `backend/shifts/test_assignment_protection.py` | Guarded |
| Offer finalisation vs manual assignment race | Both paths converge on the same occurrence locking contract; exactly one succeeds | `OfferConfirmationRaceTests.test_finalize_and_manual_assignment_serialize_on_the_same_occurrence` | Guarded; PostgreSQL race |
| Offer vs offer acceptance race | Competing workers cannot both reserve/book the same occurrence | Existing `OfferConfirmationRaceTests` coverage | Guarded; PostgreSQL race |
| Community claim | Locks membership, Shift and selected ShiftSlot rows, revalidates visibility/eligibility and checks occurrence before creation | `backend/shifts/browse.py` | Guarded |
| Single roster assignment PATCH | Locks slot/assignment and applies roster/booked protection before mutation | `backend/workforce/roster/views.py`; assignment-protection tests | Guarded |
| Single roster assignment DELETE | Applies published-roster, history and booked-occurrence protections before deletion | `backend/workforce/roster/views.py`; assignment-protection tests | Guarded |
| Roster PATCH worker replacement | Protects changed/removed assignments and applies occurrence guards before replacement | `backend/workforce/roster/views.py`; assignment-protection tests | Guarded |
| Roster PATCH assignment clearing | Protects removed assignment history and booked occurrences before queryset deletion | `backend/workforce/roster/views.py`; clear/cleanup tests | Guarded |
| Obsolete recurring assignment cleanup | Applies protected-history / booked-occurrence checks before deletion | `backend/workforce/roster/views.py`; recurring-cleanup tests | Guarded |
| Roster-shift DELETE | Locks shift; refuses booked/payment-pending offer state; protects assignment history before cascade | `backend/workforce/roster/views.py`; roster-shift delete tests | Guarded |
| Bulk assign | Uses roster assignment guard before creating/replacing an assignment | `backend/workforce/roster/bulk_edit.py`; bulk tests | Guarded |
| Bulk unassign | Checks ownership/marketplace state, assignment history and occurrence guard before deletion | `backend/workforce/roster/bulk_edit.py`; bulk tests | Guarded |
| Bulk time edit | Applies occurrence guard before changing protected times | `backend/workforce/roster/bulk_edit.py`; bulk tests | Guarded |
| Bulk slot delete | Protects assignment history and refuses marketplace-offer state before deletion | `backend/workforce/roster/bulk_edit.py`; bulk tests | Guarded |
| Bulk move | Old and target occurrence guards plus explicit `_protect_assignment_history` on all attached assignments before date rewrite | `backend/workforce/roster/bulk_edit.py`; `test_bulk_move_refuses_assignment_with_invoice_history` | Guarded after PR #213 fix |
| Escalation | Refuses booked/payment-pending occurrence; concurrent booking finalisation survives escalation | `backend/workforce/tests/test_roster_escalation_lock.py` and assignment-protection tests | Guarded |
| Swap / cover / release | Refuse booked/payment-pending occurrence; plain roster equivalents remain allowed | `backend/workforce/tests/test_assignment_protection.py` | Guarded |
| Shift edit / pharmacy move / slot replacement | Shift and slot mutation paths refuse incompatible assignment/payment-pending state | `backend/shifts/posting.py`; posting contracts | Guarded |
| Billing fulfilment | Paid/free fulfilment finalises through `finalize_shift_offer` rather than a second assignment writer | `backend/billing/views.py` | Guarded through shared finaliser |
| AHPRA cancellation | Deliberate destructive workflow; locks assignments, protects history, deletes only safe rows, retains history-linked bookings | `backend/shifts/cancellation.py` | Guarded deliberate exception path |
| Leave approval | Locks/revalidates assignment context but does not delete/reassign the assignment | `backend/workforce/leave_service.py` | Non-destructive |
| Background reminder tasks | Read-only assignment queries; no booking mutation | `backend/shifts/tasks.py` | Non-writer |
| Django admin direct assignment edit/delete | Model-level roster protection exists, but full booked/history invariant is not universally enforced at model level | `backend/shifts/admin.py`, `backend/shifts/models.py` | Intentional privileged superadmin exception |

## Genuine gap found and repaired

Before `0bc2da97c8d31c511bd0f7ccece60a7d9f834e91`, bulk `move_shift` changed the slot date and then used a queryset `update(slot_date=target_date)` on attached assignments. `QuerySet.update()` bypasses model `save()`, and this path did not explicitly call assignment-history protection.

That meant an assignment linked to invoice, leave or attendance history could be moved through the bulk writer while other roster writers correctly refused that mutation.

The repair materialises the attached assignments, calls `_protect_assignment_history(...)` for each before changing the slot date, and then updates only those known assignment PKs. The existing transaction rolls the whole move back on failure.

Regression: `test_bulk_move_refuses_assignment_with_invoice_history` proves both the slot date and assignment date remain unchanged. Existing positive control `test_plain_rostered_staff_stay_editable` proves ordinary roster movement still works.

## Concurrency evidence

Stage D has explicit PostgreSQL evidence for the important cross-entry races:

1. offer vs offer: only one worker can reserve/book the same occurrence;
2. booking finalisation vs escalation: a newly finalised booking cannot be deleted by escalation;
3. offer finalisation vs manual assignment: one path succeeds, one returns a controlled refusal, and exactly one assignment survives.

The third race initially failed in hosted CI only because the test imported a non-existent `BILLING_STATE_FREE` constant. Commit `49dd1f15c31b3a468654e95cb544ec4bdc86910a` corrects the test to use the existing free-trial billing state. No production code was changed by that correction.

## Positive controls retained

The review does not only prove bad cases are refused. Existing coverage also proves legitimate unprotected operations remain available, including:

- plain rostered worker edits;
- free-occurrence bulk assignment;
- plain assignment update/delete;
- plain roster clearing and recurring cleanup;
- plain bulk unassign and time edits;
- plain swap/cover/release;
- plain escalation.

## Stage D closure rule

Stage D may be marked complete for reachable production paths when the exact PR head demonstrates:

- PostgreSQL finalisation-vs-manual-assignment race green;
- bulk invoice-history move regression green;
- existing assignment-protection suites green;
- no newly identified production writer bypasses the same invariant.

Django superadmin remains an explicit privileged exception by product-owner decision and is not a release defect.

This document does not authorize merge, deployment, or live provider operations.
