"""Domain-owned public sitemap reads; project transport remains in core."""
from django.db.models import Count, F, Q
from django.utils import timezone
from shifts.models import Shift
from shifts.selectors import _future_or_current_slot_q


def active_public_shifts():
    qs = Shift.objects.filter(visibility="PLATFORM").annotate(slot_count=Count("slots", distinct=True),assigned_count=Count("slots__assignments", distinct=True))
    slotless_ftpt = Q(employment_type__in=["FULL_TIME", "PART_TIME"], slot_count=0)
    future_slots = _future_or_current_slot_q(timezone.now(), None, prefix="slots__")
    open_slots = Q(slot_count__gt=0, assigned_count__lt=F("slot_count"))
    return qs.filter(slotless_ftpt | (future_slots & open_slots)).distinct()
