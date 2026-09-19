import json
from datetime import datetime, timedelta, date, time
from decimal import Decimal
from pathlib import Path
from django.conf import settings
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from client_profile.models import PharmacistOnboarding, OtherStaffOnboarding, Pharmacy, Shift, ShiftSlotAssignment, InvoiceLineItem, Invoice, Membership

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

INVOICE_SETTLEMENT_CHANNEL = "INVOICE"
INDEPENDENT_CONTRACTOR_KIND = "INDEPENDENT_CONTRACTOR"


def _invoice_routed_assignments(user, *, shift_ids=None, shift=None, for_update=False):
    qs = ShiftSlotAssignment.objects.filter(
        user=user,
        settlement_channel=INVOICE_SETTLEMENT_CHANNEL,
        engagement_kind=INDEPENDENT_CONTRACTOR_KIND,
        engagement_terms_accepted_at__isnull=False,
    ).select_related("shift", "slot", "shift__pharmacy", "source_offer")
    if shift is not None:
        qs = qs.filter(shift=shift)
    if shift_ids is not None:
        qs = qs.filter(shift_id__in=shift_ids)
    if for_update:
        qs = qs.select_for_update()
    return qs


def validate_internal_invoice_shifts(user, shift_ids, pharmacy_id=None, *, assignments=None):
    requested = {int(value) for value in (shift_ids or [])}
    if not requested:
        raise ValidationError("Select at least one accepted ABN shift to invoice.")

    assignments = list(assignments) if assignments is not None else list(
        _invoice_routed_assignments(user, shift_ids=requested)
    )
    routed_shift_ids = {assignment.shift_id for assignment in assignments}
    missing = sorted(requested - routed_shift_ids)
    if missing:
        raise ValidationError({
            "shift_ids": (
                "Only accepted assignments routed to invoicing can be billed. "
                f"Not invoice-routed for this worker: {missing}."
            )
        })

    if pharmacy_id not in (None, ""):
        pharmacy_id = int(pharmacy_id)
        wrong_pharmacy = sorted({
            assignment.shift_id
            for assignment in assignments
            if assignment.shift.pharmacy_id != pharmacy_id
        })
        if wrong_pharmacy:
            raise ValidationError({
                "pharmacy": f"The selected shifts do not all belong to pharmacy {pharmacy_id}: {wrong_pharmacy}."
            })
    return assignments


def _accepted_invoice_rate(assignment, slot_date):
    snapshot = assignment.engagement_terms_snapshot or {}
    for occurrence in snapshot.get("occurrences") or []:
        if str(occurrence.get("slot_id") or "") != str(assignment.slot_id):
            continue
        if str(occurrence.get("date") or "") != str(slot_date):
            continue
        agreed_rate = occurrence.get("agreed_rate")
        if agreed_rate not in (None, ""):
            rate = Decimal(str(agreed_rate))
            if rate > 0:
                return rate

    if assignment.unit_rate is not None and assignment.unit_rate > 0:
        return Decimal(str(assignment.unit_rate))

    raise ValidationError({
        "rate": (
            f"Accepted invoice terms for assignment {assignment.pk} do not contain a positive agreed rate. "
            "Resolve the shift terms before invoicing."
        )
    })


def _invoice_line_from_assignment(assignment):
    slot = assignment.slot
    slot_date = assignment.slot_date
    start_dt, end_dt = _resolve_shift_bounds(slot_date, slot.start_time, slot.end_time)
    hours = _decimal_hours(start_dt, end_dt)
    rate = _accepted_invoice_rate(assignment, slot_date)
    total = (hours * rate).quantize(Decimal("0.01"))
    snapshot = assignment.engagement_terms_snapshot or {}
    return {
        "id": f"{assignment.shift_id}-{slot.id}-{slot_date}",
        "assignmentId": assignment.id,
        "shiftId": assignment.shift_id,
        "shiftSlotId": slot.id,
        "date": str(slot_date),
        "start_time": slot.start_time.strftime("%H:%M:%S"),
        "end_time": slot.end_time.strftime("%H:%M:%S"),
        "description": f"{str(slot_date)} {slot.start_time.strftime('%H:%M')}-{slot.end_time.strftime('%H:%M')}",
        "category": "ProfessionalServices",
        "category_code": "ProfessionalServices",
        "unit": "Hours",
        "quantity": float(hours),
        "unit_price": float(rate),
        "discount": 0,
        "total": float(total),
        "gst_applicable": bool(snapshot.get("gst_registered", False)),
        "super_applicable": bool(snapshot.get("super_review_required", False)),
        "was_modified": False,
        "locked": True,
        "rate_reason": {
            "source": "AcceptedShiftTerms",
            "assignment_id": assignment.id,
            "offer_id": assignment.source_offer_id,
            "settlement_channel": assignment.settlement_channel,
        },
    }


def generate_preview_invoice_lines(shift, user):
    assignments = list(
        _invoice_routed_assignments(user, shift=shift).order_by("slot_date", "slot_id", "id")
    )
    if not assignments:
        raise ValidationError(
            "This shift has no accepted ABN assignment routed to invoicing for the current worker."
        )
    return [_invoice_line_from_assignment(assignment) for assignment in assignments]


def recalculate_invoice_totals(invoice, *, ensure_generated_super_line=True):
    line_items = list(invoice.line_items.all().order_by("id"))
    non_super = [line for line in line_items if line.category_code != "Superannuation"]
    manual_super = [
        line for line in line_items
        if line.category_code == "Superannuation" and line.was_modified
    ]
    generated_super = [
        line for line in line_items
        if line.category_code == "Superannuation" and not line.was_modified
    ]

    subtotal = sum((line.total for line in non_super), Decimal("0.00")).quantize(Decimal("0.01"))
    gst_base = sum(
        (line.total for line in non_super if line.gst_applicable),
        Decimal("0.00"),
    )
    gst_amount = (
        (gst_base * Decimal("0.10")).quantize(Decimal("0.01"))
        if invoice.gst_registered
        else Decimal("0.00")
    )

    if manual_super:
        super_amount = sum((line.total for line in manual_super), Decimal("0.00")).quantize(Decimal("0.01"))
        for line in generated_super:
            line.delete()
    else:
        super_base = sum(
            (line.total for line in non_super if line.super_applicable),
            Decimal("0.00"),
        )
        super_amount = (
            super_base * (invoice.super_rate_snapshot / Decimal("100"))
        ).quantize(Decimal("0.01"))
        if ensure_generated_super_line:
            primary = generated_super[0] if generated_super else None
            for extra in generated_super[1:]:
                extra.delete()
            if super_amount > 0:
                if primary is None:
                    InvoiceLineItem.objects.create(
                        invoice=invoice,
                        description="Superannuation",
                        category_code="Superannuation",
                        unit="Lump Sum",
                        quantity=Decimal("1.00"),
                        unit_price=super_amount,
                        discount=Decimal("0.00"),
                        total=super_amount,
                        gst_applicable=False,
                        super_applicable=False,
                        is_manual=True,
                        was_modified=False,
                    )
                else:
                    primary.description = "Superannuation"
                    primary.quantity = Decimal("1.00")
                    primary.unit_price = super_amount
                    primary.discount = Decimal("0.00")
                    primary.total = super_amount
                    primary.gst_applicable = False
                    primary.super_applicable = False
                    primary.is_manual = True
                    primary.save(update_fields=[
                        "description", "quantity", "unit_price", "discount", "total",
                        "gst_applicable", "super_applicable", "is_manual",
                    ])
            elif primary is not None:
                primary.delete()

    invoice.subtotal = subtotal
    invoice.gst_amount = gst_amount
    invoice.super_amount = super_amount
    invoice.total = (subtotal + gst_amount + super_amount).quantize(Decimal("0.01"))
    invoice.save(update_fields=["subtotal", "gst_amount", "super_amount", "total"])
    return invoice


def _internal_invoice_source_snapshot(assignments):
    return {
        "version": 1,
        "source": "INTERNAL_ABN_SHIFT_ASSIGNMENTS",
        "assignment_ids": [assignment.id for assignment in assignments],
        "shift_ids": sorted({assignment.shift_id for assignment in assignments}),
        "accepted_terms": [
            {
                "assignment_id": assignment.id,
                "source_offer_id": assignment.source_offer_id,
                "settlement_channel": assignment.settlement_channel,
                "engagement_kind": assignment.engagement_kind,
                "accepted_at": (
                    assignment.engagement_terms_accepted_at.isoformat()
                    if assignment.engagement_terms_accepted_at
                    else None
                ),
                "terms": assignment.engagement_terms_snapshot or {},
            }
            for assignment in assignments
        ],
    }


def generate_invoice_from_shifts(
    user,
    pharmacy_id=None,
    shift_ids=None,
    custom_lines=None,
    external=False,
    billing_data=None,
    due_date=None,
):
    billing_data = billing_data or {}
    custom_lines = list(custom_lines or [])

    try:
        ob = PharmacistOnboarding.objects.get(user=user)
    except PharmacistOnboarding.DoesNotExist:
        ob = OtherStaffOnboarding.objects.get(user=user)

    gst_registered = billing_data.get("gst_registered", False)
    if isinstance(gst_registered, str):
        gst_registered = gst_registered.lower() in ["true", "1", "yes"]

    raw_shift_ids = billing_data.get("shift_ids", shift_ids)
    if raw_shift_ids:
        shift_ids = json.loads(raw_shift_ids) if isinstance(raw_shift_ids, str) else list(raw_shift_ids)
    else:
        shift_ids = []

    external = billing_data.get("external", external)
    if isinstance(external, str):
        external = external.lower() in ["true", "1", "yes"]

    try:
        with transaction.atomic():
            locked_assignments = []
            if not external:
                locked_assignments = list(
                    _invoice_routed_assignments(
                        user,
                        shift_ids=shift_ids,
                        for_update=True,
                    ).order_by("shift_id", "slot_date", "slot_id", "id")
                )
                validate_internal_invoice_shifts(
                    user,
                    shift_ids,
                    pharmacy_id=pharmacy_id,
                    assignments=locked_assignments,
                )
                assignment_ids = [assignment.id for assignment in locked_assignments]
                already_invoiced = (
                    InvoiceLineItem.objects
                    .filter(
                        source_assignment_id__in=assignment_ids,
                        category_code="ProfessionalServices",
                    )
                    .select_related("invoice", "source_assignment")
                    .first()
                )
                if already_invoiced:
                    raise ValidationError({
                        "shift_ids": (
                            f"Assignment {already_invoiced.source_assignment_id} is already billed "
                            f"on invoice #{already_invoiced.invoice_id}."
                        )
                    })

            invoice = Invoice.objects.create(
                user=user,
                external=external,
                issuer_first_name=user.first_name,
                issuer_last_name=user.last_name,
                issuer_abn=ob.abn or "",
                issuer_email=user.email,
                gst_registered=gst_registered,
                super_fund_name=billing_data.get("super_fund_name", ""),
                super_usi=billing_data.get("super_usi", ""),
                super_member_number=billing_data.get("super_member_number", ""),
                super_rate_snapshot=Decimal(str(billing_data["super_rate_snapshot"])),
                bank_account_name=billing_data["bank_account_name"],
                bsb=billing_data["bsb"],
                account_number=billing_data["account_number"],
                cc_emails=billing_data.get("cc_emails", ""),
                due_date=due_date,
                source_snapshot=(
                    _internal_invoice_source_snapshot(locked_assignments)
                    if not external
                    else {
                        "version": 1,
                        "source": "EXTERNAL_CUSTOMER",
                        "line_count": len(custom_lines),
                    }
                ),
            )

            if not external:
                pharmacy = Pharmacy.objects.get(pk=pharmacy_id)
                invoice.pharmacy = pharmacy
                invoice.pharmacy_name_snapshot = pharmacy.name
                parts = [
                    getattr(pharmacy, "street_address", None),
                    getattr(pharmacy, "suburb", None),
                    getattr(pharmacy, "state", None),
                    getattr(pharmacy, "postcode", None),
                ]
                invoice.pharmacy_address_snapshot = ", ".join([str(p).strip() for p in parts if p])
                invoice.pharmacy_abn_snapshot = pharmacy.abn

                first_shift = locked_assignments[0].shift
                if first_shift.created_by:
                    invoice.bill_to_first_name = first_shift.created_by.first_name
                    invoice.bill_to_last_name = first_shift.created_by.last_name
                    invoice.bill_to_email = first_shift.created_by.email
            else:
                invoice.custom_bill_to_name = billing_data.get("custom_bill_to_name", "")
                invoice.custom_bill_to_address = billing_data.get("custom_bill_to_address", "")
                invoice.bill_to_email = billing_data.get("bill_to_email", "")
                invoice.bill_to_abn = billing_data.get("bill_to_abn", "")
            invoice.save()

            effective_lines = []
            if not external:
                effective_lines.extend(
                    _invoice_line_from_assignment(assignment)
                    for assignment in locked_assignments
                )
                for line in custom_lines:
                    category_code = line.get("category_code") or line.get("category") or "ProfessionalServices"
                    if category_code == "ProfessionalServices":
                        continue
                    effective_lines.append(line)
            else:
                effective_lines = custom_lines

            assignment_by_id = {
                assignment.id: assignment for assignment in locked_assignments
            }
            for line in effective_lines:
                category_code = line.get("category_code") or line.get("category") or "ProfessionalServices"
                qty = Decimal(str(line.get("quantity", 0)))
                rate = Decimal(str(line.get("unit_price", 0)))
                discount = Decimal(str(line.get("discount", 0))) / Decimal("100")
                total = (qty * rate * (1 - discount)).quantize(Decimal("0.01"))
                shift_id = line.get("shiftId") or line.get("shift_id")
                assignment_id = line.get("assignmentId") or line.get("assignment_id")
                source_assignment = assignment_by_id.get(int(assignment_id)) if assignment_id else None

                InvoiceLineItem.objects.create(
                    invoice=invoice,
                    shift_id=shift_id if shift_id else None,
                    source_assignment=source_assignment,
                    description=line.get("description", ""),
                    category_code=category_code,
                    unit=line.get("unit", "Item"),
                    quantity=qty,
                    unit_price=rate,
                    discount=discount * Decimal("100"),
                    total=total,
                    gst_applicable=line.get("gst_applicable", True),
                    super_applicable=line.get("super_applicable", True),
                    is_manual=external or category_code != "ProfessionalServices",
                    was_modified=external or category_code != "ProfessionalServices",
                )

            recalculate_invoice_totals(invoice)
            return invoice
    except IntegrityError as exc:
        raise ValidationError({
            "shift_ids": "One or more accepted shift assignments were invoiced concurrently. Refresh the invoice list before trying again."
        }) from exc


from django.template.loader import render_to_string
from weasyprint import HTML

def render_invoice_to_pdf(invoice):
    line_items = invoice.line_items.all().order_by("id")
    transportation = sum(
        (line.total for line in line_items if line.category_code == "Transportation"),
        Decimal("0.00"),
    )
    accommodation = sum(
        (line.total for line in line_items if line.category_code == "Accommodation"),
        Decimal("0.00"),
    )
    context = {
        "invoice": invoice,
        "line_items": line_items,
        "subtotal": invoice.subtotal,
        "transportation": transportation,
        "accommodation": accommodation,
        "gst": invoice.gst_amount,
        "super_amount": invoice.super_amount,
        "grand_total": invoice.total,
    }
    html_string = render_to_string("invoices/invoice_pdf.html", context)
    pdf_bytes = HTML(string=html_string, base_url=None).write_pdf()
    return pdf_bytes
