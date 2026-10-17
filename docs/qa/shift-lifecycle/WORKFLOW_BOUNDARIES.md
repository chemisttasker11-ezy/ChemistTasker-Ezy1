# Distinct shift journeys — owner correction, 17 October 2026

This is an explicit correction to PR #182. **Do not collapse weekly roster publication, internal community vacancies, and marketplace posting into one publication/cancellation engine.**

## A. Workforce roster: operational publication
- Authority: `workforce/roster` and its reviewed publication command, revision, warning acknowledgements, manager permissions and publication audit.
- Actors: owner/authorised manager and employed staff. States: draft roster → reviewed/published week → worker acknowledgement → individual unpublish/edit/republish → cover request, swap or manager-authorised release → attendance/timesheet.
- Roster **publication** is communication to assigned staff. It does NOT automatically create an open public/community job advertisement, charge a marketplace booking fee or widen visibility.
- Worker "can't work" remains a manager-review request. Do not remove assignment when request is created.
- Explicit authorised manager release can reuse its current Shift/ShiftSlot and hand it to the existing marketplace distribution mechanism with an audit record. The handoff is not an automatic consequence of calendar edits or weekly publication.
- Tests: `workforce/tests/test_publication_contract.py`, `test_roster_shift_republish.py`, `attendance_tests/test_roster_worker_actions.py` plus new boundary tests.

## B. Internal community shifts: vacancies, not weekly roster publication
- Authority: `shifts/posting.py`, `shifts/browse.py`, `shifts/assignment.py` and `shifts/escalation.py`; workforce owns roster records where present.
- `FULL_PART_TIME` = regular pharmacy staff audience; `LOCUM_CASUAL` = eligible pharmacy favourites/locum membership audience.
- A community vacancy can be posted or can be the **explicit result of authorised roster release**. For its occurrence identity, retain the original Shift and ShiftSlot. No duplicate shift or duplicate assignment.
- Payment/engagement rules depend on the worker type and employer membership: direct employees versus external locums are **not interchangeable**.
- Decline/expiry/cancellation fallback for an ordinary offer is separate from D03 unpaid payment expiry.
- An internal community audience must not widen merely because a roster was published, withdrawn or modified.

## C. Marketplace and network distribution: post-shift publication / escalation
- Authority: `shifts/posting.py`, `shifts/escalation.py`, `shifts/announcements.py` and ownership/access helpers in `organizations`.
- Optional tiers, only when legally/technically available: `FULL_PART_TIME → LOCUM_CASUAL → OWNER_CHAIN → ORG_CHAIN → PLATFORM`.
- `OWNER_CHAIN` requires a matching active pharmacy owner chain. `ORG_CHAIN` requires claimed organisational membership/association. `PLATFORM` is public and subject to public quota, role eligibility and privacy controls.
- A **favourites list** is a targeted recipient/notification option, **not a visibility tier**. Team-staff, favourites, and owner-chain notices are switches on a newly posted vacancy, conditioned by audience and anonymity. Do not conflate the selected notify flag with posting or escalation authority.
- Direct/dedicated booking is a separate private invitation; it cannot widen/broadcast to an audience.
- Automatic due-tier escalation is not permitted for a shift still owned by the operational roster. An authorised release must happen first, with its own workforce audit.
- Newly introduced read-only classification and guard: `shifts/distribution.py`; named tests: `shifts/test_distribution_boundaries.py`. The generic marketplace escalation code consumes the read-only guard; no new state machine or duplicated publication table.

## Cancellation rules must remain distinct

| Boundary | D04/D05 effect | D06–D15 dependency |
|---|---|---|
| Internal roster shift | Workforce authoritative. Worker requests cover; authorised manager acts through roster commands. Published-week and individual-shift guards respected. | Staff leave, swaps, attendance and time approvals; do not apply platform booking penalties by default. |
| Community vacancy | Shift-domain cancellation request may affect specified slot+date; existing roster/engagement history retained. | External worker legal terms; fallback same vs escalated audience requires owner rule. |
| Owner-/organisation-chain job | Same marketplace cancellation transaction with additional manager/admin/chain privacy scoping. | Network notifications and policy-specific consequences. |
| Public job board | Same marketplace owner-approved transition and user-facing visibility. | Remove cancelled occurrence from public discovery, handle refund/penalty separately. |
| Favourite-list notification | A *notification*, not a new cancellation or posting workflow. | Avoid sending a cancellation to everyone who received an initial alert when only assigned workers need notice. |
| Dedicated booking | No audience escalation. | Communicate only with the invited worker and responsible pharmacy managers. |

## Test gate
- [ ] Execute isolated Django `shifts.test_distribution_boundaries`, `shifts.test_deletion_safety`, `shifts.test_access_escalation_contract`, `workforce.tests.test_roster_escalation`.
- [ ] Execute PostgreSQL real concurrency and full senior-package acceptance in appropriate Docker/Codex environment.
- [ ] Trace actual host UI (Vite, Next, Expo) and approval flows independently for A, B, C.
- [ ] Preserve the exact PR #181 parent and no change to planner/calendar authority. GitHub CI failures deferred on owner request.

**Status:** domain classification and guard/tests committed; runtime not verified. Cancellation timing fees and unilateral-guard decisions remain unresolved. No deployment/merge.
