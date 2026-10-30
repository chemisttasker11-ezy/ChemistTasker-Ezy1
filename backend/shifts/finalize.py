"""Finalising an accepted shift offer: assignments, rates and notifications."""
from shifts.pricing import expand_shift_slots, get_locked_rate_for_slot
from shifts.models import Shift, ShiftOffer, ShiftSlot, ShiftSlotAssignment
from decimal import Decimal
from django.db import transaction
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from shifts.engagement import KIND_STAFF_EMPLOYMENT, staff_assignment_defaults
from shifts.events import before_fulfillment


def offer_occurrence_key(offer):
    return offer.slot_id, offer.offered_slot_date


def expire_competing_offers(shift, offers):
    selected_ids = [offer.pk for offer in offers]
    for offer in offers:
        slot_id, slot_date = offer_occurrence_key(offer)
        if slot_id:
            ShiftOffer.objects.filter(
                shift=shift, slot_id=slot_id, offered_slot_date=slot_date,
                status__in=[ShiftOffer.Status.PENDING, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT],
            ).exclude(pk__in=selected_ids).update(status=ShiftOffer.Status.EXPIRED, updated_at=timezone.now())


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


def finalize_shift_offer(offer: ShiftOffer, *, checkout_id=None):
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
    slots_to_assign = [slot_obj] if slot_obj else shift.slots.all()

    with transaction.atomic():
        Shift.objects.select_for_update().get(pk=shift.pk)
        list(ShiftSlot.objects.select_for_update().filter(shift=shift).order_by('pk'))
        offer.refresh_from_db(from_queryset=ShiftOffer.objects.select_for_update(of=("self",)))
        if offer.shift_id != shift.pk:
            raise ValidationError({'detail': 'The selected offer changed. Refresh before fulfillment.'})
        slot_obj = offer.slot
        slots_to_assign = [slot_obj] if slot_obj else shift.slots.all()
        before_fulfillment.send(sender=ShiftOffer, offer=offer, checkout_id=checkout_id)
        # A whole-shift snapshot lists only each slot's first date, so only slot offers narrow to their occurrences.
        occurrences = ((offer.engagement_terms_snapshot or {}).get('occurrences') or []) if slot_obj else []
        accepted_pairs = {(str(entry.get('slot_id')), str(entry.get('date'))) for entry in occurrences}
        matched_pairs = set()
        for slot in slots_to_assign:
            for entry in expand_shift_slots(shift):
                if entry["slot"].id != slot.id:
                    continue
                slot_date = entry["date"]
                if accepted_pairs and (str(slot.id), str(slot_date)) not in accepted_pairs:
                    continue
                if offer.slot_id and offer.offered_slot_date and slot_date != offer.offered_slot_date:
                    continue
                matched_pairs.add((str(slot.id), str(slot_date)))
                existing = ShiftSlotAssignment.objects.filter(slot=slot, slot_date=slot_date).first()
                if existing and existing.source_offer_id != offer.pk:
                    raise ValidationError({'detail': 'This shift occurrence is already assigned.'})
                if existing:
                    continue

                staff_defaults = {}
                if offer.engagement_kind == KIND_STAFF_EMPLOYMENT:
                    staff_defaults = staff_assignment_defaults(
                        user=offer.user, pharmacy=shift.pharmacy, work_date=slot_date,
                    )
                rate, reason = get_locked_rate_for_slot(
                    shift=shift,
                    slot=slot,
                    user=offer.user,
                    override_date=slot_date,
                    staff_terms=staff_defaults.get('engagement_terms_snapshot'),
                )
                accepted_terms_rate = _accepted_offer_rate_for_occurrence(
                    offer,
                    slot.id,
                    slot_date,
                )
                if not staff_defaults and accepted_terms_rate is not None:
                    rate = accepted_terms_rate
                    reason = {
                        "type": "AcceptedTerms",
                        "source": "AcceptedShiftTerms",
                        "offer_id": offer.id,
                        "settlement_channel": offer.settlement_channel,
                    }
                elif not staff_defaults and getattr(offer, "offered_rate", None) is not None:
                    rate = Decimal(str(offer.offered_rate))
                    reason = {
                        "type": "Offer",
                        "source": "ShiftOffer",
                        "offer_id": offer.id,
                    }

                try:
                    assn = ShiftSlotAssignment.objects.create(
                        shift=shift,
                        slot=slot,
                        slot_date=slot_date,
                        user=offer.user,
                        unit_rate=rate,
                        rate_reason=reason,
                        is_rostered=True,
                        payment_preference_snapshot=staff_defaults.get('payment_preference_snapshot', offer.payment_preference_snapshot),
                        settlement_channel=staff_defaults.get('settlement_channel', offer.settlement_channel),
                        engagement_kind=staff_defaults.get('engagement_kind', offer.engagement_kind),
                        engagement_terms_snapshot=staff_defaults.get('engagement_terms_snapshot', offer.engagement_terms_snapshot),
                        engagement_terms_accepted_at=staff_defaults.get('engagement_terms_accepted_at', offer.engagement_terms_accepted_at),
                        payroll_activated_at=offer.payroll_activated_at,
                        source_offer=offer,
                    )
                except DjangoValidationError as exc:
                    if getattr(exc, 'code', None) != 'locked_payroll_period':
                        raise
                    raise ValidationError({'code': exc.code, 'detail': exc.message,
                                           'period_ids': exc.params['period_ids']}) from exc
                assignment_ids.append(assn.id)
                assignment_rates.append(assn.unit_rate)

        if shift.slots.exists() and (not matched_pairs or (accepted_pairs and accepted_pairs != matched_pairs)):
            raise ValidationError({'detail': 'The accepted shift occurrences are no longer available.'})
        if offer.status != ShiftOffer.Status.ACCEPTED:
            offer.status = ShiftOffer.Status.ACCEPTED
            offer.save(update_fields=["status", "updated_at"])

    return assignment_ids, assignment_rates
