# ChemistTasker PR200 — High-risk senior semantic source challenge (25 October 2026)

Frozen main: `b77e9fd296bc2710350ef6f3cd402ce2529ffc06`. Audit head at review: `c8fe2c8e0414976a8c53818eed17556b34febe55`. **No production source was modified.**

## Results

| Existing ID | Source-supported causal conclusion | Status |
|---|---|---|
| B03 | Permanent membership deletion removes participation then deletes membership; chat Message.sender is CASCADE, deleting that person's conversation history. | SOURCE_SUPPORTED; S3 NOT_REPRODUCED |
| B06 | Ordinary staff's pharmacy membership grants org ID for CalendarFeed; org filter queries notes from all org pharmacies without intersecting visible pharmacy IDs. Product policy for org-wide note access must be checked. | SOURCE_SUPPORTED_POLICY_SCOPE_PENDING; S3 NOT_REPRODUCED |
| B07 | Calendar event and WorkNote edits authorize current source object only; serializers make destination pharmacy or organization writable, allowing potential move to unauthorized location. | SOURCE_SUPPORTED; S3 NOT_REPRODUCED |
| B15 | Payment webhook processes any paid session metadata type with shift_id, including cancellation, then unconditionally calls _finalize_pending_offers_for_shift and writes shift payment status. | SOURCE_SUPPORTED; S3 NOT_REPRODUCED |
| B29 | Clock drift/backward/monotonic flags mark signed offline kiosk event NEEDS_REVIEW, but only chain/sequence/revocation block _apply_business_event; timestamp still mutates live attendance. | SOURCE_SUPPORTED; S3 NOT_REPRODUCED |
| B33 | Legacy authenticated invoice POST only stamps user; serializer exposes pharmacy/status and issuer/recipient fields without tenant validation; a user can attribute self-created paid/sent invoice to unrelated pharmacy by source path. | SOURCE_SUPPORTED; S3 NOT_REPRODUCED |
| B36 | Authenticated RosterShiftManageViewSet ModelViewSet registers POST and scopes only get_queryset; default create invokes ShiftSerializer.post_shift with caller-specified pharmacy but no create-time manage permission. | SOURCE_SUPPORTED; S3 NOT_REPRODUCED |
| B68 | Stripe invoice.paid does local subscription ID lookup then falls back to any owner subscription sharing customer; marks active and may bind unmatched external subscription ID. Requires provider-side mismatched-ID scenario. | SOURCE_SUPPORTED_CONDITIONAL; S3 NOT_REPRODUCED |
| B69 | Repeated cancellation penalty requests each create Checkout; webhook dedupes by event ID, while ShiftPayment has no per-obligation/payment-intent unique constraint, permitting separate paid records. | SOURCE_SUPPORTED; S3 NOT_REPRODUCED |
| B70 | Base subscriber request only blocks active tracked subscription, allowing another pending Stripe Checkout or send_invoice subscription; extra-seat checkout is also repeatable before webhook receipt. | SOURCE_SUPPORTED; S3 NOT_REPRODUCED |

Each checked finding has immutable line links, a negative exploit/abuse test and a positive behavior-preservation test in [SOURCE_CHALLENGE_20261025.json](evidence/pr200_finish/SOURCE_CHALLENGE_20261025.json). **B06 is conditional on intended privacy policy. B68 requires a matching provider-identity sandbox scenario.** No new finding IDs or duplicated root findings were created.

## Refuted narrow Next direct-booking notification subclaim

The Next TalentBoard preserves `dedicated_user` in its handoff. The backend's `protect_direct_booking` forces LOCUM_CASUAL and clears escalation, while both posted-shift and availability-match announcers explicitly skip dedicated bookings. Thus older reports that notify flags alone send a dedicated booking to unrelated workers are contradicted by source. **Do not extrapolate to complete direct-booking authorization or UI parity.** Linked refutation is in [DEDUPLICATION_20261025.json](evidence/pr200_finish/DEDUPLICATION_20261025.json).

## Gate

No source-only finding establishes a completed attack. Pending tests must target actual authenticated endpoints, separate pharmacies/organisations, DB/Stripe transaction and session rollback, native offline state and recipient delivery. All three original P0 F03-N1/F04-N1/F04-N2 remain source confirmed only. **NO-GO; this PR is documentation not a fix.**
