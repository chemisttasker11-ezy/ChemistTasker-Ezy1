from django.conf import settings
import re
from datetime import datetime, date, time
from decimal import Decimal
from django.contrib.auth import get_user_model
from core.task_queue import async_task
import difflib
from django.utils import timezone
from django.core.signing import TimestampSigner
from urllib.parse import urlencode
from django.db import transaction
from django.db.models import Q
from django.utils.html import strip_tags
from rest_framework.exceptions import ValidationError

from client_profile.models import (
    Membership,
    Notification,
    OtherStaffOnboarding,
    Shift,
    ShiftCounterOffer,
    ShiftInterest,
    ShiftOffer,
    ShiftSlotAssignment,
)
from client_profile.services import expand_shift_slots, get_locked_rate_for_slot
from client_profile.admin_helpers import is_admin_of

MAX_PUBLIC_SHIFTS_PER_DAY = 10
TRAVEL_ORIGIN_PREFIX = "Traveling from:"
STATE_CODES = {"NSW", "VIC", "QLD", "WA", "SA", "TAS", "ACT", "NT"}
OTHER_STAFF_ROLE_LABELS = {
    "INTERN": "Intern Pharmacist",
    "TECHNICIAN": "Dispensary Technician",
    "ASSISTANT": "Pharmacy Assistant",
    "STUDENT": "Pharmacy Student",
}


def other_staff_role_label(role_type, fallback="Other Staff"):
    normalized = str(role_type or "").strip().upper()
    return OTHER_STAFF_ROLE_LABELS.get(normalized, fallback)


def user_work_role_label(user, fallback="candidate"):
    role = str(getattr(user, "role", "") or "").strip().upper()
    if role == "PHARMACIST":
        return "Pharmacist"
    if role == "OTHER_STAFF":
        role_type = None
        profile = getattr(user, "otherstaffonboarding", None)
        if profile:
            role_type = getattr(profile, "role_type", None)
        if not role_type and getattr(user, "id", None):
            role_type = (
                OtherStaffOnboarding.objects.filter(user=user)
                .values_list("role_type", flat=True)
                .first()
            )
        return other_staff_role_label(role_type, "Other Staff")
    if role == "EXPLORER":
        return "Candidate"
    return fallback


def membership_role_label(role):
    if not role:
        return ""
    return dict(Membership.ROLE_CHOICES).get(role, other_staff_role_label(role, str(role).replace("_", " ").title()))


def extract_travel_origin_from_message(message: str | None):
    if not message:
        return "", ""
    lines = message.splitlines()
    filtered = []
    travel_origin = ""
    for line in lines:
        stripped = line.strip()
        if stripped.startswith(TRAVEL_ORIGIN_PREFIX):
            if not travel_origin:
                travel_origin = stripped.replace(TRAVEL_ORIGIN_PREFIX, "", 1).strip()
            continue
        filtered.append(line)
    cleaned = "\n".join(filtered).strip()
    return cleaned, travel_origin


def extract_suburb_from_travel_origin(origin: str | None):
    if not origin:
        return ""
    cleaned = re.sub(r"\s+", " ", origin).strip()
    if not cleaned:
        return ""

    # If the string includes a comma, use the segment after the first comma.
    if "," in cleaned:
        parts = [part.strip() for part in cleaned.split(",") if part.strip()]
        if len(parts) >= 2:
            cleaned = parts[1]
        else:
            cleaned = parts[0]

    # Try to extract suburb from patterns like "Suburb QLD 4214"
    pattern = r"^(.+?)\s+(NSW|VIC|QLD|WA|SA|TAS|ACT|NT)\s+\d{3,4}$"
    match = re.match(pattern, cleaned, flags=re.IGNORECASE)
    if match:
        return match.group(1).strip()

    tokens = cleaned.split(" ")
    if tokens and tokens[-1].isdigit():
        tokens = tokens[:-1]
    if tokens and tokens[-1].upper() in STATE_CODES:
        tokens = tokens[:-1]
    return " ".join(tokens).strip()


def sanitize_chat_text(value: str) -> str:
    raw_value = (value or "").strip()
    # Drop script/style blocks entirely so their inner text is not kept in messages.
    raw_value = re.sub(r"<(script|style)\b[^>]*>.*?</\1>", " ", raw_value, flags=re.IGNORECASE | re.DOTALL)
    cleaned = strip_tags(raw_value)
    return " ".join(cleaned.split())

def build_shift_email_context(shift, user=None, extra=None, role=None, shift_type=None):
    """
    Build context for shift notification emails with robust worker and owner links.
    """
    frontend_role = role or (user.role.lower() if user else 'owner')
    shift_link = ""

    if user:
        if user.role == 'OWNER':
            shift_link = f"{settings.FRONTEND_BASE_URL}/dashboard/owner/shifts/{shift.id}"
        elif hasattr(user, 'organization_memberships') and user.organization_memberships.filter(
            role__in=['ORG_ADMIN', 'CHIEF_ADMIN', 'REGION_ADMIN']
        ).exists():
            shift_link = f"{settings.FRONTEND_BASE_URL}/dashboard/organization/shifts/{shift.id}"
        elif user.role == 'PHARMACIST':
            shift_link = f"{settings.FRONTEND_BASE_URL}/dashboard/pharmacist/shifts/{shift.id}"
        elif user.role == 'OTHER_STAFF':
            shift_link = f"{settings.FRONTEND_BASE_URL}/dashboard/otherstaff/shifts/{shift.id}"
        elif user.role == 'EXPLORER':
            shift_link = f"{settings.FRONTEND_BASE_URL}/dashboard/explorer/shifts/{shift.id}"
        else:
            shift_link = f"{settings.FRONTEND_BASE_URL}/dashboard/{frontend_role}/shifts/{shift.id}"

    else:
        shift_link = f"{settings.FRONTEND_BASE_URL}/dashboard/owner/shifts/{shift.id}"


    ctx = {
        "shift_id": shift.id,
        "pharmacy_name": shift.pharmacy.name,
        "role_needed": shift.role_needed,
        "role_label": shift.get_role_needed_display() if hasattr(shift, "get_role_needed_display") else shift.role_needed,
        "employment_type_label": shift.get_employment_type_display() if hasattr(shift, "get_employment_type_display") else getattr(shift, "employment_type", ""),
        "frontend_role": frontend_role,
        "shift_link": shift_link,
    }
    if user:
        ctx.update({
            "user_first_name": user.first_name,
            "user_last_name": user.last_name,
            "user_email": user.email,
        })
    if extra:
        ctx.update(extra)
    return ctx


def active_shift_url_for_user(user, shift) -> str:
    base = getattr(settings, "FRONTEND_BASE_URL", "").rstrip("/")
    role = str(getattr(user, "role", "") or "").upper()

    if role == "OWNER":
        return f"{base}/dashboard/owner/shifts/{shift.id}"
    if hasattr(user, "organization_memberships") and user.organization_memberships.filter(
        role__in=["ORG_ADMIN", "CHIEF_ADMIN", "REGION_ADMIN"]
    ).exists():
        return f"{base}/dashboard/organization/shifts/{shift.id}"
    if is_admin_of(user, getattr(shift, "pharmacy_id", None)):
        return f"{base}/dashboard/admin/{shift.pharmacy_id}/shifts/{shift.id}"
    if role == "PHARMACIST":
        return f"{base}/dashboard/pharmacist/shifts/{shift.id}"
    if role == "OTHER_STAFF":
        return f"{base}/dashboard/otherstaff/shifts/{shift.id}"
    if role == "EXPLORER":
        return f"{base}/dashboard/explorer/shifts/{shift.id}"
    return f"{base}/dashboard/owner/shifts/{shift.id}"


def worker_offer_url(user, shift, offer=None) -> str:
    base = getattr(settings, "FRONTEND_BASE_URL", "").rstrip("/")
    role_value = str(getattr(user, "role", "") or "").upper()
    role_route_map = {
        "PHARMACIST": "pharmacist",
        "OTHER_STAFF": "otherstaff",
        "EXPLORER": "explorer",
    }
    role_path = role_route_map.get(role_value, "pharmacist")
    offer_id = getattr(offer, "id", "")
    return f"{base}/dashboard/{role_path}/shifts?tab=accepted&shift_id={shift.id}&offer_id={offer_id}"


def worker_shift_board_url(user) -> str:
    base = getattr(settings, "FRONTEND_BASE_URL", "").rstrip("/")
    role_value = str(getattr(user, "role", "") or "").upper()
    role_route_map = {
        "PHARMACIST": "pharmacist",
        "OTHER_STAFF": "otherstaff",
        "EXPLORER": "explorer",
    }
    role_path = role_route_map.get(role_value, "pharmacist")
    return f"{base}/dashboard/shifts/public-board"


def worker_availability_url(user) -> str:
    base = getattr(settings, "FRONTEND_BASE_URL", "").rstrip("/")
    role_value = str(getattr(user, "role", "") or "").upper()
    role_route_map = {
        "PHARMACIST": "pharmacist",
        "OTHER_STAFF": "otherstaff",
        "EXPLORER": "explorer",
    }
    role_path = role_route_map.get(role_value, "pharmacist")
    return f"{base}/dashboard/{role_path}/availability"


def worker_interests_url(user) -> str:
    base = getattr(settings, "FRONTEND_BASE_URL", "").rstrip("/")
    role_value = str(getattr(user, "role", "") or "").upper()
    role_route_map = {
        "PHARMACIST": "pharmacist",
        "OTHER_STAFF": "otherstaff",
        "EXPLORER": "explorer",
    }
    role_path = role_route_map.get(role_value, "pharmacist")
    return f"{base}/dashboard/{role_path}/interests"


def build_offer_shift_details(shift, offer=None):
    slots = []
    if offer and getattr(offer, "offered_slot_date", None):
        slots.append({
            "pharmacy_name": shift.pharmacy.name,
            "date": _format_slot_date(offer.offered_slot_date),
            "start_time": _format_slot_time(offer.offered_start_time),
            "end_time": _format_slot_time(offer.offered_end_time),
            "time_range": _format_slot_time_range(offer.offered_start_time, offer.offered_end_time),
            "rate": _format_rate(getattr(offer, "offered_rate", None)),
        })
    elif offer and getattr(offer, "slot_id", None):
        slot = offer.slot
        slots.append({
            "pharmacy_name": shift.pharmacy.name,
            "date": _format_slot_date(slot.date),
            "start_time": _format_slot_time(slot.start_time),
            "end_time": _format_slot_time(slot.end_time),
            "time_range": _format_slot_time_range(slot.start_time, slot.end_time),
            "rate": _format_rate(getattr(offer, "offered_rate", None) or getattr(slot, "rate", None)),
        })
    else:
        for entry in expand_shift_slots(shift):
            slot = entry.get("slot")
            slots.append({
                "pharmacy_name": shift.pharmacy.name,
                "date": _format_slot_date(entry.get("date")),
                "start_time": _format_slot_time(entry.get("start_time")),
                "end_time": _format_slot_time(entry.get("end_time")),
                "time_range": _format_slot_time_range(entry.get("start_time"), entry.get("end_time")),
                "rate": _format_rate(getattr(slot, "rate", None) if slot else getattr(shift, "fixed_rate", None)),
            })

    summary_parts = []
    for slot in slots[:3]:
        if slot.get("date") and slot.get("time_range"):
            summary_parts.append(f"{shift.pharmacy.name} | {slot['date']} {slot['time_range']}")
    if len(slots) > 3:
        summary_parts.append(f"+ {len(slots) - 3} more")

    return {
        "pharmacy_name": shift.pharmacy.name,
        "shift_summary": "; ".join(summary_parts) or shift.pharmacy.name,
        "slot_details": slots,
    }


def _worker_display_name(user):
    if not user:
        return "A candidate"
    return user.get_full_name() or user.email or getattr(user, "username", "") or "A candidate"


def send_shift_not_selected_after_payment_notifications(*, shift, selected_offers):
    from client_profile.notifications import notify_users

    selected_offers = [offer for offer in selected_offers if offer and getattr(offer, "id", None)]
    if not selected_offers:
        return

    login_link = f"{getattr(settings, 'FRONTEND_BASE_URL', '').rstrip('/')}/login"
    selected_user_ids = {offer.user_id for offer in selected_offers if getattr(offer, "user_id", None)}
    notified_user_ids = set(selected_user_ids)

    selected_slot_ids = {offer.slot_id for offer in selected_offers if getattr(offer, "slot_id", None)}
    selected_slots = [offer.slot for offer in selected_offers if getattr(offer, "slot_id", None)]

    if getattr(shift, "single_user_only", False):
        candidate_user_ids = set(
            ShiftInterest.objects.filter(shift=shift).values_list("user_id", flat=True)
        )
        candidate_user_ids.update(
            ShiftOffer.objects.filter(shift=shift).values_list("user_id", flat=True)
        )
        detail_offer = selected_offers[0]
        details = build_offer_shift_details(shift, detail_offer)
        notification_items = [(user_id, details, detail_offer.id) for user_id in candidate_user_ids]
    else:
        notification_items = []
        for slot in selected_slots:
            candidate_user_ids = set(
                ShiftInterest.objects.filter(shift=shift, slot=slot).values_list("user_id", flat=True)
            )
            candidate_user_ids.update(
                ShiftOffer.objects.filter(shift=shift, slot=slot).values_list("user_id", flat=True)
            )
            detail_offer = next((offer for offer in selected_offers if offer.slot_id == slot.id), None)
            details = build_offer_shift_details(shift, detail_offer)
            notification_items.extend((user_id, details, getattr(detail_offer, "id", None)) for user_id in candidate_user_ids)

    users_by_id = {
        user.id: user
        for user in get_user_model().objects.filter(
            id__in={user_id for user_id, _details, _offer_id in notification_items if user_id},
            is_active=True,
        )
    }

    for user_id, details, selected_offer_id in notification_items:
        if user_id in notified_user_ids:
            continue
        worker = users_by_id.get(user_id)
        if not worker:
            continue
        notified_user_ids.add(user_id)
        notified_user_ids.add(worker.id)
        notify_users(
            [worker.id],
            title=f"Shift filled: {shift.pharmacy.name}",
            body=f"Thanks for confirming. This shift was finalized with another candidate. {details['shift_summary']}",
            notification_type=Notification.Type.ALERT,
            action_url="",
            payload={
                "shift_id": shift.id,
                "selected_offer_id": selected_offer_id,
                "notification_kind": "shift_not_selected_after_payment",
                **details,
            },
        )
        if worker.email:
            ctx = build_shift_email_context(shift, user=worker, role=worker.role.lower())
            ctx.update(details)
            ctx.update({
                "login_link": login_link,
                "shift_link": login_link,
                "shift_board_link": worker_shift_board_url(worker),
                "availability_link": worker_availability_url(worker),
                "interests_link": worker_interests_url(worker),
            })
            async_task(
                "users.tasks.send_async_email",
                subject=f"Shift filled at {shift.pharmacy.name}",
                recipient_list=[worker.email],
                template_name="emails/shift_not_selected_after_payment.html",
                context=ctx,
                text_template="emails/shift_not_selected_after_payment.txt",
                suppress_auto_notification=True,
            )


def send_shift_payment_finalized_notifications(*, shift, offers, paid_by=None, payment_method="payment"):
    from client_profile.shift_notifications import notify_shift_users

    finalized_offers = [offer for offer in offers if offer and getattr(offer, "user_id", None)]
    if not finalized_offers:
        return

    owner_user = paid_by or getattr(shift, "created_by", None) or getattr(getattr(shift.pharmacy, "owner", None), "user", None)
    method_key = str(payment_method).lower()
    payment_label = "Pills" if method_key == "pills" else ("Free period" if method_key == "free" else "Stripe")

    for offer in finalized_offers:
        worker = offer.user
        details = build_offer_shift_details(shift, offer)
        worker_link = active_shift_url_for_user(worker, shift)
        notify_shift_users(
            [worker],
            shift=shift,
            title=f"Shift locked in: {shift.pharmacy.name}",
            body=f"Congratulations, your shift is now locked in. {details['shift_summary']}",
            kind="shift_payment_finalized_worker",
            payload={
                "offer_id": offer.id,
                "status": offer.status,
                "payment_method": payment_label,
                **details,
            },
        )
        if worker.email:
            ctx = build_shift_email_context(shift, user=worker, role=worker.role.lower())
            ctx.update(details)
            ctx.update({
                "shift_link": worker_link,
                "payment_method": payment_label,
                "rate": details["slot_details"][0].get("rate") if details["slot_details"] else "",
            })
            async_task(
                "users.tasks.send_async_email",
                subject=f"Your shift is locked in at {shift.pharmacy.name}",
                recipient_list=[worker.email],
                template_name="emails/shift_payment_finalized_worker.html",
                context=ctx,
                text_template="emails/shift_payment_finalized_worker.txt",
                suppress_auto_notification=True,
            )

    send_shift_not_selected_after_payment_notifications(
        shift=shift,
        selected_offers=finalized_offers,
    )

    if owner_user and getattr(owner_user, "email", None):
        owner_slot_details = []
        for offer in finalized_offers:
            owner_slot_details.extend(build_offer_shift_details(shift, offer)["slot_details"])
        owner_summary_parts = []
        for slot in owner_slot_details[:3]:
            if slot.get("date") and slot.get("time_range"):
                owner_summary_parts.append(f"{shift.pharmacy.name} | {slot['date']} {slot['time_range']}")
        if len(owner_slot_details) > 3:
            owner_summary_parts.append(f"+ {len(owner_slot_details) - 3} more")
        details = {
            "pharmacy_name": shift.pharmacy.name,
            "shift_summary": "; ".join(owner_summary_parts) or shift.pharmacy.name,
            "slot_details": owner_slot_details,
        }
        owner_link = active_shift_url_for_user(owner_user, shift)
        worker_names = ", ".join(
            offer.user.get_full_name() or offer.user.email for offer in finalized_offers
        )
        owner_title = (
            f"Shift finalized: {shift.pharmacy.name}"
            if method_key == "free"
            else f"Payment complete: {shift.pharmacy.name}"
        )
        owner_body = (
            f"The shift is locked in for {worker_names}. No payment was required."
            if method_key == "free"
            else f"Payment received and the shift is locked in for {worker_names}."
        )
        notify_shift_users(
            [owner_user],
            shift=shift,
            title=owner_title,
            body=owner_body,
            kind="shift_payment_finalized_owner",
            payload={
                "offer_ids": [offer.id for offer in finalized_offers],
                "worker_names": worker_names,
                "payment_method": payment_label,
                **details,
            },
        )
        ctx = build_shift_email_context(shift, user=owner_user)
        ctx.update(details)
        ctx.update({
            "shift_link": owner_link,
            "worker_names": worker_names,
            "worker_role_label": user_work_role_label(finalized_offers[0].user, "team member"),
            "payment_method": payment_label,
            "rate": details["slot_details"][0].get("rate") if details["slot_details"] else "",
        })
        async_task(
            "users.tasks.send_async_email",
            subject=(
                f"Shift finalized at {shift.pharmacy.name}"
                if method_key == "free"
                else f"Payment complete for your shift at {shift.pharmacy.name}"
            ),
            recipient_list=[owner_user.email],
            template_name="emails/shift_payment_finalized_owner.html",
            context=ctx,
            text_template="emails/shift_payment_finalized_owner.txt",
            suppress_auto_notification=True,
        )


def send_shift_updated_notifications(shift):
    from client_profile.notifications import notify_users

    user_ids = set()
    user_ids.update(
        ShiftInterest.objects.filter(shift=shift, user__is_active=True).values_list("user_id", flat=True)
    )
    user_ids.update(
        ShiftCounterOffer.objects.filter(shift=shift, user__is_active=True).values_list("user_id", flat=True)
    )
    user_ids.update(
        ShiftOffer.objects.filter(
            shift=shift,
            user__is_active=True,
            status__in=[
                ShiftOffer.Status.PENDING,
                ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
                ShiftOffer.Status.ACCEPTED,
            ],
        ).values_list("user_id", flat=True)
    )
    user_ids.discard(getattr(shift, "created_by_id", None))
    if not user_ids:
        return

    users = list(get_user_model().objects.filter(id__in=user_ids, is_active=True))
    details = build_offer_shift_details(shift, None)
    for worker in users:
        shift_link = active_shift_url_for_user(worker, shift)
        notify_users(
            [worker.id],
            title=f"Shift updated: {shift.pharmacy.name}",
            body=f"This shift has changed. Please review if it still matches you. {details['shift_summary']}",
            notification_type=Notification.Type.ALERT,
            action_url=shift_link,
            payload={
                "shift_id": shift.id,
                "notification_kind": "shift_updated",
                **details,
            },
        )
        if worker.email:
            ctx = build_shift_email_context(shift, user=worker, role=worker.role.lower())
            ctx.update(details)
            ctx.update({
                "shift_link": shift_link,
            })
            async_task(
                "users.tasks.send_async_email",
                subject=f"Shift details changed at {shift.pharmacy.name}",
                recipient_list=[worker.email],
                template_name="emails/shift_updated.html",
                context=ctx,
                text_template="emails/shift_updated.txt",
                suppress_auto_notification=True,
            )


def build_shift_counter_offer_context(shift, offer, recipient=None):
    """
    Build context for counter-offer notifications. Reuses the shift link logic so owners/admins land on the shift page.
    """
    cleaned_message, travel_origin = extract_travel_origin_from_message(offer.message or "")
    travel_origin = extract_suburb_from_travel_origin(travel_origin)

    base_ctx = build_shift_email_context(shift, user=recipient)
    slots = []
    for offer_slot in offer.slots.select_related('slot'):
        slot = offer_slot.slot
        date_value = offer_slot.slot_date or getattr(slot, "date", None)
        slots.append({
            "date": _format_slot_date(date_value),
            "start_time": _format_slot_time(offer_slot.proposed_start_time),
            "end_time": _format_slot_time(offer_slot.proposed_end_time),
            "time_range": _format_slot_time_range(offer_slot.proposed_start_time, offer_slot.proposed_end_time),
            "proposed_rate": _format_rate(offer_slot.proposed_rate),
        })

    base_ctx.update({
        "worker_name": "A candidate"
        if getattr(shift, "visibility", None) == "PLATFORM"
        else (offer.user.get_full_name() if offer.user else "A candidate"),
        "worker_email": offer.user.email if offer.user else "",
        "message": cleaned_message,
        "request_travel": bool(offer.request_travel),
        "travel_origin": travel_origin,
        "slots": slots,
    })
    return base_ctx


def build_shift_interest_context(shift, interest, recipient=None):
    """
    Build owner/admin notification context for a worker expressing interest.
    Public shifts keep the candidate anonymous; pharmacy/favourite-member shifts show the member details.
    """
    base_ctx = build_shift_email_context(shift, user=recipient)
    is_public = getattr(shift, "visibility", None) == "PLATFORM"
    worker = getattr(interest, "user", None)
    worker_name = "A candidate" if is_public else ((worker.get_full_name() or worker.email) if worker else "A member")
    membership = None
    if worker:
        membership = Membership.objects.filter(user=worker, pharmacy=shift.pharmacy, is_active=True).first()

    slot_entries = []
    slot = getattr(interest, "slot", None)
    if slot:
        slot_entries = [{
            "date": _format_slot_date(slot.date),
            "start_time": _format_slot_time(slot.start_time),
            "end_time": _format_slot_time(slot.end_time),
        }]
    else:
        for entry in expand_shift_slots(shift):
            slot_entries.append({
                "date": _format_slot_date(entry.get("date")),
                "start_time": _format_slot_time(entry.get("start_time")),
                "end_time": _format_slot_time(entry.get("end_time")),
            })

    base_ctx.update({
        "worker_name": worker_name,
        "worker_email": "" if is_public else (worker.email if worker else ""),
        "member_type": getattr(membership, "staff_category", "") if membership else "",
        "employment_type": getattr(membership, "employment_type", "") if membership else "",
        "slots": slot_entries,
        "is_public_interest": is_public,
    })
    return base_ctx


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


def _format_slot_time_range(start, end):
    start_text = _format_slot_time(start)
    end_text = _format_slot_time(end)
    if start_text and end_text:
        return f"{start_text} - {end_text}"
    return start_text or end_text or ""


def _format_rate(value):
    if value in (None, ""):
        return ""
    try:
        amount = Decimal(str(value))
    except Exception:
        return str(value)
    if amount == amount.to_integral_value():
        return str(amount.quantize(Decimal("1")))
    return str(amount.quantize(Decimal("0.01")))


def build_shift_offer_context(shift, offer, recipient=None, *, ignore_slot_filter: bool = False):
    """
    Build context for shift offer notifications sent to workers.
    """
    base_ctx = build_shift_email_context(shift, user=recipient)

    pharmacy_display = shift.pharmacy.name
    if getattr(shift, "post_anonymously", False):
        suburb = getattr(shift.pharmacy, "suburb", None)
        pharmacy_display = f"Shift in {suburb}" if suburb else "Anonymous Pharmacy"

    slot_lines = []
    slots_display_details = []
    offered_date = getattr(offer, "offered_slot_date", None)
    offered_start = getattr(offer, "offered_start_time", None)
    offered_end = getattr(offer, "offered_end_time", None)
    if offered_date and offered_start and offered_end:
        date_text = _format_slot_date(offered_date)
        start_text = _format_slot_time(offered_start)
        end_text = _format_slot_time(offered_end)
        slot_lines.append(f"{date_text} - {start_text} to {end_text}")
        slots_display_details.append({
            "date": date_text,
            "time_range": _format_slot_time_range(offered_start, offered_end),
            "rate": _format_rate(getattr(offer, "offered_rate", None)),
        })

    if not slot_lines:
        slot_entries = expand_shift_slots(shift)
        if getattr(offer, "slot_id", None) and not ignore_slot_filter:
            slot_entries = [e for e in slot_entries if e.get("slot") and e["slot"].id == offer.slot_id]

        for entry in slot_entries or []:
            date_text = _format_slot_date(entry.get("date"))
            start_text = _format_slot_time(entry.get("start_time"))
            end_text = _format_slot_time(entry.get("end_time"))
            if date_text and start_text and end_text:
                slot_lines.append(f"{date_text} - {start_text} to {end_text}")
                slots_display_details.append({
                    "date": date_text,
                    "time_range": _format_slot_time_range(entry.get("start_time"), entry.get("end_time")),
                    "rate": _format_rate(getattr(offer, "offered_rate", None)),
                })

    slot_summary = slot_lines[0] if slot_lines else None
    max_slots_in_email = 6
    slots_display = slot_lines[:max_slots_in_email]
    slots_display_details = slots_display_details[:max_slots_in_email]
    slots_extra_count = max(0, len(slot_lines) - len(slots_display))

    if recipient and getattr(recipient, "role", None):
        role_value = str(recipient.role).upper()
        role_route_map = {
            "PHARMACIST": "pharmacist",
            "OTHER_STAFF": "otherstaff",
            "EXPLORER": "explorer",
        }
        role_path = role_route_map.get(role_value)
        if role_path:
            base_ctx["shift_link"] = (
                f"{settings.FRONTEND_BASE_URL}/dashboard/{role_path}/shifts"
                f"?tab=accepted&shift_id={shift.id}&offer_id={getattr(offer, 'id', '')}"
            )

    base_ctx.update({
        "pharmacy_name": pharmacy_display,
        "role_label": shift.get_role_needed_display() if hasattr(shift, "get_role_needed_display") else shift.role_needed,
        "employment_type_label": shift.get_employment_type_display() if hasattr(shift, "get_employment_type_display") else shift.employment_type,
        "slot_summary": slot_summary,
        "slots_display": slots_display,
        "slots_display_details": slots_display_details,
        "slots_extra_count": slots_extra_count,
        "expires_at": getattr(offer, "expires_at", None),
        "offered_rate": getattr(offer, "offered_rate", None),
    })
    return base_ctx


def build_counter_offer_shift_details(shift, counter_offer):
    pharmacy_name = getattr(getattr(shift, "pharmacy", None), "name", "") or "Pharmacy"
    slot_details = []
    counter_slots = list(counter_offer.slots.select_related("slot")) if counter_offer else []

    for counter_slot in counter_slots:
        slot = getattr(counter_slot, "slot", None)
        date_value = getattr(counter_slot, "slot_date", None) or getattr(slot, "date", None)
        start_value = getattr(counter_slot, "proposed_start_time", None) or getattr(slot, "start_time", None)
        end_value = getattr(counter_slot, "proposed_end_time", None) or getattr(slot, "end_time", None)
        rate_value = getattr(counter_slot, "proposed_rate", None)
        if rate_value in (None, "") and slot is not None:
            rate_value = getattr(slot, "rate", None)
        slot_details.append({
            "pharmacy_name": pharmacy_name,
            "date": _format_slot_date(date_value),
            "start_time": _format_slot_time(start_value),
            "end_time": _format_slot_time(end_value),
            "time_range": _format_slot_time_range(start_value, end_value),
            "rate": _format_rate(rate_value),
            "slot_id": getattr(slot, "id", None),
        })

    if not slot_details:
        return build_offer_shift_details(shift, None)

    summary_parts = []
    for item in slot_details:
        date_text = item.get("date") or "date not set"
        time_text = item.get("time_range") or "time not set"
        summary_parts.append(f"{pharmacy_name} | {date_text} {time_text}")

    return {
        "pharmacy_name": pharmacy_name,
        "shift_summary": "; ".join(summary_parts),
        "slot_details": slot_details,
    }

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


def build_roster_email_link(user, pharmacy):
    base = f"{settings.FRONTEND_BASE_URL}/dashboard"
    if not user or not pharmacy:
        return base

    def with_pharmacy(url: str) -> str:
        return f"{url}?pharmacy={pharmacy.id}" if getattr(pharmacy, 'id', None) else url

    # Explicit role-based routing first
    if user.role == "OWNER" or (getattr(pharmacy, "owner", None) and getattr(pharmacy.owner, "user", None) == user):
        return with_pharmacy(f"{base}/owner/manage-pharmacies/roster")
    if hasattr(user, 'organization_memberships') and user.organization_memberships.filter(
        role__in=['ORG_ADMIN', 'CHIEF_ADMIN', 'REGION_ADMIN']
    ).exists():
        return with_pharmacy(f"{base}/organization/manage-pharmacies/roster")

    # Pharmacy admins (regardless of top-level role) get the admin roster path
    if is_admin_of(user, getattr(pharmacy, 'id', None)):
        return with_pharmacy(f"{base}/admin/manage-pharmacies/roster")

    if user.role == "PHARMACIST":
        return with_pharmacy(f"{base}/pharmacist/shifts/roster")
    if user.role == "OTHER_STAFF":
        return with_pharmacy(f"{base}/otherstaff/shifts/roster")

    return with_pharmacy(f"{base}/explorer/roster")

def clean_email(email):
    """Remove hidden unicode chars and spaces from email."""
    if not email:
        return email
    # Remove LTR/RTL, bidi, zero-width space, and all whitespace
    # \u200e (LTR), \u200f (RTL), \u202a-\u202e (bidi), \u200b (zero-width space), \s (any space)
    return re.sub(r'[\u200e\u200f\u202a-\u202e\u200b\s]', '', email)


def finalize_shift_offer(offer: ShiftOffer):
    """
    Finalize a worker-confirmed offer by creating slot assignments exactly once.
    Safe to call multiple times (idempotent for already assigned slots).
    """
    shift = offer.shift
    slot_obj = offer.slot
    if not shift.single_user_only and slot_obj is None:
        raise ValidationError({"detail": "Offer is missing slot selection."})

    assignment_ids = []
    assignment_rates = []
    slots_to_assign = shift.slots.all() if shift.single_user_only else [slot_obj]

    with transaction.atomic():
        for slot in slots_to_assign:
            for entry in expand_shift_slots(shift):
                if entry["slot"].id != slot.id:
                    continue
                slot_date = entry["date"]
                if ShiftSlotAssignment.objects.filter(slot=slot, slot_date=slot_date).exists():
                    continue

                rate, reason = get_locked_rate_for_slot(
                    shift=shift,
                    slot=slot,
                    user=offer.user,
                    override_date=slot_date,
                )
                if getattr(offer, "offered_rate", None) is not None:
                    rate = Decimal(str(offer.offered_rate))
                    reason = {
                        "type": "Offer",
                        "source": "ShiftOffer",
                        "offer_id": offer.id,
                    }

                assn = ShiftSlotAssignment.objects.create(
                    shift=shift,
                    slot=slot,
                    slot_date=slot_date,
                    user=offer.user,
                    unit_rate=rate,
                    rate_reason=reason,
                    is_rostered=True,
                    payment_preference_snapshot=offer.payment_preference_snapshot,
                    settlement_channel=offer.settlement_channel,
                    engagement_kind=offer.engagement_kind,
                    engagement_terms_snapshot=offer.engagement_terms_snapshot,
                    engagement_terms_accepted_at=offer.engagement_terms_accepted_at,
                    source_offer=offer,
                )
                assignment_ids.append(assn.id)
                assignment_rates.append(assn.unit_rate)

        if offer.status != ShiftOffer.Status.ACCEPTED:
            offer.status = ShiftOffer.Status.ACCEPTED
            offer.save(update_fields=["status", "updated_at"])

    return assignment_ids, assignment_rates

def get_candidate_role(obj) -> str:
    """
    Pharmacist => 'Pharmacist'
    OtherStaff/Explorer => use whatever role field you already store.
    Falls back gracefully if your field names differ.
    """
    model = obj._meta.model_name
    if model == 'pharmacistonboarding':
        return 'Pharmacist'
    if model == 'otherstaffonboarding':
        return other_staff_role_label(getattr(obj, 'role_type', None))

    for field in ('position_applied_for', 'desired_role', 'role_type', 'role', 'staff_role', 'explorer_role'):
        val = getattr(obj, field, None)
        if val:
            return other_staff_role_label(val) if model == 'otherstaffonboarding' else str(val)

    rp = getattr(obj, 'rate_preference', None)
    if isinstance(rp, dict):
        for k in ('role', 'position', 'title', 'position_applied_for'):
            if rp.get(k):
                return str(rp[k])

    return model.replace('onboarding', '').replace('_', ' ').title()

def send_referee_emails(obj, is_reminder=False):
    """
    Sends referee email(s). Generates a secure token for the questionnaire link.
    Also schedules a per-referee reminder for each email sent.
    """
    signer = TimestampSigner()

    update_fields = []
    for idx in [1, 2]:
        email_raw = getattr(obj, f'referee{idx}_email', None)
        confirmed = getattr(obj, f'referee{idx}_confirmed', None)
        rejected = getattr(obj, f'referee{idx}_rejected', None)
        name = getattr(obj, f'referee{idx}_name', '')
        workplace = getattr(obj, f'referee{idx}_workplace', '')
        relation = getattr(obj, f'referee{idx}_relation', '')
        email = clean_email(email_raw)

        if email and not confirmed and not rejected:
            if is_reminder:
                subject = f"Gentle Reminder: Reference Request for {obj.user.get_full_name()}"
                template_name = "emails/referee_reminder.html"
                text_template = "emails/referee_reminder.txt"
            else:
                subject = "Reference Request: Please Complete for ChemistTasker"
                template_name = "emails/referee_request.html"
                text_template = "emails/referee_request.txt"

            token = signer.sign(f"{obj._meta.model_name}:{obj.pk}:{idx}")

            # ✅ NEW: include role in the querystring
            query = urlencode({
                "candidate_name": obj.user.get_full_name(),
                "position_applied_for": get_candidate_role(obj),
            })
            confirm_url = f"{settings.FRONTEND_BASE_URL}/referee/questionnaire/{token}?{query}"

            reject_url = f"{settings.FRONTEND_BASE_URL}/onboarding/referee-reject/{token}"

            async_task(
                'users.tasks.send_async_email',
                subject=subject,
                recipient_list=[email],
                template_name=template_name,
                context={
                    "referee_name": name,
                    "referee_relation": relation,
                    "referee_workplace": workplace,
                    "candidate_name": obj.user.get_full_name(),
                    "candidate_first_name": obj.user.first_name,
                    "candidate_last_name": obj.user.last_name,
                    "confirm_url": confirm_url,
                    "reject_url": reject_url,
                    # (optional if your template wants to render it)
                    "position_applied_for": get_candidate_role(obj),
                },
                text_template=text_template
            )
            setattr(obj, f'referee{idx}_last_sent', timezone.now())
            update_fields.append(f'referee{idx}_last_sent')

            # Schedule THIS referee's reminder (initial)
            try:
                from client_profile.tasks import schedule_referee_reminder
                schedule_referee_reminder(obj._meta.model_name, obj.pk, idx)
            except Exception:
                pass

    if update_fields:
        obj.save(update_fields=list(set(update_fields)))

def summarize_onboarding_fields(obj):
    summary = {}
    for field in obj._meta.fields:
        if field.name in ('id', 'user', 'created', 'modified', 'pk'):
            continue
        value = getattr(obj, field.name, None)
        if value not in [None, '', []]:
            # FieldFile or file: get url if possible, else name, else string
            if hasattr(value, "url"):
                val = value.url
            elif hasattr(value, "name"):
                val = value.name
            else:
                try:
                    val = str(value)
                except Exception:
                    val = "[Unserializable]"
            summary[field.verbose_name.title()] = val
    return summary

def notify_superuser_on_onboarding(obj):
    User = get_user_model()
    superusers = User.objects.filter(is_superuser=True, email__isnull=False).values_list('email', flat=True)
    if not superusers:
        return

    model = obj._meta
    admin_url = f"{settings.BACKEND_BASE_URL}/admin/{model.app_label}/{model.model_name}/{obj.pk}/change/"
    context = {
        "model_verbose_name": model.verbose_name,
        "pk": obj.pk,
        "user": str(getattr(obj, "user", "")),
        "user_full_name": getattr(obj.user, "get_full_name", lambda: str(obj.user))(),
        "user_email": getattr(obj.user, "email", ""),
        "admin_url": admin_url,
        "summary_fields": summarize_onboarding_fields(obj),  # Now always strings
        "created": str(getattr(obj, "created", "")),
    }
    async_task(
        'users.tasks.send_async_email',
        subject=f"New {model.verbose_name.title()} Submission (ID {obj.pk})",
        recipient_list=list(superusers),
        template_name="emails/admin_onboarding_notification.html",
        context=context,
        text_template="emails/admin_onboarding_notification.txt",
    )

def simple_name_match(extracted_text, first_name, last_name, cutoff=0.8):
    if not extracted_text or not first_name or not last_name:
        return False
    text = extracted_text.lower()
    text = re.sub(r'\b(mr|mrs|ms|dr|miss|prof|sir)\b[.]*', '', text)
    words = text.split()
    f_name = first_name.lower().strip()
    l_name = last_name.lower().strip()
    def phrase_match(target, words):
        n = len(words)
        t_len = len(target.split())
        for i in range(n):
            for j in range(i+1, min(i+1+t_len+2, n+1)):
                phrase = " ".join(words[i:j]).strip()
                if target == phrase or difflib.SequenceMatcher(None, phrase, target).ratio() >= cutoff:
                    return True
        for word in words:
            if word == target or difflib.SequenceMatcher(None, word, target).ratio() >= cutoff:
                return True
        return False
    return phrase_match(f_name, words) and phrase_match(l_name, words)

def get_frontend_dashboard_url(user):
    """
    Returns the appropriate frontend dashboard URL based on the user's role.
    Handles 'OTHER_STAFF' to 'otherstaff' conversion.
    """
    if not user or not hasattr(user, 'role'):
        return f"{settings.FRONTEND_BASE_URL}/dashboard/" # Default fallback

    role_slug = user.role.lower()
    if role_slug == 'other_staff': # Your specific conversion rule
        role_slug = 'otherstaff'
    elif role_slug == 'owner':
        # Check for organization admin role first if it influences dashboard path
        # Assuming 'ORGANIZATION' role is handled within the 'owner' dashboard structure or has its own path
        if hasattr(user, 'organization_memberships') and user.organization_memberships.filter(
            role__in=['ORG_ADMIN', 'CHIEF_ADMIN', 'REGION_ADMIN']
        ).exists():
            return f"{settings.FRONTEND_BASE_URL}/dashboard/organization/" # Or whatever your org admin path is
        else:
            return f"{settings.FRONTEND_BASE_URL}/dashboard/owner/"
    
    return f"{settings.FRONTEND_BASE_URL}/dashboard/{role_slug}/"

from decimal import Decimal, ROUND_HALF_UP, InvalidOperation

def q6(v):
    """Quantize to 6 decimal places; return None on blank/invalid."""
    if v in (None, ''):
        return None
    try:
        return Decimal(str(v)).quantize(Decimal('0.000001'), rounding=ROUND_HALF_UP)
    except (InvalidOperation, ValueError, TypeError):
        return None
