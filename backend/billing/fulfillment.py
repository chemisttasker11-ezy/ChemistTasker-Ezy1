"""Selected-offer normalization and booking finalization after billing authority is established."""
from shifts.finalize import expire_competing_offers


def _normalize_slot_ids(raw_slot_ids=None, raw_slot_id=None):
    values = raw_slot_ids if raw_slot_ids is not None else raw_slot_id
    if values in (None, '', []):
        return []
    if isinstance(values, str):
        values = [part.strip() for part in values.split(',') if part.strip()]
    elif not isinstance(values, (list, tuple, set)):
        values = [values]

    slot_ids = []
    for value in values:
        try:
            slot_ids.append(int(value))
        except (TypeError, ValueError):
            continue
    return sorted(set(slot_ids))


def _normalize_offer_ids(raw_offer_ids=None, raw_offer_id=None):
    values = raw_offer_ids if raw_offer_ids is not None else raw_offer_id
    if values in (None, '', []):
        return []
    if isinstance(values, str):
        values = [part.strip() for part in values.split(',') if part.strip()]
    elif not isinstance(values, (list, tuple, set)):
        values = [values]

    offer_ids = []
    for value in values:
        try:
            offer_ids.append(int(value))
        except (TypeError, ValueError):
            continue
    return sorted(set(offer_ids))


def _finalize_pending_offers_for_shift(shift, *, candidate_id=None, slot_id=None, slot_ids=None, offer_ids=None, return_offers=False, unbookable=None, checkout_id=None):
    """
    Finalize shift offers waiting on payment.
    If candidate_id/slot_id are provided, narrow the target set.
    With an `unbookable` list, refused pending offers are expired and collected instead of
    failing the whole call; explicitly paid offers in other states are collected unchanged.
    """
    from rest_framework.exceptions import ValidationError
    from shifts.models import ShiftOffer
    from shifts.finalize import finalize_shift_offer

    target_offer_ids = _normalize_offer_ids(offer_ids)
    offers = ShiftOffer.objects.filter(shift=shift).order_by("created_at")
    if not (target_offer_ids and unbookable is not None):
        offers = offers.filter(status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)

    if candidate_id:
        offers = offers.filter(user_id=candidate_id)
    if target_offer_ids:
        offers = offers.filter(id__in=target_offer_ids)
    target_slot_ids = _normalize_slot_ids(slot_ids, slot_id)
    if target_slot_ids:
        offers = offers.filter(slot_id__in=target_slot_ids)

    finalized = 0
    finalized_offers = []
    for offer in offers:
        if offer.status != ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT:
            # This new payment cannot book an offer already consumed or withdrawn.
            unbookable.append(offer)
            continue
        try:
            if checkout_id is None:
                finalize_shift_offer(offer)
            else:
                finalize_shift_offer(offer, checkout_id=checkout_id)
        except ValidationError as exc:
            if unbookable is None:
                raise
            if not isinstance(exc.detail, dict) or exc.detail.get("code") != "checkout_reserved":
                offer.status = ShiftOffer.Status.EXPIRED
                offer.save(update_fields=['status', 'updated_at'])
            unbookable.append(offer)
            continue
        finalized_offers.append(offer)
        finalized += 1
    expire_competing_offers(shift, finalized_offers)
    if return_offers:
        return finalized, finalized_offers
    return finalized
