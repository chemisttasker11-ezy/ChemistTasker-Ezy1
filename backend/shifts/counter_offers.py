"""Shift counter offers: which ones a user may see, and what submitting, accepting and rejecting one does.

Refusals raise `ShiftActionRefused`, whose response body and status are those the views used to build by hand.
"""
from datetime import timedelta

from django.db.models import Count
from django.utils import timezone

from core.task_queue import async_task
from shifts.access import ShiftActionRefused
from shifts.assignment import OFFER_EXPIRY_HOURS, slot_locked_for_shift_offer
from shifts.emails import (
    build_counter_offer_shift_details,
    build_offer_shift_details,
    build_shift_counter_offer_context,
    worker_offer_url,
)
from shifts.models import ShiftCounterOffer, ShiftInterest, ShiftOffer, ShiftSlotAssignment
from shifts.notifications import notify_shift_managers, notify_shift_users


def visible_counter_offers_for_shift(*, shift, user, can_manage_pharmacy: bool):
    offers = (
        shift.counter_offers
        .select_related('user', 'decided_by')
        .prefetch_related('slots__slot')
        .annotate(slot_count=Count('slots'))
        .filter(
            slot_count__gt=0,
            status=ShiftCounterOffer.Status.PENDING,
        )
    )
    if not can_manage_pharmacy:
        offers = offers.filter(user=user)
    return offers


def announce_counter_offer(*, shift, user, offer):
    """After a worker submits a counter offer: record their interest and tell the shift's managers."""
    # Ensure the user is marked as interested in the targeted slots (or shift-level) without triggering the
    # express_interest email/notification path. This keeps counter-offer slots disabled and visible in interests.
    ensure_interest_for_counter_offer(shift=shift, user=user, offer=offer)

    # Notify shift managers in-app; keep email limited to owner/creator.
    offer_slot_ids = list(offer.slots.values_list('slot_id', flat=True))
    primary_slot_id = offer_slot_ids[0] if offer_slot_ids else None
    is_public = (shift.visibility == 'PLATFORM')
    sender_name = "A candidate" if is_public else (offer.user.get_full_name() if offer.user else "A candidate")
    offer_details = build_counter_offer_shift_details(shift, offer)
    notify_shift_managers(
        shift,
        title=f"New counter offer: {shift.pharmacy.name}",
        body=f"{sender_name} sent a counter offer for your shift. {offer_details['shift_summary']}",
        kind="shift_counter_offer_received",
        payload={
            "offer_id": offer.id,
            "slot_id": primary_slot_id,
            "slot_ids": offer_slot_ids,
            **offer_details,
        },
    )

    recipients = []
    if shift.created_by:
        recipients.append(shift.created_by)
    elif getattr(getattr(shift.pharmacy, "owner", None), "user", None):
        recipients.append(shift.pharmacy.owner.user)

    seen_emails = set()
    for recipient in recipients:
        if not recipient or not recipient.email:
            continue
        if recipient.email in seen_emails:
            continue
        seen_emails.add(recipient.email)
        ctx = build_shift_counter_offer_context(shift, offer, recipient=recipient)
        async_task(
            'users.tasks.send_async_email',
            subject=f"New counter offer for {shift.pharmacy.name}",
            recipient_list=[recipient.email],
            template_name="emails/shift_counter_offer.html",
            context=ctx,
            text_template="emails/shift_counter_offer.txt",
            suppress_auto_notification=True,
        )


def ensure_interest_for_counter_offer(*, shift, user, offer):
    slots_qs = offer.slots.select_related('slot')
    slots = list(slots_qs)
    if slots:
        for offer_slot in slots:
            slot = offer_slot.slot
            if not slot:
                continue
            ShiftInterest.objects.get_or_create(
                shift=shift,
                slot=slot,
                user=user,
            )
    else:
        # No specific slots: record shift-level interest
        ShiftInterest.objects.get_or_create(
            shift=shift,
            slot=None,
            user=user,
        )


def accept_counter_offer(*, shift, offer, slot_id, decided_by):
    """Accept a counter offer (for one slot, or the first free one) by turning it into worker offers the candidate
    must confirm. Returns the response body."""
    offer_slot_ids = list(offer.slots.values_list('slot_id', flat=True))

    if slot_id is None:
        if offer_slot_ids:
            unassigned_offer_slots = [
                sid for sid in offer_slot_ids
                if not ShiftSlotAssignment.objects.filter(slot_id=sid).exists()
            ]
            slot_id = unassigned_offer_slots[0] if unassigned_offer_slots else offer_slot_ids[0]

    # Allow per-slot acceptance even if the offer was already accepted for another slot.
    if offer.status != ShiftCounterOffer.Status.PENDING and slot_id is None:
        raise ShiftActionRefused('Counter offer is not pending.')
    if offer.status == ShiftCounterOffer.Status.REJECTED:
        raise ShiftActionRefused('Counter offer has been rejected.')

    offer_slots_qs = offer.slots.select_related('slot')
    if slot_id is not None:
        offer_slots_qs = offer_slots_qs.filter(slot_id=slot_id)
    offer_slots = list(offer_slots_qs)
    if not offer_slots:
        raise ShiftActionRefused('Counter offer has no slots for this selection.')

    for offer_slot in offer_slots:
        slot = offer_slot.slot
        slot_date = offer_slot.slot_date or slot.date
        if slot_locked_for_shift_offer(shift=shift, slot=slot, slot_date=slot_date, ignore_user=offer.user):
            raise ShiftActionRefused('One or more slots are no longer available.')

    offer.status = ShiftCounterOffer.Status.ACCEPTED
    offer.decided_by = decided_by
    offer.decided_at = timezone.now()
    offer.save(update_fields=['status', 'decided_by', 'decided_at', 'updated_at'])

    created_offers = []
    now = timezone.now()
    for offer_slot in offer_slots:
        slot = offer_slot.slot
        existing_offer = ShiftOffer.objects.filter(
            shift=shift,
            user=offer.user,
            slot=slot,
            status=ShiftOffer.Status.PENDING,
        ).first()
        if existing_offer and existing_offer.expires_at and existing_offer.expires_at <= now:
            existing_offer.status = ShiftOffer.Status.EXPIRED
            existing_offer.save(update_fields=["status", "updated_at"])
            existing_offer = None

        effective_date = offer_slot.slot_date or slot.date
        effective_start = offer_slot.proposed_start_time or slot.start_time
        effective_end = offer_slot.proposed_end_time or slot.end_time
        effective_rate = offer_slot.proposed_rate if offer_slot.proposed_rate is not None else slot.rate

        if existing_offer:
            existing_offer.offered_slot_date = effective_date
            existing_offer.offered_start_time = effective_start
            existing_offer.offered_end_time = effective_end
            existing_offer.offered_rate = effective_rate
            existing_offer.counter_offer = offer
            existing_offer.save(update_fields=[
                "offered_slot_date",
                "offered_start_time",
                "offered_end_time",
                "offered_rate",
                "counter_offer",
                "updated_at",
            ])
            shift_offer = existing_offer
        else:
            shift_offer = ShiftOffer.objects.create(
                shift=shift,
                slot=slot,
                user=offer.user,
                offered_slot_date=effective_date,
                offered_start_time=effective_start,
                offered_end_time=effective_end,
                offered_rate=effective_rate,
                counter_offer=offer,
                expires_at=now + timedelta(hours=OFFER_EXPIRY_HOURS),
            )
        created_offers.append(shift_offer)

    if offer.user and offer.user.email:
        ctx = build_shift_counter_offer_context(shift, offer, recipient=offer.user)
        ctx["payment_required"] = False
        ctx["worker_confirmation_required"] = True
        offer_details = build_offer_shift_details(shift, created_offers[0] if created_offers else None)
        ctx.update(offer_details)
        ctx["shift_link"] = worker_offer_url(offer.user, shift, created_offers[0] if created_offers else None)
        notify_shift_users(
            [offer.user],
            shift=shift,
            title="Counter offer accepted",
            body=f"Your counter offer was accepted. Please confirm the shift offer to lock it in. {offer_details['shift_summary']}",
            kind="shift_counter_offer_accepted",
            payload={
                "shift_id": shift.id,
                "offer_id": offer.id,
                "generated_offer_ids": [o.id for o in created_offers],
                "worker_confirmation_required": True,
                **offer_details,
            },
        )
        async_task(
            'users.tasks.send_async_email',
            subject="Your counter offer was accepted",
            recipient_list=[offer.user.email],
            template_name="emails/shift_counter_offer_accepted.html",
            context=ctx,
            text_template="emails/shift_counter_offer_accepted.txt",
            suppress_auto_notification=True,
        )

    return {
        'detail': 'Offer sent for candidate confirmation.',
        'offer_ids': [o.id for o in created_offers],
        'assignment_ids': [],
        'payment_required': False,
        'payment_status': shift.payment_status,
        'worker_confirmation_required': True,
    }


def reject_counter_offer(*, shift, offer, decided_by):
    """Decline a pending counter offer and tell the worker."""
    if offer.status != ShiftCounterOffer.Status.PENDING:
        raise ShiftActionRefused('Counter offer is not pending.')

    offer.status = ShiftCounterOffer.Status.REJECTED
    offer.decided_by = decided_by
    offer.decided_at = timezone.now()
    offer.save(update_fields=['status', 'decided_by', 'decided_at', 'updated_at'])

    if offer.user and offer.user.email:
        ctx = build_shift_counter_offer_context(shift, offer, recipient=offer.user)
        offer_details = build_counter_offer_shift_details(shift, offer)
        ctx.update(offer_details)
        notify_shift_users(
            [offer.user],
            shift=shift,
            title=f"Counter offer declined: {shift.pharmacy.name}",
            body=f"Your counter offer was declined. {offer_details['shift_summary']}",
            kind="shift_counter_offer_declined",
            payload={
                "offer_id": offer.id,
                "slot_ids": list(offer.slots.values_list('slot_id', flat=True)),
                **offer_details,
            },
        )
        async_task(
            'users.tasks.send_async_email',
            subject=f"Your counter offer for {shift.pharmacy.name} was declined",
            recipient_list=[offer.user.email],
            template_name="emails/shift_counter_offer_rejected.html",
            context=ctx,
            text_template="emails/shift_counter_offer_rejected.txt",
            suppress_auto_notification=True,
        )
