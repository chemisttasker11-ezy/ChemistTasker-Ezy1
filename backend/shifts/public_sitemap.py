"""Domain-owned public sitemap reads; project transport remains in core."""
from datetime import date
from django.db.models import Count, F, Q
from django.utils import timezone
from shifts.models import Shift


def active_public_shifts():
    today = date.today()
    now_time = timezone.now().time()
    qs = Shift.objects.filter(visibility="PLATFORM").annotate(slot_count=Count("slots", distinct=True),assigned_count=Count("slots__assignments", distinct=True))
    slotless_ftpt = Q(employment_type__in=["FULL_TIME", "PART_TIME"], slot_count=0)
    future_slots = Q(slots__is_recurring=True, slots__recurring_end_date__gte=today) | Q(slots__date__gt=today) | Q(slots__date=today, slots__end_time__gt=now_time)
    open_slots = Q(slot_count__gt=0, assigned_count__lt=F("slot_count"))
    return qs.filter(slotless_ftpt | (future_slots & open_slots)).distinct()
