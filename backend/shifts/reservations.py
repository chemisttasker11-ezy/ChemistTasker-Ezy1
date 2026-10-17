"""Payment reservation rules for shift offers. The Shift/Slot remain authoritative.

The caller holds the shift row lock when mutating reservations or finalizing payment.
No duplicate state machine or marketplace publication is introduced here.
"""
from datetime import datetime, timedelta

from django.db import transaction
from django.utils import timezone

from organizations.timezone import get_pharmacy_timezone
from shifts.models import Shift, ShiftOffer, ShiftSlotAssignment
from shifts.pricing import expand_shift_slots


def start_at(shift, offer):
    """The earliest relevant occurrence, in the pharmacy's local timezone."""
    matches = [
        entry for entry in expand_shift_slots(shift)
        if (offer.slot_id is None or entry["slot"].id == offer.slot_id)
        and (offer.offered_slot_date is None or entry["date"] == offer.offered_slot_date)
    ]
    if not matches:
        return None
    earliest = min(matches, key=lambda entry: (entry["date"], entry["start_time"]))
    return timezone.make_aware(
        datetime.combine(earliest["date"], offer.offered_start_time or earliest["start_time"]),
        get_pharmacy_timezone(shift.pharmacy),
    )


def payment_deadline(shift, offer, *, now=None):
    """Owner-approved D02 generous bands, always capped by start time."""
    now = now or timezone.now()
    start = start_at(shift, offer)
    if start is None or start <= now:
        return None
    lead = start - now
    if lead > timedelta(hours=48):
        allowance = timedelta(hours=24)
    elif lead > timedelta(hours=12):
        allowance = timedelta(hours=6)
    elif lead > timedelta(hours=2):
        allowance = timedelta(hours=2)
    else:
        allowance = timedelta(minutes=30)
    return min(start, now + allowance)


def reservation_available(offer, *, now=None):
    now = now or timezone.now()
    return (
        offer.status == ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT
        and (offer.payment_due_at is None or offer.payment_due_at > now)
    )


def expiry_notification(offer_id):
    from core.task_queue import async_task
    from shifts.notifications import notify_shift_managers, notify_shift_users

    offer = ShiftOffer.objects.select_related("shift__pharmacy", "user").get(pk=offer_id)
    shift = offer.shift
    payload = {"offer_id": offer.id, "status": "EXPIRED", "reason": "payment_timeout"}
    notify_shift_users(
        [offer.user], shift=shift, title="Shift reservation expired",
        body="The pharmacy payment deadline passed. Your shift was not confirmed.",
        kind="shift_payment_reservation_expired_worker", payload=payload,
    )
    notify_shift_managers(
        shift, title="Shift reservation expired",
        body="Payment was not completed before the reservation deadline. The opening is available to the same audience.",
        kind="shift_payment_reservation_expired_manager", payload=payload,
    )
    if offer.user.email:
        async_task(
            "users.tasks.send_async_email",
            subject="Your shift reservation has expired",
            recipient_list=[offer.user.email],
            text_template="emails/shift_reservation_expired.txt",
            context={"pharmacy_name": shift.pharmacy.name, "offer_id": offer.id},
            suppress_auto_notification=True,
        )


def expire_overdue_reservations(*, now=None, limit=200):
    """Atomic, idempotent expiry. Notifications follow a successful commit.

    One shift lock serializes with payment settlement and worker acceptance.
    No escalations or deletions: the existing shift audience is unchanged.
    """
    now = now or timezone.now()
    ids = list(
        ShiftOffer.objects.filter(
            status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            payment_due_at__lte=now,
        ).order_by("payment_due_at", "pk").values_list("pk", flat=True)[:limit]
    )
    expired = 0
    for offer_id in ids:
        shift_id = ShiftOffer.objects.filter(pk=offer_id).values_list("shift_id", flat=True).first()
        if not shift_id:
            continue
        with transaction.atomic():
            shift = Shift.objects.select_for_update().get(pk=shift_id)
            offer = ShiftOffer.objects.select_for_update().get(pk=offer_id)
            if (
                offer.status != ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT
                or not offer.payment_due_at or offer.payment_due_at > now
            ):
                continue
            # Any already-booked occurrence is not reopened.
            if ShiftSlotAssignment.objects.filter(source_offer=offer).exists():
                continue
            offer.status = ShiftOffer.Status.EXPIRED
            offer.payment_expired_at = now
            offer.save(update_fields=["status", "payment_expired_at", "updated_at"])
            if not ShiftOffer.objects.filter(
                shift=shift, status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
            ).exists():
                shift.payment_status = (
                    "PAID" if ShiftSlotAssignment.objects.filter(
                        shift=shift, source_offer__isnull=False,
                    ).exists() else "NOT_REQUIRED"
                )
                shift.save(update_fields=["payment_status"])
            transaction.on_commit(lambda pk=offer.pk: expiry_notification(pk))
            expired += 1
    return expired
