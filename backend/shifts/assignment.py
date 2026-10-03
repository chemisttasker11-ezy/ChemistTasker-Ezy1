"""Putting a worker on a shift: sending a candidate a time-bound shift offer, and rostering direct pharmacy staff.

Refusals raise `ShiftActionRefused`, whose response body and status are those the views used to build by hand.
"""
from datetime import date, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone

from core.task_queue import async_task
from memberships.models import Membership, PHARMACY_STAFF_EMPLOYMENT_TYPES
from shifts.access import ShiftActionRefused
from shifts.emails import build_offer_shift_details, build_shift_offer_context
from shifts.engagement import staff_assignment_defaults
from shifts.models import ShiftOffer, ShiftSlotAssignment
from shifts.notifications import notify_shift_users

OFFER_EXPIRY_HOURS = 48


def offer_shift(*, shift, candidate, slot_id):
    """Offer the shift (or one slot) to a candidate, who must confirm before any assignment exists. A pending offer
    is refreshed instead of duplicated; an expired one is closed first. Returns the response body."""
    # For multi-slot shifts, auto-pick when possible (prefer unassigned)
    if not shift.single_user_only and slot_id is None:
        slots_qs = shift.slots.all()
        if slots_qs.count() == 1:
            slot_id = slots_qs.first().id
        else:
            unassigned_ids = [
                s.id for s in slots_qs
                if not ShiftSlotAssignment.objects.filter(slot=s).exists()
            ]
            if len(unassigned_ids) == 1:
                slot_id = unassigned_ids[0]
            elif unassigned_ids:
                slot_id = unassigned_ids[0]

    # For multi-slot shifts, prefer an explicit slot_id; if still None after auto-pick, raise.
    if not shift.single_user_only and slot_id is None:
        raise ShiftActionRefused('slot_id is required for multi-slot shifts.')

    slot_obj = None
    if not shift.single_user_only and slot_id is not None:
        slot_obj = get_object_or_404(shift.slots, pk=slot_id)
        if slot_locked_for_shift_offer(shift=shift, slot=slot_obj):
            raise ShiftActionRefused('This slot is already locked or awaiting payment.')
    elif shift.single_user_only:
        locked_slot = next(
            (slot for slot in shift.slots.all() if slot_locked_for_shift_offer(shift=shift, slot=slot)),
            None,
        )
        if locked_slot:
            raise ShiftActionRefused('This shift is already locked or awaiting payment.')

    now = timezone.now()
    existing_offer = ShiftOffer.objects.filter(
        shift=shift,
        user=candidate,
        slot=slot_obj,
        status=ShiftOffer.Status.PENDING,
    ).first()
    if existing_offer and existing_offer.expires_at and existing_offer.expires_at <= now:
        existing_offer.status = ShiftOffer.Status.EXPIRED
        existing_offer.save(update_fields=["status", "updated_at"])
        existing_offer = None

    offered_slot_date = slot_obj.date if slot_obj else None
    offered_start_time = slot_obj.start_time if slot_obj else None
    offered_end_time = slot_obj.end_time if slot_obj else None
    offered_rate = slot_obj.rate if slot_obj else (shift.fixed_rate or shift.max_hourly_rate or shift.min_hourly_rate)

    if existing_offer:
        existing_offer.offered_slot_date = offered_slot_date
        existing_offer.offered_start_time = offered_start_time
        existing_offer.offered_end_time = offered_end_time
        existing_offer.offered_rate = offered_rate
        existing_offer.save(update_fields=[
            "offered_slot_date",
            "offered_start_time",
            "offered_end_time",
            "offered_rate",
            "updated_at",
        ])
        return {
            'status': 'Offer is already pending candidate confirmation.',
            'offer_id': existing_offer.id,
            'worker_confirmation_required': True,
        }
    else:
        offer = ShiftOffer.objects.create(
            shift=shift,
            slot=slot_obj,
            user=candidate,
            offered_slot_date=offered_slot_date,
            offered_start_time=offered_start_time,
            offered_end_time=offered_end_time,
            offered_rate=offered_rate,
            expires_at=now + timedelta(hours=OFFER_EXPIRY_HOURS),
        )

    if candidate.email:
        ctx = build_shift_offer_context(shift, offer, recipient=candidate)
        offer_details = build_offer_shift_details(shift, offer)
        ctx.update(offer_details)
        notify_shift_users(
            [candidate],
            shift=shift,
            title="Shift offer received",
            body=f"You have received a shift offer. Please confirm to lock it in. {offer_details['shift_summary']}",
            kind="shift_offer_received",
            payload={"offer_id": offer.id, **offer_details},
        )
        async_task(
            'users.tasks.send_async_email',
            subject="You have a new shift offer",
            recipient_list=[candidate.email],
            template_name="emails/shift_offer.html",
            context=ctx,
            text_template="emails/shift_offer.txt",
            suppress_auto_notification=True,
        )

    return {
        'status': f'Offer sent to {candidate.get_full_name() or candidate.email}.',
        'offer_id': offer.id,
    }


def roster_direct_staff(*, shift, candidate, assignments):
    """Roster a direct full-time, part-time or casual member onto the given {slot_id, slot_date} entries; entries
    missing either are skipped. Returns the response body."""
    membership = Membership.objects.filter(
        user=candidate,
        pharmacy=shift.pharmacy,
        is_active=True,
    ).first()

    if not membership or membership.employment_type not in PHARMACY_STAFF_EMPLOYMENT_TYPES:
        raise ShiftActionRefused(
            "Only direct full-time, part-time or casual pharmacy staff can be rostered here. "
            "Locum, Shift Hero and external workers must accept a shift offer."
        )

    assignment_ids = []

    # A submitted roster operation is one user action. If any requested slot is
    # invalid or belongs to a published roster week, do not leave earlier slots
    # from the same request persisted.
    with transaction.atomic():
        for entry in assignments:
            slot_id = entry.get('slot_id')
            slot_date = entry.get('slot_date')

            if not slot_id or not slot_date:
                continue  # Preserve the historical skip semantics for incomplete entries.

            slot = get_object_or_404(shift.slots, pk=slot_id)
            try:
                slot_date = date.fromisoformat(str(slot_date))
            except ValueError:
                raise ShiftActionRefused('Invalid slot_date format, use YYYY-MM-DD')

            try:
                assignment_defaults = staff_assignment_defaults(
                    user=candidate,
                    pharmacy=shift.pharmacy,
                    work_date=slot_date,
                )
                # The published-roster guard on save refuses changes to a published roster week.
                assn, _ = ShiftSlotAssignment.objects.update_or_create(
                    slot=slot,
                    slot_date=slot_date,
                    defaults={
                        "shift": shift,
                        "user": candidate,
                        "unit_rate": Decimal('0.00'),
                        "rate_reason": {"source": "Rostered manual assign"},
                        "is_rostered": True,
                        **assignment_defaults,
                    }
                )
            except DjangoValidationError as exc:
                raise ShiftActionRefused(getattr(exc, "message_dict", {"detail": exc.messages}))
            assignment_ids.append(assn.id)

    if assignment_ids:
        notify_shift_users(
            [candidate],
            shift=shift,
            title="Shift assigned",
            body=f"You have been assigned {len(assignment_ids)} slot(s) at {shift.pharmacy.name}.",
            kind="shift_assigned",
            payload={
                "assignment_ids": assignment_ids,
            },
        )

    return {
        "detail": f"{len(assignment_ids)} slot(s) rostered for {candidate.get_full_name()}",
        "assignment_ids": assignment_ids
    }


def slot_locked_for_shift_offer(*, shift, slot, slot_date=None, ignore_user=None):
    if not slot:
        return False
    target_date = slot_date or getattr(slot, "date", None)
    assignment_qs = ShiftSlotAssignment.objects.filter(shift=shift, slot=slot)
    if target_date:
        assignment_qs = assignment_qs.filter(slot_date=target_date)
    if assignment_qs.exists():
        return True
    pending_qs = ShiftOffer.objects.filter(
        shift=shift,
        slot=slot,
        status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
    )
    if ignore_user is not None:
        ignore_user_id = getattr(ignore_user, "id", ignore_user)
        pending_qs = pending_qs.exclude(user_id=ignore_user_id)
    if target_date:
        pending_qs = pending_qs.filter(
            Q(offered_slot_date=target_date) | Q(offered_slot_date__isnull=True)
        )
    return pending_qs.exists()
def offer_dedicated_shift(shift, dedicated_user):
    """A shift posted for one worker: offer them the whole shift (single-user or slotless) or each slot, and after
    commit send one offer e-mail with its notification."""
    offers = []
    now = timezone.now()
    if shift.single_user_only or not shift.slots.exists():
        offers.append(ShiftOffer.objects.create(
            shift=shift,
            slot=None,
            user=dedicated_user,
            offered_slot_date=None,
            offered_start_time=None,
            offered_end_time=None,
            offered_rate=shift.fixed_rate or shift.max_hourly_rate or shift.min_hourly_rate,
            expires_at=now + timedelta(hours=OFFER_EXPIRY_HOURS),
        ))
    else:
        for slot in shift.slots.all():
            offers.append(ShiftOffer.objects.create(
                shift=shift,
                slot=slot,
                user=dedicated_user,
                offered_slot_date=slot.date,
                offered_start_time=slot.start_time,
                offered_end_time=slot.end_time,
                offered_rate=slot.rate,
                expires_at=now + timedelta(hours=OFFER_EXPIRY_HOURS),
            ))

    if offers and dedicated_user.email:
        offer_for_email = offers[0]
        def _send_offer_email():
            ctx = build_shift_offer_context(
                shift,
                offer_for_email,
                recipient=dedicated_user,
                ignore_slot_filter=True,
            )
            offer_details = build_offer_shift_details(shift, offer_for_email)
            ctx.update(offer_details)
            notify_shift_users(
                [dedicated_user],
                shift=shift,
                title="Shift offer received",
                body=f"You have received a shift offer. Please confirm to lock it in. {offer_details['shift_summary']}",
                kind="shift_offer_received",
                payload={"offer_id": offer_for_email.id, **offer_details},
            )
            async_task(
                'users.tasks.send_async_email',
                subject="You have a new shift offer",
                recipient_list=[dedicated_user.email],
                template_name="emails/shift_offer.html",
                context=ctx,
                text_template="emails/shift_offer.txt",
                suppress_auto_notification=True,
            )

        transaction.on_commit(_send_offer_email)

