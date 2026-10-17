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
