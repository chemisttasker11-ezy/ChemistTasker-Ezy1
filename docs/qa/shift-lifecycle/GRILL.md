## Owner interview master packet — 17 October 2026

**START HERE:** [OWNER_DECISION_INTERVIEW_D04_D15.md](OWNER_DECISION_INTERVIEW_D04_D15.md). This 59-question interview distinguishes the **pharmacy's internal operational roster**, **community vacancy**, **favourites outreach**, **private dedicated offers**, **owner-chain**, **organisation-chain**, and **public** marketplace. It separately grills cancellation initiation, manager authorisation, timing warnings, financial penalties, booking fee refunds, worker compensation, no-show, history and notification privacy. Every question includes a user-notes field.

This packet does **not** overrule D01=C, D02=generous, D03=B, D04=A, or D05=C. D04 still requires a clarification about the owner's phrase "both can cancel with guards": for confirmed work, does an external worker **request** cancellation or can they **directly** release under specified notice windows? The owner has not yet chosen the thresholds or audience-specific consequences. All unselected options are provisional and **not implementation authority**.

**Findings from actual PR #182 source that make this important:**
- `billing/views.py:charge_penalty`: one owner-side wage-percentage checkout (10% inside 72h; 20% inside 24h), no audience differentiation, calculated using earliest assignment start for the shift, no clear per-occurrence penalty provenance.
- `workforce/roster/views.py:RosterShiftManageViewSet.escalate`: explicit roster-escalation route deletes existing slot assignments when widening; this cannot silently bypass worker cover approvals or immutable timesheet histories.
- `shifts/worker_requests.py:approve`: currently chooses `LOCUM_CASUAL` for approved cover release even if the manager did not specifically select that audience. Owner's desired handoff audience and publication review are unresolved.
- `shifts/escalation.py`: actual tiers depend on active owner chain and organisation; favourites is a notification recipient flag, **not a tier**.
- `shifts/announcements.py`: staff/favourites/chain are opt-in notification audiences conditioned by posting visibility; a notice is not a booking and should not create cancellation liability.

No new financial charges, automatic refunds, forced staff wage deductions or irreversible external cancellation transitions may be built solely from this preliminary document.

# Grill With Docs — shift lifecycle decision interview

Source: PR #181 exact parent SHA `9d1c6b760fcb3bb4e43215d03e37e0aacf047af3`. **Do not re-ask established policy.** Answer the first decision below before implementing cancellation/payment transitions. Record answers in this document, then converge against the agreed spec.

## Already decided — never grill again without a specific contradiction
- Direct rostered pharmacy staff may be assigned; external locums/Shift Heroes must accept their offer and ABN/TFN terms.
- A worker's **request** for cover/leave/swap does not automatically remove them from the assignment. A manager must approve a replacement or release.
- Releasing a worker reuses the existing Shift and Slot, with existing marketplace escalation, no duplicate shift.
- Private booking is private, cannot silently widen/broadcast.
- Existing accepted rate/engagement terms are snapshotted. Preserve financial and role scope.
- Roster slot unpublish differs from whole-week unpublish; no bypass of approved roster protection.
- No automatic charging of a cancellation penalty has been approved; existing endpoint creates a voluntary Stripe checkout session rather than charging a card directly.
- Existing code currently uses owner cancellation penalty windows: within 24 hours 20% of expected wage, within 72 hours 10%, beyond 72 hours 0%. **This is a code observation, not approval to apply automatically or to workers.**

## Round 1 owner decisions — 17 October 2026 (confirmed)

| Decision | Owner selection | Binding behaviour | Remaining precision |
| --- | --- | --- | --- |
| D01 | **C** | Worker acceptance makes a **temporary reservation**, not a confirmed/assigned shift. Confirmation requires verified final payment. Show reserved/payment-pending distinctly to worker and pharmacy. | Ensure no double booking, no pending state portrayed as confirmed. |
| D02 | **D** | Payment deadline must **vary with proximity to shift start** and never extend beyond that start. | **The owner has not yet specified numeric lead-time bands or timeout durations.** Engineering may add configurable tested policy, but must not turn invented thresholds into production-active owner policy. |
| D03 | **B** | Once a valid reservation deadline passes without fulfilled payment: **expire reservation**, notify affected worker and pharmacy manager(s), and restore the opportunity to the **same existing audience**. Do **not** advance escalation tier automatically or charge a penalty. Preserve immutable accepted terms/audit history. | Late successful Stripe events require safe reconciliation and no stale rebooking; finance exception action requires explicit rules. |

Owner message: "D01 booking=C; D02 payment deadline=D; D03 failure handling=B; Additional notes: None."

Implementation limit: verified payment events alone confirm; payment-required acceptance must not create an assignment, and unconfigured numeric D02 thresholds must not silently go live. No automatic refund/charge or post-expiry rebooking from delayed events.

## First interview — critical decision gates

**D01 [ANSWERED: C]. When does the external worker become firmly booked?** Currently payment-required acceptance puts the offer in `ACCEPTED_AWAITING_PAYMENT` without assignment. Do you want (A) confirmed *only after owner payment*, (B) reserved and contractually committed on worker acceptance with payment collected later, or (C) another rule? Clarify what is displayed to both actors and whether a worker can accept another conflicting shift while payment is outstanding.

**D02 [ANSWERED: D; numerical bands pending]. How long does owner payment have after worker acceptance?** Choose an explicit deadline, potentially shorter when the shift begins soon; define reminder, failure, abandonment and expiry behaviour. What if start time arrives while still unpaid? What if a payment webhook arrives after expiry? Don't assume Stripe checkout success URL constitutes payment.

**D03 [ANSWERED: B]. If payment expires or fails, what happens to the original accepted offer?** Release/reserve/keep? Notify who? Automatically restore prior tier or restart escalation? Preserve agreed terms and audit. Can an owner retry checkout, and for how long?

**D04. What are the user-visible cancellation actions and authorities?** Distinguish *delete unpublished draft*, *withdraw unfilled advertised shift*, *cancel confirmed external booking*, *worker requests cancellation*, *manager approves release*, and *cancel rostered internal shift*. Who may perform each: Owner, Org Admin, delegated Admin/Manager, worker? Does anyone have unilateral cancellation power?

**D05. For multi-slot/recurring shifts, is cancellation per occurrence, per selected slots, entire posting, or all three?** Confirm which records remain active; payments, ratings and notifications must reconcile only impacted assignments, not erase other booked days.

**D06. Declined/expired offered shifts:** should the candidate slot reopen to the existing audience immediately, automatically escalate next tier, or return to manager review? How is the original candidate informed and for how long may they reconsider?

**D07. Which participants get which notifications?** On cancel, cover request, manager approval, replacement, reinstatement and payment failure: old worker, replacement, owner, pharmacy/organisation admins, watchers? Specify in-app/push/email, avoid duplicates and sensitive identity leakage.

**D08. Pharmacy cancels an accepted or paid shift:** retain code's penalty timing and percentage, change it, or make it manual pending dispute? When is a fee waived? Is an unpaid worker-accepted offer eligible for any penalty?

**D09. Material change after acceptance:** does date/time, role, rate, pharmacy, duration, or travel/accommodation require new explicit worker consent? What happens until they accept? What if they reject? Prevent silent alteration of frozen agreement.

**D10. If a payment was already made and a shift is cancelled:** who receives refund, credit, or adjustment and under what conditions? Separate platform booking fee from worker compensation and invoice; no automatic Stripe refunds without an approved policy.

**D11. Dispute/exception handling:** who can override fees or terms, with what audit reason? Can the case be reopened, and who can see it?

**D12. Scheduled reminders:** should cancelled, partially cancelled, replaced, or unconfirmed/unpaid shifts send reminders? One reminder per shift/occurrence or per worker? What happens for changes inside the 12-hour window?

**D13. No-show/late arrival:** how long after start before it qualifies as no-show, who confirms it, can an urgent replacement be published, and how do penalties/wages/disputes work?

**D14. Completion:** what is the authoritative completion gate: actual clock-out, timesheet approval, invoice issuance, employer approval, or a combination? How should payroll/ABN invoice flows differ?

**D15. History and rating:** do cancelled/expired/no-show shifts remain visible to both actors? Can they rate one another when no work occurred? What privacy limits apply?

## Interview discipline
- Ask one tightly related cluster at a time, **starting D01–D03**. Do not ask all fifteen questions at once.
- For each answer record: `Decision ID | owner answer | agreed effective rule | scenarios affected | exact source date | implementation acceptance criteria`.
- If policy already exists in a dated handover, prefer referencing it to re-interviewing the owner; apparent source conflicts require explaining the conflict before asking.
- No developer may convert a recommendation into an approved business policy without the owner's answer.
- Once D01–D03 are settled, implement and test the payment lifecycle independently, then continue cancellation D04–D11 and workday D12–D15.

## Round 1 timing amendment — owner approved generous policy, 17 October 2026

**D02 = generous (APPROVED):** At worker acceptance, calculate the earliest applicable upcoming shift start in the pharmacy's timezone, then reserve until the earlier of that start and:
- Start **more than 48 hours away**: 24 hours after acceptance.
- Start **more than 12 up to 48 hours away**: 6 hours after acceptance.
- Start **more than 2 up to 12 hours away**: 2 hours after acceptance.
- Start **up to 2 hours away**: 30 minutes after acceptance.

For a start closer than the selected allowance, the deadline is capped to shift start. If no eligible future dated occurrence exists, no new paid reservation may be accepted. D01=C and D03=B remain in effect: reservation only, then automatic expiry and same-audience return with worker/manager notifications, never auto penalty/escalation. The owner separately authorised implementation and targeted Django/PostgreSQL testing. **Existing historical unpaid accepted offers with no deadline require an independent reconciliation policy; do not retroactively invent their expiry.**

## Financial reconciliation rule (safety, not refund authorisation)

A verified Stripe settlement that arrives after expiry is recorded with `ShiftPayment.needs_reconciliation=True` and must not resurrect the old worker booking. This flags a finance exception for manual review; no automatic refund, credit, chargeback or charge is authorised without D08–D11.

## D04–D15 progress and decision boundary — 17 October 2026

The owner has instructed continuation **through D15**, but this is approval to **investigate and implement approved safety invariants**, not agreement to any one cancellation/penalty/no-show/refund policy. No financial transfer, assignment release or cancellation has been automatically enabled. A safe source change now blocks generic shift DELETE once there is an offer, applicant history, roster relationship, assignment, payment, or financial status; it preserves ordinary deletion for pristine, unengaged shifts. Slot collection replacement is likewise rejected when it would destroy interested/engaged occurrence identities. See `shifts/deletion.py`, `shifts/base.py`, `shifts/posting.py`, `shifts/test_deletion_safety.py`.

**D04–D05:** ownership/permission and per-occurrence vs whole-shift cancelled state remain for owner choice. Meanwhile hard deletion cannot substitute for cancellation. Existing approved worker requests and roster replacement rules remain the only supported release path.

**D06–D07:** existing worker offer-decline/expiry and notification contracts remain; do not invent automatic escalation or cross-tenant notifications. D03 specifically retains the same audience for unpaid reservation expiry, but does not decide treatment for ordinary declined offers or cancellations.

**D08–D11:** current optional `charge_penalty` percentages are source behaviour, not an approved mandatory fee. Never issue automatic payment/refund or silently restore booked work from a late webhook. Financial exception reconciliation remains separate.

**D12:** attendance reminders are currently derived from real `ShiftSlotAssignment` records. Pending payment reservations have no assignment and therefore are excluded by construction; cancellation reminder suppression needs a proper cancelled assignment-state decision.

**D13–D14:** attendance, manager corrections and invoice/payroll have separate authoritative domains. Do not infer a no-show penalty or paid-completion gate merely from elapsed time.

**D15:** the current confirmed/history queries derive from assignments and occurrence times. Protect records and history visibility; rating eligibility for unworked/cancelled engagements requires owner rule.

Before implementing the remaining state transitions, collect owner answers to D04+D05 (actions, authority and cancellation granularity), D06+D07 (offer fallback and notification recipient matrix), D08–D11 (penalties/refunds/consent/disputes), and D12–D15 (attendance/reminders/history). The first cluster should be answered **before** allowing irreversible cancellation.

## Owner workflow separation — 17 October 2026

The owner explicitly distinguished **roster/internal community shifts** from **publication and post-shift distribution** through organisation, public, favourites and escalation. Record this correction separately from the D04/D05 cancellation choices; the two publication mechanisms must never be treated as the same action. See `WORKFLOW_BOUNDARIES.md`.

D04=A: owner or authorised pharmacy/organisation manager can perform approved cancellation; worker can request cancellation or cover with assignment retained until approval. D05=C: allow individual, selected and whole-posting scope **once their safe side effects are specified**. Owner separately requests both sides to have cancellation actions with time-to-shift warnings, guards and potential penalties, with room to describe exceptions. **Penalty thresholds, who can unilaterally cancel, and whether approval is required for a particular time band are not yet resolved.** No automatic financial consequence or confirmed-assignment release is authorised yet.

## Round 2 approved — R01=A, R04=A, R06=A, E01=A, E03=A, P02=B (17 October 2026)

Canonical detailed decisions and source-level gaps: [OWNER_DECISION_REGISTER.md](OWNER_DECISION_REGISTER.md). Preserve owner's R04 explanation on staff-initiated swaps/cover and pharmacy-configurable provisional publication; incumbent stays assigned until approved or fulfilled replacement. Public-platform cancellation requires reason/notification and a manager-approval guard when sufficient notice exists; exact window **not chosen**. The owner permits skipped eligible audience tiers, independently suppressed notifications, and anonymously published public shifts. Owner selects escalation intervals at posting. Penalty policy is **audience/source-primary** rather than contract-primary, with employment/legal constraints always applicable. No automatic new fee or release is authorised. Continue focused clarifications C/E/X/P/F/N/H before irreversible workflow implementation.
