"""Telling workers about a newly posted shift: the pharmacy's staff, favourites and chain members (as the poster
chose and the visibility allows) and, for platform shifts, workers whose availability and travel preferences match.

Both run after the posting transaction commits. Each recipient gets one e-mail with its in-app notification.
"""
import logging
from datetime import date, datetime, time
from decimal import Decimal

from django.utils import timezone

from core.task_queue import async_task
from memberships.models import Membership
from onboarding.models import ExplorerOnboarding, OtherStaffOnboarding, PharmacistOnboarding
from organizations.models import Chain
from organizations.serializers import user_can_view_full_pharmacy
from shifts.emails import build_shift_email_context
from shifts.pricing import expand_shift_slots
from shifts.travel import haversine_km
from talent.models import UserAvailability

logger = logging.getLogger(__name__)

SHIFT_EMAIL_RECIPIENT_CAP = 50


def _collect_membership_users(shift, pharmacy_ids, employment_types):
    qs = Membership.objects.filter(
        pharmacy_id__in=pharmacy_ids,
        role=shift.role_needed,
        employment_type__in=employment_types,
        is_active=True,
        user__is_active=True,
    ).select_related("user")
    users = []
    for membership in qs:
        user = membership.user
        if not user or not user.email:
            continue
        if shift.created_by_id and user.id == shift.created_by_id:
            continue
        users.append(user)
    return users

def _format_slot_date(value):
    if not value:
        return None
    if isinstance(value, date):
        parsed = value
    elif isinstance(value, datetime):
        parsed = value.date()
    elif isinstance(value, str):
        try:
            parsed = datetime.strptime(value, "%Y-%m-%d").date()
        except ValueError:
            try:
                parsed = datetime.fromisoformat(value).date()
            except ValueError:
                return value
    else:
        return str(value)
    return parsed.strftime("%d %B, %Y").lstrip("0")

def _format_slot_time(value):
    if not value:
        return None
    if isinstance(value, time):
        parsed = value
    elif isinstance(value, datetime):
        parsed = value.time()
    elif isinstance(value, str):
        parsed = None
        for fmt in ("%H:%M:%S", "%H:%M"):
            try:
                parsed = datetime.strptime(value, fmt).time()
                break
            except ValueError:
                continue
        if parsed is None:
            return value
    else:
        return str(value)
    return parsed.strftime("%I:%M %p").lstrip("0")

def _format_money(value):
    if value is None or value == "":
        return None
    try:
        amount = Decimal(str(value))
    except Exception:
        return None
    formatted = f"{amount:.2f}".rstrip("0").rstrip(".")
    return f"${formatted}"

def _get_pharmacy_display_name(shift, user):
    pharmacy = getattr(shift, "pharmacy", None)
    if not pharmacy:
        return "Pharmacy"
    if shift.post_anonymously and not user_can_view_full_pharmacy(user, pharmacy):
        suburb = getattr(pharmacy, "suburb", None)
        return f"Shift in {suburb}" if suburb else "Anonymous Pharmacy"
    return pharmacy.name

def _get_location_line_for_email(shift, user):
    pharmacy = getattr(shift, "pharmacy", None)
    if not pharmacy:
        return None
    anonymize = shift.post_anonymously and not user_can_view_full_pharmacy(user, pharmacy)
    if anonymize:
        parts = [
            getattr(pharmacy, "suburb", None),
            getattr(pharmacy, "state", None),
            getattr(pharmacy, "postcode", None),
        ]
    else:
        parts = [
            getattr(pharmacy, "street_address", None),
            getattr(pharmacy, "suburb", None),
            getattr(pharmacy, "state", None),
            getattr(pharmacy, "postcode", None),
        ]
    return ", ".join(part for part in parts if part) or None

def _build_shift_email_slot_meta(shift, slot_entries, *, user=None):
    first_slot = slot_entries[0] if slot_entries else {}
    slot_date = first_slot.get('date') if isinstance(first_slot, dict) else None
    slot_start = first_slot.get('start_time') if isinstance(first_slot, dict) else None
    slot_end = first_slot.get('end_time') if isinstance(first_slot, dict) else None
    slot_summary = None
    if slot_date and slot_start and slot_end:
        slot_summary = f"{_format_slot_date(slot_date)} — {_format_slot_time(slot_start)} to {_format_slot_time(slot_end)}"

    slot_lines = []
    slot_cards = []
    for slot in slot_entries or []:
        if not isinstance(slot, dict):
            continue
        date_text = _format_slot_date(slot.get('date'))
        start_text = _format_slot_time(slot.get('start_time'))
        end_text = _format_slot_time(slot.get('end_time'))
        if date_text and start_text and end_text:
            rate_value = slot.get("rate")
            rate_text = f"{_format_money(rate_value)}/hr" if rate_value not in (None, "") else None
            slot_cards.append({
                "date": date_text,
                "time": f"{start_text} - {end_text}",
                "rate": rate_text,
                "line": f"{date_text} - {start_text} to {end_text}{f' - {rate_text}' if rate_text else ''}",
            })
            slot_lines.append(f"{date_text} — {start_text} to {end_text}")
    max_slots_in_email = 6
    slots_display = slot_lines[:max_slots_in_email]
    slots_display_details = slot_cards[:max_slots_in_email]
    slots_extra_count = max(0, len(slot_lines) - len(slots_display))

    location_line = _get_location_line_for_email(shift, user)

    rate_summary = None
    min_annual = getattr(shift, "min_annual_salary", None)
    max_annual = getattr(shift, "max_annual_salary", None)
    min_hourly = getattr(shift, "min_hourly_rate", None)
    max_hourly = getattr(shift, "max_hourly_rate", None)
    fixed_rate = getattr(shift, "fixed_rate", None)
    slot_rates = [
        Decimal(str(s.get("rate")))
        for s in slot_entries or []
        if isinstance(s, dict) and s.get("rate") not in (None, "")
    ]
    if min_annual or max_annual:
        min_display = _format_money(min_annual)
        max_display = _format_money(max_annual)
        if min_display and max_display:
            rate_summary = f"{min_display}–{max_display} package"
        else:
            rate_summary = f"{min_display or max_display} package"
    elif fixed_rate:
        rate_summary = f"{_format_money(fixed_rate)}/hr"
    elif min_hourly or max_hourly:
        min_display = _format_money(min_hourly)
        max_display = _format_money(max_hourly)
        if min_display and max_display:
            rate_summary = f"{min_display}–{max_display}/hr"
        else:
            rate_summary = f"{min_display or max_display}/hr"
    elif slot_rates:
        min_rate = min(slot_rates)
        max_rate = max(slot_rates)
        if min_rate == max_rate:
            rate_summary = f"{_format_money(min_rate)}/hr"
        else:
            rate_summary = f"{_format_money(min_rate)}–{_format_money(max_rate)}/hr"

    return {
        "slot_summary": slot_summary,
        "slot_date": slot_date,
        "slot_start": slot_start,
        "slot_end": slot_end,
        "slots_display": slots_display,
        "slots_display_details": slots_display_details,
        "slots_extra_count": slots_extra_count,
        "location_line": location_line,
        "rate_summary": rate_summary,
    }

def _role_matches_shift(user_role, shift_role):
    if shift_role == "PHARMACIST":
        return user_role == "PHARMACIST"
    if shift_role in ["ASSISTANT", "TECHNICIAN", "INTERN", "STUDENT"]:
        return user_role == "OTHER_STAFF"
    if shift_role == "EXPLORER":
        return user_role == "EXPLORER"
    return False

def _availability_matches_slot(availability, slot_date, slot_start, slot_end):
    if not slot_date or not slot_start or not slot_end:
        return False
    if availability.is_recurring:
        if availability.date and slot_date < availability.date:
            return False
        if availability.recurring_end_date and slot_date > availability.recurring_end_date:
            return False
        mapped_days = [int(day) for day in (availability.recurring_days or [])]
        if not mapped_days:
            return False
        adjusted_weekday = (slot_date.weekday() + 1) % 7
        if adjusted_weekday not in mapped_days:
            return False
    else:
        if slot_date != availability.date:
            return False

    if availability.is_all_day:
        return True
    if availability.start_time is None or availability.end_time is None:
        return False
    return availability.start_time <= slot_end and availability.end_time >= slot_start

def _load_user_travel_prefs(user_ids_by_role):
    prefs = {}
    pharm_ids = user_ids_by_role.get("PHARMACIST") or []
    other_ids = user_ids_by_role.get("OTHER_STAFF") or []
    explorer_ids = user_ids_by_role.get("EXPLORER") or []

    if pharm_ids:
        for row in PharmacistOnboarding.objects.filter(user_id__in=pharm_ids).values(
            "user_id", "latitude", "longitude", "open_to_travel", "travel_states", "coverage_radius_km"
        ):
            prefs[row["user_id"]] = row

    if other_ids:
        for row in OtherStaffOnboarding.objects.filter(user_id__in=other_ids).values(
            "user_id", "latitude", "longitude", "open_to_travel", "travel_states", "coverage_radius_km"
        ):
            prefs[row["user_id"]] = row

    if explorer_ids:
        for row in ExplorerOnboarding.objects.filter(user_id__in=explorer_ids).values(
            "user_id", "latitude", "longitude", "open_to_travel", "travel_states", "coverage_radius_km"
        ):
            prefs[row["user_id"]] = row

    return prefs

def _user_can_travel_to_shift(pref_row, shift):
    if not pref_row or not shift or not shift.pharmacy:
        return False
    if pref_row.get("open_to_travel"):
        travel_states = pref_row.get("travel_states") or []
        if not travel_states:
            return False
        pharmacy_state = getattr(shift.pharmacy, "state", None)
        if not pharmacy_state:
            return False
        normalized = {str(s).strip().upper() for s in travel_states if str(s).strip()}
        return pharmacy_state.strip().upper() in normalized
    user_lat = pref_row.get("latitude")
    user_lon = pref_row.get("longitude")
    pharm_lat = getattr(shift.pharmacy, "latitude", None)
    pharm_lon = getattr(shift.pharmacy, "longitude", None)
    if user_lat is None or user_lon is None or pharm_lat is None or pharm_lon is None:
        return False
    radius_km = pref_row.get("coverage_radius_km")
    if radius_km is None:
        return False
    distance = haversine_km(float(user_lat), float(user_lon), float(pharm_lat), float(pharm_lon))
    return distance <= float(radius_km)

def announce_posted_shift(
    shift,
    slots_data,
    *,
    notify_pharmacy_staff=False,
    notify_favorite_staff=False,
    notify_chain_members=False,
):
    visibility_rules = {
        'FULL_PART_TIME': {'notify_pharmacy_staff'},
        'LOCUM_CASUAL': {'notify_pharmacy_staff', 'notify_favorite_staff'},
        'OWNER_CHAIN': {'notify_pharmacy_staff', 'notify_favorite_staff', 'notify_chain_members'},
        'ORG_CHAIN': {'notify_pharmacy_staff', 'notify_favorite_staff', 'notify_chain_members'},
        'PLATFORM': {'notify_pharmacy_staff', 'notify_favorite_staff', 'notify_chain_members'},
    }
    allowed = set(visibility_rules.get(shift.visibility, set()))
    if getattr(shift, "post_anonymously", False):
        anonymous_rules = {
            'FULL_PART_TIME': {'notify_pharmacy_staff'},
            'LOCUM_CASUAL': {'notify_favorite_staff'},
            'OWNER_CHAIN': {'notify_chain_members'},
            'ORG_CHAIN': {'notify_chain_members'},
            'PLATFORM': set(),
        }
        allowed &= anonymous_rules.get(shift.visibility, set())
    if not allowed:
        return

    if not notify_pharmacy_staff:
        allowed.discard('notify_pharmacy_staff')
    if not notify_favorite_staff:
        allowed.discard('notify_favorite_staff')
    if not notify_chain_members:
        allowed.discard('notify_chain_members')

    if not allowed:
        return

    staff_types = {'FULL_TIME', 'PART_TIME', 'CASUAL'}
    favorite_types = {'LOCUM', 'SHIFT_HERO'}
    recipient_map = {}

    if 'notify_pharmacy_staff' in allowed:
        users = _collect_membership_users(shift, [shift.pharmacy_id], staff_types)
        for user in users:
            recipient_map[user.id] = user

    if 'notify_favorite_staff' in allowed:
        users = _collect_membership_users(shift, [shift.pharmacy_id], favorite_types)
        for user in users:
            recipient_map[user.id] = user

    if 'notify_chain_members' in allowed:
        if shift.pharmacy and shift.pharmacy.owner_id:
            # Every pharmacy of the owner's active chains that include this pharmacy. The chains are selected
            # first: reading pharmacies__id in the same query would reuse the filter's join and only return this
            # pharmacy.
            chain_ids = Chain.objects.filter(
                owner_id=shift.pharmacy.owner_id,
                pharmacies=shift.pharmacy,
                is_active=True,
            ).values_list('id', flat=True)
            chain_pharmacy_ids = list(
                Chain.pharmacies.through.objects.filter(chain_id__in=chain_ids)
                .values_list('pharmacy_id', flat=True)
                .distinct()
            )
        else:
            chain_pharmacy_ids = []
        if chain_pharmacy_ids:
            users = _collect_membership_users(
                shift,
                chain_pharmacy_ids,
                staff_types | favorite_types,
            )
            for user in users:
                recipient_map[user.id] = user

    if not recipient_map:
        return

    recipients = sorted(recipient_map.values(), key=lambda user: user.id)
    if len(recipients) > SHIFT_EMAIL_RECIPIENT_CAP:
        logger.warning(
            "Shift %s posted notification recipient cap hit: sending %s of %s recipients.",
            shift.id,
            SHIFT_EMAIL_RECIPIENT_CAP,
            len(recipients),
        )
        recipients = recipients[:SHIFT_EMAIL_RECIPIENT_CAP]

    for user in recipients:
        ctx = build_shift_email_context(shift, user=user)
        pharmacy_display_name = _get_pharmacy_display_name(shift, user)
        slot_meta = _build_shift_email_slot_meta(shift, slots_data, user=user)
        ctx.update({
            "pharmacy_name": pharmacy_display_name,
            "role_label": shift.get_role_needed_display(),
            "employment_type_label": shift.get_employment_type_display(),
            **slot_meta,
        })
        notification_payload = {
            "title": "New shift available",
            "body": f"{ctx['role_label']} shift at {pharmacy_display_name}.",
            "type": "shift",
            "action_url": ctx.get("shift_link"),
            "payload": {"shift_id": shift.id},
            "user_ids": [user.id],
        }
        async_task(
            'users.tasks.send_async_email',
            subject=f"New {ctx['role_label']} shift at {pharmacy_display_name}",
            recipient_list=[user.email],
            template_name="emails/shift_posted.html",
            context=ctx,
            text_template="emails/shift_posted.txt",
            notification=notification_payload,
        )

def announce_availability_matches(shift):
    if shift.visibility != "PLATFORM":
        return
    slot_entries = expand_shift_slots(shift)
    if not slot_entries:
        return

    today = timezone.localdate()
    slot_entries = [entry for entry in slot_entries if entry.get("date") and entry["date"] >= today]
    if not slot_entries:
        return
    slot_entries = sorted(
        slot_entries,
        key=lambda entry: (entry.get("date") or date.max, entry.get("start_time") or time.min),
    )

    max_entries = 180
    if len(slot_entries) > max_entries:
        slot_entries = slot_entries[:max_entries]

    user_availabilities = (
        UserAvailability.objects.filter(notify_new_shifts=True, user__is_active=True)
        .select_related("user")
    )
    if shift.created_by_id:
        user_availabilities = user_availabilities.exclude(user_id=shift.created_by_id)
    if not user_availabilities.exists():
        return

    user_availability_map = {}
    user_ids_by_role = {"PHARMACIST": set(), "OTHER_STAFF": set(), "EXPLORER": set()}
    for availability in user_availabilities:
        user = availability.user
        if not user or not _role_matches_shift(getattr(user, "role", None), shift.role_needed):
            continue
        user_availability_map.setdefault(user.id, []).append(availability)
        if user.role in user_ids_by_role:
            user_ids_by_role[user.role].add(user.id)

    if not user_availability_map:
        return

    prefs = _load_user_travel_prefs(
        {role: list(ids) for role, ids in user_ids_by_role.items() if ids}
    )

    slot_meta_entries = [
        {
            "date": entry.get("date"),
            "start_time": entry.get("start_time"),
            "end_time": entry.get("end_time"),
            "rate": getattr(entry.get("slot"), "rate", None) if entry.get("slot") else None,
        }
        for entry in slot_entries
    ]
    sent_count = 0
    skipped_by_cap = 0
    for user_id, availabilities in sorted(user_availability_map.items()):
        if sent_count >= SHIFT_EMAIL_RECIPIENT_CAP:
            skipped_by_cap += 1
            continue
        user = availabilities[0].user
        if not user or not user.email:
            continue
        pref_row = prefs.get(user_id)
        if not _user_can_travel_to_shift(pref_row, shift):
            continue

        matched = False
        for availability in availabilities:
            for entry in slot_entries:
                if _availability_matches_slot(
                    availability,
                    entry.get("date"),
                    entry.get("start_time"),
                    entry.get("end_time"),
                ):
                    matched = True
                    break
            if matched:
                break

        if not matched:
            continue

        ctx = build_shift_email_context(shift, user=user, role=user.role.lower())
        pharmacy_display_name = _get_pharmacy_display_name(shift, user)
        slot_meta = _build_shift_email_slot_meta(shift, slot_meta_entries, user=user)
        ctx.update({
            "pharmacy_name": pharmacy_display_name,
            "role_label": shift.get_role_needed_display(),
            "employment_type_label": shift.get_employment_type_display(),
            **slot_meta,
        })
        notification_payload = {
            "title": "Shift match found",
            "body": f"A {ctx['role_label']} shift matches your availability.",
            "type": "shift",
            "action_url": ctx.get("shift_link"),
            "payload": {"shift_id": shift.id},
            "user_ids": [user.id],
        }
        async_task(
            'users.tasks.send_async_email',
            subject=f"New {ctx['role_label']} shift that matches your availability",
            recipient_list=[user.email],
            template_name="emails/shift_availability_match.html",
            context=ctx,
            text_template="emails/shift_availability_match.txt",
            notification=notification_payload,
        )
        sent_count += 1

    if skipped_by_cap:
        logger.warning(
            "Shift %s availability notification recipient cap hit: skipped at least %s matching users.",
            shift.id,
            skipped_by_cap,
        )
