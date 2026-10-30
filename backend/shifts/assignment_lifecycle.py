"""Atomic assignment writes publish their affected source facts before persistence."""
from datetime import timedelta
from django.db import transaction
from shifts.events import assignment_changing


SETTLEMENT_FIELDS = (
    'shift_id', 'slot_id', 'slot_date', 'user_id', 'unit_rate', 'rate_reason', 'is_rostered',
    'payment_preference_snapshot', 'settlement_channel', 'engagement_kind',
    'engagement_terms_snapshot', 'engagement_terms_accepted_at', 'payroll_activated_at', 'source_offer_id',
)


def _dated_facts(pharmacy_id, user_id, day, start, end):
    if not pharmacy_id or not user_id or not day:
        return set()
    dates = {day}
    if start is not None and end is not None and end <= start:
        dates.add(day + timedelta(days=1))
    return {(pharmacy_id, user_id, date) for date in dates}


def _payroll_booking(values):
    return values.get('settlement_channel') == 'PAYROLL' and (
        values.get('is_rostered') or values.get('source_offer_id'))


def payroll_booking(instance, previous=None):
    return _payroll_booking({field: getattr(instance, field) for field in SETTLEMENT_FIELDS}) or (
        previous is not None and _payroll_booking(previous))


def assignment_facts(instance):
    if not instance.slot_id or not instance.shift_id:
        return set()
    slot = instance.slot
    return _dated_facts(instance.shift.pharmacy_id, instance.user_id,
                        instance.slot_date or slot.date, slot.start_time, slot.end_time)


def _normalized(instance, name, value):
    field = instance._meta.get_field(name)
    return (field.target_field if field.is_relation else field).to_python(value)


def persist_assignment(instance, save, roster_guard, args, kwargs):
    using = kwargs.get('using') or instance._state.db or 'default'
    update_fields = kwargs.get('update_fields')
    if update_fields is not None and not update_fields:
        return save(*args, **kwargs)
    with transaction.atomic(using=using):
        previous = None
        if instance.pk:
            previous = type(instance).objects.using(using).select_for_update(of=('self',)).filter(pk=instance.pk).values(
                *SETTLEMENT_FIELDS, 'shift__pharmacy_id', 'slot__date', 'slot__start_time', 'slot__end_time',
            ).first()
        roster_guard(instance)
        relevant = [field for field in SETTLEMENT_FIELDS if update_fields is None or field in update_fields
                    or (field.endswith('_id') and field[:-3] in update_fields)]
        if payroll_booking(instance, previous) and (previous is None or any(
                _normalized(instance, field, previous[field]) != _normalized(instance, field, getattr(instance, field))
                for field in relevant)):
            facts = assignment_facts(instance)
            if previous:
                facts |= _dated_facts(previous['shift__pharmacy_id'], previous['user_id'],
                    previous['slot_date'] or previous['slot__date'], previous['slot__start_time'], previous['slot__end_time'])
            assignment_changing.send(sender=type(instance), instance=instance, facts=tuple(sorted(facts)), using=using)
        return save(*args, **kwargs)


SLOT_SOURCE_FIELDS = ('shift_id', 'date', 'start_time', 'end_time', 'planned_break_minutes',
                      'is_recurring', 'recurring_days', 'recurring_end_date')


def persist_slot(instance, save, validate, args, kwargs):
    """A time/date edit is a payroll source edit even when assignments use bulk move."""
    using = kwargs.get('using') or instance._state.db or 'default'
    update_fields = kwargs.get('update_fields')
    with transaction.atomic(using=using):
        previous = None
        if instance.pk:
            previous = type(instance).objects.using(using).select_for_update(of=('self',)).filter(pk=instance.pk).values(
                *SLOT_SOURCE_FIELDS, 'shift__pharmacy_id').first()
        validate()
        relevant = [field for field in SLOT_SOURCE_FIELDS if update_fields is None or field in update_fields
                    or (field.endswith('_id') and field[:-3] in update_fields)]
        if previous and any(previous[field] != getattr(instance, field) for field in relevant):
            facts = set()
            for assignment in instance.assignments.using(using).all():
                if not payroll_booking(assignment):
                    continue
                facts |= _dated_facts(previous['shift__pharmacy_id'], assignment.user_id,
                    assignment.slot_date or previous['date'], previous['start_time'], previous['end_time'])
                facts |= _dated_facts(instance.shift.pharmacy_id, assignment.user_id,
                    assignment.slot_date or instance.date, instance.start_time, instance.end_time)
                if instance.date != previous['date']:
                    facts |= _dated_facts(instance.shift.pharmacy_id, assignment.user_id,
                        instance.date, instance.start_time, instance.end_time)
            if facts:
                assignment_changing.send(sender=type(instance), instance=instance, facts=tuple(sorted(facts)), using=using)
        return save(*args, **kwargs)
