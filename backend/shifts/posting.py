"""Posting and editing a shift: the application service behind ShiftSerializer.create/update.

The serializer validates and translates the request; these functions apply the business rules (defaults, escalation
level, public limit, dedicated offers, pharmacy rate defaults) and schedule the after-commit announcements.
"""
from decimal import Decimal

from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from shifts.announcements import announce_availability_matches, announce_posted_shift
from shifts.assignment import offer_dedicated_shift
from shifts.emails import send_shift_updated_notifications
from shifts.escalation import ESCALATION_FIELD_MAP
from shifts.limits import enforce_public_shift_daily_limit
from shifts.models import Shift, ShiftSlot


def normalize_money_value(value, *, field_name, slot_index):
    if value in (None, ''):
        return None
    try:
        return Decimal(str(value)).quantize(Decimal('0.01'))
    except Exception:
        raise serializers.ValidationError({
            'slots': [f"Slot #{slot_index} has an invalid {field_name}."]
        })

def normalize_slots_payload(slots_data):
    normalized = []
    for idx, raw_slot in enumerate(slots_data, start=1):
        slot = dict(raw_slot)
        recurring_days = slot.get('recurring_days') or []
        slot['recurring_days'] = sorted({int(day) for day in recurring_days if day is not None})
        slot['rate'] = normalize_money_value(slot.get('rate'), field_name='rate', slot_index=idx)

        if slot.get('is_recurring'):
            if not slot['recurring_days']:
                raise serializers.ValidationError({
                    'slots': [f"Recurring slot #{idx} must include at least one weekday."]
                })
            slot['recurring_end_date'] = slot.get('recurring_end_date') or slot['date']
        else:
            slot['recurring_days'] = []
            slot['recurring_end_date'] = None

        normalized.append(slot)
    return normalized


def post_shift(
    *,
    validated_data,
    slots_data,
    created_by,
    allowed_tiers,
    request_data=None,
    rate_request_data=None,
    notify_pharmacy_staff=False,
    notify_favorite_staff=False,
    notify_chain_members=False,
    apply_rates_to_pharmacy=False,
):
    """Create a validated shift with its slots. Fills rate and payment defaults, counts a platform shift against the
    pharmacy's daily limit, offers a dedicated shift to its worker, optionally copies the rates to the pharmacy, and
    announces the shift after commit. `allowed_tiers` must contain the chosen visibility."""
    pharmacy    = validated_data['pharmacy']
    rate_type   = validated_data.get('rate_type')
    employment_type = validated_data.get('employment_type')

    # Default fixed_rate from pharmacy defaults when rate_type=FIXED and not provided
    if rate_type == 'FIXED' and not validated_data.get('fixed_rate'):
        default_fixed = getattr(pharmacy, 'default_fixed_rate', None)
        weekday_rate = getattr(pharmacy, 'rate_weekday', None)
        slot_rate = next((slot.get('rate') for slot in slots_data if slot.get('rate') is not None), None)
        validated_data['fixed_rate'] = default_fixed or weekday_rate or slot_rate or Decimal('0.00')

    # Default flexible timing for FT/PT if not provided
    if employment_type in ['FULL_TIME', 'PART_TIME'] and 'flexible_timing' not in validated_data:
        validated_data['flexible_timing'] = True

    # Default payment preference for locum shifts if missing
    if not validated_data.get('payment_preference'):
        if employment_type == 'LOCUM':
            from_payload = None
            if request_data is not None:
                from_payload = request_data.get('payment_preference') or request_data.get('paymentPreference')
            validated_data['payment_preference'] = from_payload or 'ABN'
        elif employment_type in ['FULL_TIME', 'PART_TIME']:
            validated_data['payment_preference'] = 'TFN'

    chosen = validated_data.get('visibility')
    if chosen == 'PLATFORM':
        enforce_public_shift_daily_limit(pharmacy)
        if not validated_data.get('escalate_to_platform'):
            validated_data['escalate_to_platform'] = timezone.now()

    # Index of that choice becomes the escalation_level
    validated_data['escalation_level'] = allowed_tiers.index(chosen)
    validated_data['created_by']       = created_by

    with transaction.atomic():
        shift = Shift.objects.create(**validated_data)
        for slot in slots_data:
            ShiftSlot.objects.create(shift=shift, **slot)
        transaction.on_commit(
            lambda: announce_posted_shift(
                shift,
                slots_data,
                notify_pharmacy_staff=notify_pharmacy_staff,
                notify_favorite_staff=notify_favorite_staff,
                notify_chain_members=notify_chain_members,
            )
        )
        transaction.on_commit(lambda: announce_availability_matches(shift))
        if apply_rates_to_pharmacy and validated_data.get('role_needed') == 'PHARMACIST':
            sync_pharmacy_rate_defaults(
                pharmacy,
                shift=shift,
                request_data=rate_request_data,
            )

        dedicated_user = getattr(shift, 'dedicated_user', None)
        if dedicated_user:
            offer_dedicated_shift(shift, dedicated_user)

    return shift


def revise_shift(
    instance,
    validated_data,
    *,
    allowed_tiers=None,
    slots_payload=None,
    rate_request_data=None,
    apply_rates_to_pharmacy=False,
):
    """Apply a validated edit: recalculate the escalation level when the visibility changes (`allowed_tiers` must
    contain it), replace the slots when `slots_payload` is given, optionally copy the rates to the pharmacy, and
    announce the update after commit."""
    # Validate the new slots before changing anything, and apply the whole edit atomically.
    slots_data = normalize_slots_payload(slots_payload) if slots_payload is not None else None
    with transaction.atomic():
        # If visibility is changing, recalc escalation_level
        if 'visibility' in validated_data:
            new_vis = validated_data['visibility']
            target_index = allowed_tiers.index(new_vis)
            instance.escalation_level = target_index
            if new_vis == 'PLATFORM' and not validated_data.get('escalate_to_platform') and not instance.escalate_to_platform:
                validated_data['escalate_to_platform'] = timezone.now()
            ensure_escalation_stamps(instance, allowed_tiers, target_index)

        # Apply other fields
        for attr, val in validated_data.items():
            if attr != 'slots':
                setattr(instance, attr, val)
        instance.save()

        # Replace slots if provided
        if slots_data is not None:
            instance.slots.all().delete()
            for slot in slots_data:
                ShiftSlot.objects.create(shift=instance, **slot)

        if apply_rates_to_pharmacy and instance.role_needed == 'PHARMACIST':
            sync_pharmacy_rate_defaults(
                instance.pharmacy,
                shift=instance,
                request_data=rate_request_data,
            )

        transaction.on_commit(lambda: send_shift_updated_notifications(instance))
    return instance


def ensure_escalation_stamps(shift, allowed_tiers, target_index):
    field_map = ESCALATION_FIELD_MAP
    stamp_time = timezone.now()
    for idx in range(1, target_index + 1):
        if idx >= len(allowed_tiers):
            break
        tier = allowed_tiers[idx]
        field = field_map.get(tier)
        if field and not getattr(shift, field):
            setattr(shift, field, stamp_time)


def sync_pharmacy_rate_defaults(pharmacy, *, shift=None, request_data=None):
    if not pharmacy:
        return

    request_data = request_data or {}

    def get_request_value(*keys):
        for key in keys:
            if key in request_data:
                return request_data.get(key)
        return None

    def to_decimal_or_none(value):
        if value in (None, ''):
            return None
        try:
            return Decimal(str(value))
        except Exception:
            return None

    next_rate_type = (
        get_request_value('rate_type', 'rateType')
        or getattr(shift, 'rate_type', None)
        or getattr(pharmacy, 'default_rate_type', None)
        or 'FLEXIBLE'
    )
    pharmacy.default_rate_type = next_rate_type

    pharmacy.rate_weekday = to_decimal_or_none(get_request_value('rate_weekday', 'rateWeekday'))
    pharmacy.rate_saturday = to_decimal_or_none(get_request_value('rate_saturday', 'rateSaturday'))
    pharmacy.rate_sunday = to_decimal_or_none(get_request_value('rate_sunday', 'rateSunday'))
    pharmacy.rate_public_holiday = to_decimal_or_none(get_request_value('rate_public_holiday', 'ratePublicHoliday'))
    pharmacy.rate_early_morning = to_decimal_or_none(get_request_value('rate_early_morning', 'rateEarlyMorning'))
    pharmacy.rate_late_night = to_decimal_or_none(get_request_value('rate_late_night', 'rateLateNight'))

    fixed_rate_value = (
        get_request_value('fixed_rate', 'fixedRate', 'hourly_rate', 'hourlyRate')
        or getattr(shift, 'fixed_rate', None)
        or pharmacy.rate_weekday
    )
    pharmacy.default_fixed_rate = (
        to_decimal_or_none(fixed_rate_value)
        if next_rate_type == 'FIXED'
        else None
    )

    pharmacy.save(update_fields=[
        'default_rate_type',
        'default_fixed_rate',
        'rate_weekday',
        'rate_saturday',
        'rate_sunday',
        'rate_public_holiday',
        'rate_early_morning',
        'rate_late_night',
    ])
