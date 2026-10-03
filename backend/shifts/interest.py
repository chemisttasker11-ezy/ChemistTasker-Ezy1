"""A worker's response to a shift: expressing interest in it or declining it.

The views translate the request into these calls and serialize the rows they return. Refusals raise
`ShiftActionRefused`, whose response body and status are those the views used to build by hand.
"""
from datetime import datetime

from rest_framework import status

from memberships.models import FAVORITE_STAFF_EMPLOYMENT_TYPES, Membership, PHARMACY_STAFF_EMPLOYMENT_TYPES
from onboarding.models import OtherStaffOnboarding, PharmacistOnboarding
from core.task_queue import async_task
from shifts.access import ShiftActionRefused, _user_can_perform_shift_role
from shifts.emails import build_offer_shift_details, build_shift_email_context, build_shift_interest_context
from shifts.escalation import PUBLIC_LEVEL
from shifts.models import ShiftInterest, ShiftRejection, ShiftSlot
from shifts.notifications import notify_shift_managers


def is_public_shift_member_access(user, shift):
    """An active staff or favourite member of the pharmacy reaching its public, named shift as a member."""
    if not user or not getattr(user, "is_authenticated", False):
        return False
    if getattr(shift, "visibility", None) != PUBLIC_LEVEL:
        return False
    if getattr(shift, "post_anonymously", False):
        return False
    if not _user_can_perform_shift_role(user, getattr(shift, "role_needed", None)):
        return False
    return Membership.objects.filter(
        user=user,
        pharmacy=shift.pharmacy,
        employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES + FAVORITE_STAFF_EMPLOYMENT_TYPES,
        is_active=True,
    ).exists()


def _require_public_shift_onboarding(user):
    if user.role == 'PHARMACIST':
        po = PharmacistOnboarding.objects.filter(user=user).first()
        if not po:
            raise ShiftActionRefused(
                'Please complete your pharmacist onboarding before applying for public shifts.',
                status.HTTP_400_BAD_REQUEST,
            )
        if not po.verified:
            raise ShiftActionRefused(
                'Your onboarding must be verified by admin before applying for public shifts.',
                status.HTTP_403_FORBIDDEN,
            )
    elif user.role == 'OTHER_STAFF':
        os = OtherStaffOnboarding.objects.filter(user=user).first()
        if not os:
            raise ShiftActionRefused(
                'Please complete your staff onboarding before applying for public shifts.',
                status.HTTP_400_BAD_REQUEST,
            )
        if not os.verified:
            raise ShiftActionRefused(
                'Your onboarding must be verified by admin before applying for public shifts.',
                status.HTTP_403_FORBIDDEN,
            )


def express_interest(*, shift, user, slot_ids=None, slot_id=None):
    """Record the user's interest in the shift (or the given slots) and tell the managers about new interest.

    Returns `(interests, created_interests)`.
    """
    # 1) Onboarding required
    if shift.visibility == PUBLIC_LEVEL and not is_public_shift_member_access(user, shift):
        _require_public_shift_onboarding(user)

    # 2) Interest logic
    if slot_ids is not None and not isinstance(slot_ids, list):
        raise ShiftActionRefused('slot_ids must be a list.')

    has_slot_payload = slot_ids is not None or slot_id is not None
    raw_target_slot_ids = slot_ids if slot_ids is not None else ([slot_id] if slot_id is not None else [])
    target_slot_ids = []
    for value in raw_target_slot_ids:
        if value in (None, ''):
            continue
        try:
            target_slot_ids.append(int(value))
        except (TypeError, ValueError):
            raise ShiftActionRefused(f'Invalid slot_id: {value}')

    interests = []
    created_interests = []
    if shift.single_user_only:
        interest, created = ShiftInterest.objects.get_or_create(
            shift=shift,
            slot=None,
            user=user
        )
        interests.append(interest)
        if created:
            created_interests.append(interest)
    else:
        if target_slot_ids:
            slots = list(ShiftSlot.objects.filter(pk__in=target_slot_ids, shift=shift))
            found_ids = {slot.id for slot in slots}
            missing_ids = [value for value in target_slot_ids if value not in found_ids]
            if missing_ids:
                raise ShiftActionRefused(f'Invalid slot_id(s): {missing_ids}')
        elif has_slot_payload:
            raise ShiftActionRefused('slot_ids cannot be empty.')
        else:
            slots = [None]

        for slot in slots:
            interest, created = ShiftInterest.objects.get_or_create(
                shift=shift,
                slot=slot,
                user=user
            )
            interests.append(interest)
            if created:
                created_interests.append(interest)

    if created_interests:
        _announce_interest(shift=shift, user=user, created_interests=created_interests)
    return interests, created_interests


def _announce_interest(*, shift, user, created_interests):
    is_public = (shift.visibility == 'PLATFORM')
    applicant_name = "A candidate" if is_public else (user.get_full_name() or user.email)
    title = "New public shift interest" if is_public else "New member shift interest"
    interest_details = build_offer_shift_details(shift, created_interests[0])
    body = (
        f"{applicant_name} expressed interest in "
        f"{len(created_interests)} slot(s) at {shift.pharmacy.name}. {interest_details['shift_summary']}"
    )
    manager_recipients = notify_shift_managers(
        shift,
        title=title,
        body=body,
        kind="shift_interest",
        payload={
            "interest_ids": [interest.id for interest in created_interests],
            "slot_ids": [interest.slot_id for interest in created_interests if interest.slot_id],
            "slot_id": next((interest.slot_id for interest in created_interests if interest.slot_id), None),
            **interest_details,
        },
    )
    primary_email_recipient = shift.created_by or (manager_recipients[0] if manager_recipients else None)
    ctx = build_shift_interest_context(shift, created_interests[0], recipient=primary_email_recipient)
    interest_slots = []
    for interest in created_interests:
        slot = getattr(interest, "slot", None)
        if slot:
            interest_slots.append({
                "date": slot.date.strftime("%d %B, %Y").lstrip("0"),
                "start_time": slot.start_time.strftime("%I:%M %p").lstrip("0"),
                "end_time": slot.end_time.strftime("%I:%M %p").lstrip("0"),
            })
    if interest_slots:
        ctx["slots"] = interest_slots

    email_recipient = primary_email_recipient if primary_email_recipient and primary_email_recipient.email else None
    if email_recipient:
        email_kwargs = dict(
            subject=f"New interest in your shift at {shift.pharmacy.name}",
            recipient_list=[email_recipient.email],
            template_name="emails/shift_interest.html" if is_public else "emails/shift_member_interest.html",
            context=ctx,
            text_template="emails/shift_interest.txt" if is_public else "emails/shift_member_interest.txt",
            suppress_auto_notification=True,
        )
        async_task('users.tasks.send_async_email', **email_kwargs)


def reject_shift(*, shift, user, slot_ids=None, slot_id=None, slot_date=None):
    """Record that the user declines the shift (or the given slots) and prompt its creator to escalate.

    Returns `(rejections, created_rejections)`.
    """
    if slot_ids is not None and not isinstance(slot_ids, list):
        raise ShiftActionRefused('slot_ids must be a list.')

    raw_target_slot_ids = slot_ids if slot_ids is not None else ([slot_id] if slot_id is not None else [])
    target_slot_ids = []
    for value in raw_target_slot_ids:
        try:
            target_slot_ids.append(int(value))
        except (TypeError, ValueError):
            raise ShiftActionRefused(f'Invalid slot_id: {value}')

    if not target_slot_ids:
        # Treat an empty payload as "reject the whole shift". Single-user shifts
        # store that as slot=None; multi-slot shifts expand to all concrete slots.
        slots = [None] if shift.single_user_only else list(ShiftSlot.objects.filter(shift=shift))
        if not slots:
            raise ShiftActionRefused('No slots are available to reject.')
    else:
        slots = list(ShiftSlot.objects.filter(pk__in=target_slot_ids, shift=shift))
        found_ids = {slot.id for slot in slots}
        missing_ids = [value for value in target_slot_ids if value not in found_ids]
        if missing_ids:
            raise ShiftActionRefused(f'Invalid slot_id(s): {missing_ids}')

    # Parse slot_date if provided (for recurring slots)
    if slot_date:
        try:
            slot_date_obj = datetime.strptime(slot_date, "%Y-%m-%d").date()
        except ValueError:
            raise ShiftActionRefused('Invalid slot_date format, use YYYY-MM-DD')
    else:
        slot_date_obj = None

    rejections = []
    created_rejections = []
    for slot in slots:
        rejection, created = ShiftRejection.objects.get_or_create(
            shift=shift,
            slot=slot,
            slot_date=slot_date_obj if slot is not None and slot.is_recurring else None,
            user=user
        )
        rejections.append(rejection)
        if created:
            created_rejections.append(rejection)

    # --- Send escalation prompt email if this is a new rejection ---
    if created_rejections and shift.created_by and shift.created_by.email:
        _prompt_escalation(shift=shift, user=user, created_rejections=created_rejections)
    return rejections, created_rejections


def _prompt_escalation(*, shift, user, created_rejections):
    rejected_slots = []
    for rejection in created_rejections:
        slot = getattr(rejection, "slot", None)
        if slot:
            rejected_slots.append({
                "date": slot.date.strftime("%d %B, %Y").lstrip("0"),
                "start_time": slot.start_time.strftime("%I:%M %p").lstrip("0"),
                "end_time": slot.end_time.strftime("%I:%M %p").lstrip("0"),
                "time_range": (
                    f"{slot.start_time.strftime('%I:%M %p').lstrip('0')} - "
                    f"{slot.end_time.strftime('%I:%M %p').lstrip('0')}"
                ),
            })
    ctx = build_shift_email_context(
        shift,
        user=shift.created_by,
        role=shift.created_by.role.lower(),
        extra={
            "rejector_name": user.get_full_name() or user.email,
            "rejected_slots": rejected_slots,
        }
    )
    ctx["escalation_message"] = (
        f"{user.get_full_name() or user.email} has declined "
        f"{len(created_rejections)} slot(s) on this shift."
        "\n\nIf you need to reach a wider audience, you can escalate the shift to the platform with a single click—"
        "making it visible to the entire ChemistTasker community. This can help you find the right fit, faster."
    )

    notification_payload = {
        "title": f"Shift declined: {shift.pharmacy.name}",
        "body": f"{user.get_full_name() or user.email} declined {len(created_rejections)} slot(s).",
        "user_ids": [shift.created_by_id],
        "payload": {
            "shift_id": shift.id,
            "rejection_ids": [rejection.id for rejection in created_rejections],
            "slot_ids": [rejection.slot_id for rejection in created_rejections if rejection.slot_id],
        },
    }
    if ctx.get("shift_link"):
        notification_payload["action_url"] = ctx["shift_link"]

    async_task(
        'users.tasks.send_async_email',
        subject=f"Shift Update: {user.get_full_name() or user.email} has declined your shift",
        recipient_list=[shift.created_by.email],
        template_name="emails/shift_rejected.html",
        context=ctx,
        text_template="emails/shift_rejected.txt",
        notification=notification_payload
    )
