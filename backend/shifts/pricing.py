"""Shift pricing: award rates, public holidays, day types, slot expansion and locked rates."""
import json
from datetime import datetime, timedelta, date, time
from decimal import Decimal
from pathlib import Path
from django.conf import settings
from django.core.exceptions import ValidationError
from client_profile.models import PharmacistOnboarding, Shift, Membership

# Load static JSON data
BASE_DIR = Path(settings.BASE_DIR)
AWARD_RATES = json.load(open(BASE_DIR / 'client_profile/data/updated_award_rates_casual_first_level_correct_mapping.json'))
PUBLIC_HOLIDAYS = json.load(open(BASE_DIR / 'client_profile/data/public_holidays.json'))

EARLY_MORNING_END = time(8, 0)
LATE_NIGHT_START = time(19, 0)
DECIMAL_ZERO = Decimal('0.00')
FIRST_LEVEL_CLASSIFICATIONS = {
    'ASSISTANT': 'LEVEL_1',
    'TECHNICIAN': 'LEVEL_1',
    'STUDENT': 'YEAR_1',
    'INTERN': 'FIRST_HALF',
    'PHARMACIST': 'PHARMACIST',
}
STATE_CODE_ALIASES = {
    'ACT': 'ACT',
    'AUSTRALIAN CAPITAL TERRITORY': 'ACT',
    'NSW': 'NSW',
    'NEW SOUTH WALES': 'NSW',
    'NT': 'NT',
    'NORTHERN TERRITORY': 'NT',
    'QLD': 'QLD',
    'QUEENSLAND': 'QLD',
    'SA': 'SA',
    'SOUTH AUSTRALIA': 'SA',
    'TAS': 'TAS',
    'TASMANIA': 'TAS',
    'VIC': 'VIC',
    'VICTORIA': 'VIC',
    'WA': 'WA',
    'WESTERN AUSTRALIA': 'WA',
}

def _normalize_state_code(state):
    normalized = (state or '').strip().upper()
    if not normalized:
        return ''
    return STATE_CODE_ALIASES.get(normalized, normalized)


def is_public_holiday(slot_date, state):
    state_code = _normalize_state_code(state)
    if not state_code:
        return False
    return str(slot_date) in PUBLIC_HOLIDAYS.get(state_code, [])


def get_day_type(slot_date, state):
    if is_public_holiday(slot_date, state):
        return 'public_holiday'
    weekday = slot_date.weekday()
    if weekday == 5:
        return 'saturday'
    if weekday == 6:
        return 'sunday'
    return 'weekday'


def _combine_datetime(slot_date, slot_time):
    return datetime.combine(slot_date, slot_time)


def _resolve_shift_bounds(slot_date, start_time, end_time):
    start_dt = _combine_datetime(slot_date, start_time)
    end_dt = _combine_datetime(slot_date, end_time)
    if end_dt <= start_dt:
        end_dt += timedelta(days=1)
    return start_dt, end_dt


def _decimal_hours(start_dt, end_dt):
    seconds = Decimal(str((end_dt - start_dt).total_seconds()))
    return (seconds / Decimal('3600')).quantize(Decimal('0.0001'))


def _split_shift_across_days(slot_date, start_time, end_time):
    start_dt, end_dt = _resolve_shift_bounds(slot_date, start_time, end_time)
    windows = []
    current_start = start_dt

    while current_start < end_dt:
        next_midnight = datetime.combine(current_start.date() + timedelta(days=1), time.min)
        current_end = min(end_dt, next_midnight)
        windows.append({
            'date': current_start.date(),
            'start': current_start,
            'end': current_end,
        })
        current_start = current_end

    return windows


def _resolve_time_bucket(segment_start, segment_end):
    current_date = segment_start.date()
    early_end = datetime.combine(current_date, EARLY_MORNING_END)
    late_start = datetime.combine(current_date, LATE_NIGHT_START)

    if segment_end <= early_end:
        return 'early_morning'
    if segment_start >= late_start:
        return 'late_night'
    return 'daytime'


def _split_day_window_into_segments(day_window):
    current_date = day_window['date']
    boundaries = [
        day_window['start'],
        datetime.combine(current_date, EARLY_MORNING_END),
        datetime.combine(current_date, LATE_NIGHT_START),
        day_window['end'],
    ]
    sorted_points = []
    for point in boundaries:
        if day_window['start'] <= point <= day_window['end']:
            if point not in sorted_points:
                sorted_points.append(point)
    sorted_points.sort()

    segments = []
    for idx in range(len(sorted_points) - 1):
        seg_start = sorted_points[idx]
        seg_end = sorted_points[idx + 1]
        if seg_end <= seg_start:
            continue
        segments.append({
            'date': current_date,
            'start': seg_start,
            'end': seg_end,
            'time_bucket': _resolve_time_bucket(seg_start, seg_end),
            'hours': _decimal_hours(seg_start, seg_end),
        })
    return segments


def _extract_rate_preference(user):
    return (
        PharmacistOnboarding.objects
        .filter(user=user)
        .values_list('rate_preference', flat=True)
        .first()
    ) or {}


def _get_pharmacy_rate_for_key(pharmacy, rate_lookup_key):
    field_map = {
        'weekday': 'rate_weekday',
        'saturday': 'rate_saturday',
        'sunday': 'rate_sunday',
        'public_holiday': 'rate_public_holiday',
        'early_morning': 'rate_early_morning',
        'late_night': 'rate_late_night',
    }
    field_name = field_map.get(rate_lookup_key)
    if not field_name:
        return None
    return getattr(pharmacy, field_name, None)


def _resolve_pharmacist_rate_key(day_type, time_bucket, rate_preference):
    if time_bucket == 'early_morning':
        if rate_preference.get('early_morning_same_as_day'):
            return day_type
        return 'early_morning'
    if time_bucket == 'late_night':
        if rate_preference.get('late_night_same_as_day'):
            return day_type
        return 'late_night'
    return day_type


def _resolve_award_role_key(role_needed):
    if role_needed == 'TECHNICIAN' and 'TECHNICIAN' not in AWARD_RATES:
        return 'ASSISTANT'
    return role_needed


def _get_first_level_award_profile(role_needed):
    role_key = _resolve_award_role_key(role_needed)
    classification_key = FIRST_LEVEL_CLASSIFICATIONS.get(role_needed)
    if not classification_key:
        return None, None, None
    return role_key, classification_key, AWARD_RATES.get(role_key, {}).get(classification_key, {}).get('casual')


def _get_award_rate_for_segment(role_needed, day_type, time_bucket):
    role_key, classification_key, casual_rates = _get_first_level_award_profile(role_needed)
    if not casual_rates:
        raise KeyError(f'No casual award rates found for {role_needed}')

    if time_bucket == 'daytime':
        rate_value = casual_rates.get(day_type)
    else:
        bucket_rates = casual_rates.get(time_bucket) or {}
        rate_value = bucket_rates.get(day_type)

    if rate_value is None:
        raise KeyError(f'No {time_bucket} rate configured for {role_needed} on {day_type}')

    return Decimal(str(rate_value)), {
        'role_key': role_key,
        'classification_key': classification_key,
        'employment': 'casual',
        'time_bucket': time_bucket,
        'day_type': day_type,
    }


def _get_pharmacist_rate_for_segment(shift, day_type, time_bucket, rate_preference):
    rate_type = getattr(shift, 'rate_type', None) or 'FLEXIBLE'

    if rate_type == 'PHARMACIST_PROVIDED':
        rate_key = _resolve_pharmacist_rate_key(day_type, time_bucket, rate_preference)
        rate_value = rate_preference.get(rate_key)
        if rate_value in (None, ''):
            raise KeyError(f'Pharmacist rate preference not configured for {rate_key}')
        return Decimal(str(rate_value)), {
            'source': 'Pharmacist',
            'rate_type': 'PHARMACIST_PROVIDED',
            'rate_key': rate_key,
            'day_type': day_type,
            'time_bucket': time_bucket,
        }

    # Owner-entered pharmacist rates for FIXED/FLEXIBLE shifts are pharmacy defaults
    # for the calendar day. They should not be converted into a weighted hourly
    # average using early-morning/late-night bands.
    rate_key = day_type
    rate_value = _get_pharmacy_rate_for_key(shift.pharmacy, rate_key)
    if rate_value is None:
        raise KeyError(f'Pharmacy rate not configured for {rate_key}')
    return Decimal(str(rate_value)), {
        'source': 'Pharmacy',
        'rate_type': rate_type,
        'rate_key': rate_key,
        'day_type': day_type,
        'time_bucket': time_bucket,
    }


def _format_segment_description(segment):
    bucket_labels = {
        'early_morning': 'early morning',
        'daytime': 'daytime',
        'late_night': 'late night',
    }
    day_labels = {
        'weekday': 'weekday',
        'saturday': 'Saturday',
        'sunday': 'Sunday',
        'public_holiday': 'public holiday',
    }
    return (
        f"{segment['hours']}h "
        f"{bucket_labels.get(segment['time_bucket'], segment['time_bucket'])} "
        f"on {day_labels.get(segment['day_type'], segment['day_type'])} "
        f"at ${segment['rate']}/hr"
    )


def _build_average_explanation(segments, total_hours, average_rate):
    if not segments:
        return 'No rate segments were generated for this shift.'

    if len(segments) == 1:
        only_segment = segments[0]
        return (
            f"This shift uses a single rate segment: "
            f"{_format_segment_description(only_segment)}. "
            f"The effective hourly rate is ${average_rate}/hr."
        )

    segment_parts = [_format_segment_description(segment) for segment in segments]
    return (
        f"This shift crosses multiple pay windows, so the system calculated a weighted average "
        f"across {total_hours} hours. Segments: {'; '.join(segment_parts)}. "
        f"The effective hourly rate shown here is ${average_rate}/hr."
    )


def _price_shift_segments(slot_date, start_time, end_time, shift, rate_preference=None):
    rate_preference = rate_preference or {}
    all_segments = []
    total_hours = DECIMAL_ZERO
    total_pay = DECIMAL_ZERO

    for day_window in _split_shift_across_days(slot_date, start_time, end_time):
        day_type = get_day_type(day_window['date'], getattr(shift.pharmacy, 'state', '') or '')
        for segment in _split_day_window_into_segments(day_window):
            if shift.role_needed == 'PHARMACIST':
                segment_rate, meta = _get_pharmacist_rate_for_segment(
                    shift,
                    day_type,
                    segment['time_bucket'],
                    rate_preference,
                )
            else:
                segment_rate, award_meta = _get_award_rate_for_segment(
                    shift.role_needed,
                    day_type,
                    segment['time_bucket'],
                )
                owner_bonus = getattr(shift, 'owner_adjusted_rate', None) or DECIMAL_ZERO
                if owner_bonus > 0:
                    segment_rate += owner_bonus
                meta = {
                    'source': 'Award',
                    'day_type': day_type,
                    'time_bucket': segment['time_bucket'],
                    'owner_bonus': str(owner_bonus),
                    **award_meta,
                }

            segment_total = (segment_rate * segment['hours']).quantize(Decimal('0.0001'))
            total_hours += segment['hours']
            total_pay += segment_total
            all_segments.append({
                'date': str(segment['date']),
                'start_time': segment['start'].time().strftime('%H:%M:%S'),
                'end_time': segment['end'].time().strftime('%H:%M:%S'),
                'hours': str(segment['hours']),
                'rate': str(segment_rate.quantize(Decimal('0.01'))),
                'line_total': str(segment_total.quantize(Decimal('0.01'))),
                **meta,
            })

    if total_hours <= 0:
        raise ValidationError('Shift duration must be greater than zero.')

    average_rate = (total_pay / total_hours).quantize(Decimal('0.01'))
    rounded_total_hours = total_hours.quantize(Decimal('0.01'))
    rounded_total_pay = total_pay.quantize(Decimal('0.01'))
    return average_rate, {
        'source': 'Pharmacy' if shift.role_needed == 'PHARMACIST' else 'Award',
        'segments': all_segments,
        'total_hours': str(rounded_total_hours),
        'total_pay': str(rounded_total_pay),
        'calculation_method': 'weighted_segment_average',
        'description': _build_average_explanation(all_segments, rounded_total_hours, average_rate),
    }

def get_locked_rate_for_slot(slot, shift, user, override_date=None):
    """
    Calculates the effective hourly rate for a concrete slot.

    The rate is derived from a segment-by-segment analysis:
    - split overnight shifts across calendar days
    - split each day into early-morning / daytime / late-night windows
    - map each segment to public-holiday / weekend / weekday rates
    - compute the weighted average hourly rate for the full slot
    """
    slot_date = override_date or slot.date
    rate_preference = _extract_rate_preference(user) if shift.role_needed == 'PHARMACIST' else {}
    try:
        return _price_shift_segments(
            slot_date,
            slot.start_time,
            slot.end_time,
            shift,
            rate_preference=rate_preference,
        )
    except (KeyError, ValidationError) as exc:
        return DECIMAL_ZERO, {'error': str(exc)}


def calculate_shift_rates(shift, slot_date, start_time, end_time):
    """
    Calculates the preview hourly rate shown on the Post Shift page.

    This uses the same segmented logic as `get_locked_rate_for_slot()` so the owner
    sees the same effective hourly rate that the backend will later lock in.
    """
    rate_preference = getattr(shift, 'rate_preference', None) or {}
    try:
        return _price_shift_segments(
            slot_date,
            start_time,
            end_time,
            shift,
            rate_preference=rate_preference,
        )
    except (KeyError, ValidationError) as exc:
        return DECIMAL_ZERO, {'error': str(exc)}


def expand_shift_slots(shift):
    entries = []
    for slot in shift.slots.all():
        mapped_days = [int(day) for day in (slot.recurring_days or [])]

        def get_hours(start, end):
            dt_start = datetime.combine(slot.date, start)
            dt_end = datetime.combine(slot.date, end)
            return Decimal((dt_end - dt_start).total_seconds() / 3600).quantize(Decimal('0.01'))

        if slot.is_recurring and mapped_days:
            current = slot.date
            end_date = slot.recurring_end_date or slot.date
            while current <= end_date:
                adjusted_weekday = (current.weekday() + 1) % 7
                if adjusted_weekday in mapped_days:
                    entries.append({
                        'date': current,
                        'start_time': slot.start_time,
                        'end_time': slot.end_time,
                        'hours': get_hours(slot.start_time, slot.end_time),
                        'slot': slot
                    })
                current += timedelta(days=1)
        else:
            entries.append({
                'date': slot.date,
                'start_time': slot.start_time,
                'end_time': slot.end_time,
                'hours': get_hours(slot.start_time, slot.end_time),
                'slot': slot
            })
    return entries
