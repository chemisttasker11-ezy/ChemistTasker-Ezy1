"""Finalising an accepted shift offer: assignments, rates and notifications."""
from shifts.pricing import expand_shift_slots, get_locked_rate_for_slot
from shifts.models import Shift, ShiftOffer, ShiftSlot, ShiftSlotAssignment
from datetime import timedelta
from decimal import Decimal
from django.db import OperationalError, transaction
from django.core.exceptions import ValidationError as DjangoValidationError
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from shifts.access import ShiftActionRefused
from shifts.assignment import lock_shift_offer_credentials
from shifts.booking import ensure_worker_booking_available, lock_booking_workers
from shifts.engagement import KIND_STAFF_EMPLOYMENT, staff_assignment_defaults
from shifts.events import before_fulfillment
from shifts.notifications import notify_worker_credentials
from shifts.occurrences import accepted_occurrence_pairs, accepted_occurrences


class BookingRosterBusy(ValidationError):
    default_detail = {'detail': 'The roster is being edited. Try confirming this booking again.'}


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


def _lock_roster_revisions(shift, occurrences):
    # Assignment saves update these weeks. Roster edits lock their week before their workers.
    weeks = {row['date'] - timedelta(days=row['date'].weekday()) for row in occurrences}
    try:
        list(shift.pharmacy.roster_periods.select_for_update(nowait=True).filter(
            week_start__in=weeks,
        ).order_by('pk').values_list('pk', flat=True))
    except OperationalError as exc:
        cause = exc.__cause__
        if (getattr(cause, 'sqlstate', None) or getattr(cause, 'pgcode', None)) != '55P03':
            raise
        raise BookingRosterBusy() from exc


def _check_fulfillment_credentials(offer):
    try:
        credentials = lock_shift_offer_credentials(offer.user, offer.shift, manager=True, schedule_recheck=False)
    except ShiftActionRefused as exc:
        # Paid fulfillment reconciles a refused booking through its existing validation path.
        raise ValidationError(exc.detail) from exc
    notify_worker_credentials(offer.shift, offer.user, credentials)


def finalize_shift_offer(offer: ShiftOffer, *, checkout_id=None, payment_completed_at=None):
    """
    Finalize a worker-confirmed offer by creating slot assignments exactly once.
    Safe to call multiple times (idempotent for already assigned slots).
    """
    assignment_ids = []
    assignment_rates = []

    with transaction.atomic():
        shift = Shift.objects.select_for_update().get(pk=offer.shift_id)
        offer.refresh_from_db(from_queryset=ShiftOffer.objects.select_for_update(of=("self",)))
        if offer.shift_id != shift.pk:
            raise ValidationError({'detail': 'The selected offer changed. Refresh before fulfillment.'})
        if not shift.single_user_only and not offer.slot_id:
            raise ValidationError({"detail": "Offer is missing slot selection."})

        lock_booking_workers([offer.user_id])
        list(ShiftSlot.objects.select_for_update().filter(shift=shift).order_by('pk'))
        before_fulfillment.send(
            sender=ShiftOffer, offer=offer, checkout_id=checkout_id, payment_completed_at=payment_completed_at,
        )
        occurrences = list(accepted_occurrences(offer, expand_shift_slots(shift)))
        accepted_pairs = accepted_occurrence_pairs(offer)
        matched_pairs = {(str(row['slot'].pk), str(row['date'])) for row in occurrences}
        if shift.slots.exists() and (not matched_pairs or (accepted_pairs and accepted_pairs != matched_pairs)):
            raise ValidationError({'detail': 'The accepted shift occurrences are no longer available.'})

        new_occurrences = []
        for entry in occurrences:
            existing = ShiftSlotAssignment.objects.filter(slot=entry['slot'], slot_date=entry['date']).first()
            if existing and existing.source_offer_id != offer.pk:
                raise ValidationError({'detail': 'This shift occurrence is already assigned.'})
            if not existing:
                new_occurrences.append(entry)
        if new_occurrences:
            _check_fulfillment_credentials(offer)
        ensure_worker_booking_available(offer, new_occurrences)
        if new_occurrences:
            _lock_roster_revisions(shift, new_occurrences)

        for entry in new_occurrences:
            slot, slot_date = entry['slot'], entry['date']
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

            if 'error' in reason:
                raise ValidationError({
                    'code': 'booking_rate_unavailable',
                    'detail': 'The booking rate could not be determined. Review the shift or employment rates.',
                })

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

        if offer.status != ShiftOffer.Status.ACCEPTED:
            offer.status = ShiftOffer.Status.ACCEPTED
            offer.save(update_fields=["status", "updated_at"])

    return assignment_ids, assignment_rates
