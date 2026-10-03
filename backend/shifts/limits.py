"""Limits on public shift posting."""
from shifts.models import Shift
from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError


MAX_PUBLIC_SHIFTS_PER_DAY = 10


def enforce_public_shift_daily_limit(pharmacy, *, max_per_day: int = MAX_PUBLIC_SHIFTS_PER_DAY, on_date=None):
    """
    Ensure the given pharmacy has not already published the daily quota of public shifts.
    Counts shifts that became public today either via creation (created_at) or escalation timestamps.
    """
    target_date = on_date or timezone.localdate()

    platform_shifts_today = Shift.objects.filter(
        pharmacy=pharmacy,
        visibility='PLATFORM',
    ).filter(
        Q(escalate_to_platform__date=target_date) |
        Q(escalate_to_platform__isnull=True, created_at__date=target_date)
    ).count()

    if platform_shifts_today >= max_per_day:
        raise ValidationError({
            'detail': f'Maximum of {max_per_day} public shifts per day reached for {pharmacy.name}.'
        })
