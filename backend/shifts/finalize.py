"""Finalising an accepted shift offer: assignments, rates and notifications."""
from shifts.pricing import expand_shift_slots, get_locked_rate_for_slot
from shifts.models import ShiftOffer, ShiftSlotAssignment
from decimal import Decimal
from django.db import transaction
from rest_framework.exceptions import ValidationError


def _accepted_offer_rate_for_occurrence(offer, slot_id, slot_date):
    snapshot = getattr(offer, "engagement_terms_snapshot", None) or {}
    for occurrence in snapshot.get("occurrences") or []:
        if str(occurrence.get("slot_id") or "") != str(slot_id or ""):
            continue
        if str(occurrence.get("date") or "") != str(slot_date):
            continue
        value = occurrence.get("agreed_rate")
        if value not in (None, ""):
            return Decimal(str(value))
    return None


def finalize_shift_offer(offer: ShiftOffer):
    """
    Finalize a worker-confirmed offer by creating slot assignments exactly once.
    Safe to call multiple times (idempotent for already assigned slots).
    """
    shift = offer.shift
    slot_obj = offer.slot
    if not shift.single_user_only and slot_obj is None:
        raise ValidationError({"detail": "Offer is missing slot selection."})

    assignment_ids = []
    assignment_rates = []
    slots_to_assign = shift.slots.all() if shift.single_user_only else [slot_obj]

    with transaction.atomic():
        for slot in slots_to_assign:
            for entry in expand_shift_slots(shift):
                if entry["slot"].id != slot.id:
                    continue
                slot_date = entry["date"]
                if ShiftSlotAssignment.objects.filter(slot=slot, slot_date=slot_date).exists():
                    continue

                rate, reason = get_locked_rate_for_slot(
                    shift=shift,
                    slot=slot,
                    user=offer.user,
                    override_date=slot_date,
                )
                accepted_terms_rate = _accepted_offer_rate_for_occurrence(
                    offer,
                    slot.id,
                    slot_date,
                )
                if accepted_terms_rate is not None:
                    rate = accepted_terms_rate
                    reason = {
                        "type": "AcceptedTerms",
                        "source": "AcceptedShiftTerms",
                        "offer_id": offer.id,
                        "settlement_channel": offer.settlement_channel,
                    }
                elif getattr(offer, "offered_rate", None) is not None:
                    rate = Decimal(str(offer.offered_rate))
                    reason = {
                        "type": "Offer",
                        "source": "ShiftOffer",
                        "offer_id": offer.id,
                    }

                assn = ShiftSlotAssignment.objects.create(
                    shift=shift,
                    slot=slot,
                    slot_date=slot_date,
                    user=offer.user,
                    unit_rate=rate,
                    rate_reason=reason,
                    is_rostered=True,
                    payment_preference_snapshot=offer.payment_preference_snapshot,
                    settlement_channel=offer.settlement_channel,
                    engagement_kind=offer.engagement_kind,
                    engagement_terms_snapshot=offer.engagement_terms_snapshot,
                    engagement_terms_accepted_at=offer.engagement_terms_accepted_at,
                    payroll_activated_at=offer.payroll_activated_at,
                    source_offer=offer,
                )
                assignment_ids.append(assn.id)
                assignment_rates.append(assn.unit_rate)

        if offer.status != ShiftOffer.Status.ACCEPTED:
            offer.status = ShiftOffer.Status.ACCEPTED
            offer.save(update_fields=["status", "updated_at"])

    return assignment_ids, assignment_rates
