"""Serialize settlement-linked source changes with existing reviewed periods."""
from django.core.exceptions import ValidationError
from django.db.models import Q
from .models import TimesheetPeriod


def protect_assignment_change(facts, invalidate, *, using='default', message=None):
    facts = tuple(sorted(set(facts)))
    if not facts:
        return
    matches = Q(pk__in=[])
    for pharmacy_id, _user_id, day in facts:
        matches |= Q(pharmacy_id=pharmacy_id, start_date__lte=day, end_date__gte=day)
    periods = list(TimesheetPeriod.objects.using(using).select_for_update(of=('self',), no_key=True)
                   .filter(matches).order_by('pk'))
    locked = [period.pk for period in periods if period.status == TimesheetPeriod.Status.LOCKED]
    if locked:
        raise ValidationError(message or (
            'Correct the locked timesheet period with an audit reason before changing its assignments, '
            'then recalculate and review it.'), code='locked_payroll_period', params={'period_ids': locked})
    # This is durable source invalidation, not optional notification transport.
    for pharmacy_id, user_id, day in facts:
        invalidate(pharmacy_id, user_id, day)
