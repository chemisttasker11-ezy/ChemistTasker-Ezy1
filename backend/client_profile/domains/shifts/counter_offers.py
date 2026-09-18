"""Shift counter-offer query services.

Keeps queryset construction and privacy filtering out of the legacy view module
without moving models or changing endpoint contracts.
"""

from django.db.models import Count

from client_profile.models import ShiftCounterOffer


def visible_counter_offers_for_shift(*, shift, user, can_manage_pharmacy: bool):
    offers = (
        shift.counter_offers
        .select_related('user', 'decided_by')
        .prefetch_related('slots__slot')
        .annotate(slot_count=Count('slots'))
        .filter(
            slot_count__gt=0,
            status=ShiftCounterOffer.Status.PENDING,
        )
    )
    if not can_manage_pharmacy:
        offers = offers.filter(user=user)
    return offers
