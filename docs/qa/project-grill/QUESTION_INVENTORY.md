# Legacy Grill question inventory

**Source:** `docs/qa/launch-grill/questions.json` on `docs/launch-grill-20261020`. The source defines 142 questions across eight areas. This inventory is a routing aid, not an instruction to repeat all 142.

## Original area index

| Legacy area | Question count | IDs/prefixes and focus |
|---|---:|---|
| Onboarding | 19 | ON-Q / ON-P / ON-R; worker tracks, verification, credentials, insurance, pharmacy setup, organisations and mobile parity |
| Post a shift | 17 | PO-Q / PO-P / PO-R; shift details, Award checks, rates, dates, audiences, escalation, anonymity and billing |
| Apply & book | 15 | BK-Q / BK-P / BK-R; booking mode, applicants, offers, expiry, counteroffers, conflicts and reservations |
| Agreements & changes | 12 | AG-Q / AG-P / AG-R; consent, employment/contractor status, changed terms, notices and reminders |
| Cancellations & no-shows | 37 | CX-Q / CX-P / CX-R; cancellation authority, fees, refunds, exemptions, incidents, disputes, completion and ratings |
| Talent board | 10 | TB-Q / TB-P / TB-R; visibility, identity, filters, ratings, booking actions and direct hire |
| Availability | 9 | AV-Q / AV-P / AV-R; calendar, matching, privacy, freshness and alert preferences |
| Fix list & launch | 23 | LA-Q / LA-P / LA-R; code gaps, timing and release choices |
| **Total** | **142** | Original source inventory; counts are not a completion percentage. |

## How to use the inventory

1. Retrieve the original JSON when working on an individual legacy question; keep the original ID, context, options, recommendation and current-behaviour note.
2. Match it to one or more GM areas in AREA_MAP.
3. Mark one status: **carried**, **verify on current head**, **already answered**, **superseded by owner**, **technical defect**, **legal/compliance review**, **optional enhancement**, or **open for owner**.
4. Do not treat the old `current` field as accurate for PR #203 until verified against source and tests at the current head.
5. Do not ask a question again if the ledger contains an explicit answer and no material dependency has changed.
6. If two old questions conflict, present the conflict to the owner with the source references; do not silently choose one.

## Inventory limitation

The full historical question objects, sources and options remain in the archived source file. This compact index deliberately avoids copying hundreds of stale claims into a new document. When the live area is prepared, extract only relevant questions and revalidate them. This avoids creating a false impression that all 142 were re-audited.
