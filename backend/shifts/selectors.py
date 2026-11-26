"""Query building blocks of the shift lists: which shifts a user manages, and which slots are open, confirmed or past.

The list views compose these instead of repeating the filters.
"""
from datetime import timedelta
from zoneinfo import ZoneInfo

from django.db.models import Exists, F, OuterRef, Q

from memberships.models import FAVORITE_STAFF_EMPLOYMENT_TYPES, Membership, PHARMACY_STAFF_EMPLOYMENT_TYPES
from organizations.access import managed_pharmacies
from organizations.models import Chain, Pharmacy
from organizations.timezone import get_pharmacy_timezone
from shifts.escalation import COMMUNITY_LEVELS, PUBLIC_LEVEL
from shifts.models import ShiftOffer, ShiftSlot, ShiftSlotAssignment


def shifts_managed_by(queryset, user):
    """The shifts the user created or whose pharmacy they manage."""
    return queryset.filter(Q(created_by=user) | Q(pharmacy__in=managed_pharmacies(user)))


def community_membership_q(user):
    """Member audiences accumulate as shifts widen, independently of notification settings."""
    memberships = Membership.objects.filter(user=user, is_active=True, status=Membership.Status.ACCEPTED)
    staff = memberships.filter(employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES)
    favourites = memberships.filter(employment_type__in=FAVORITE_STAFF_EMPLOYMENT_TYPES)
    named_public = Q(visibility=PUBLIC_LEVEL, post_anonymously=False)
    organisation_or_public = Q(visibility='ORG_CHAIN') | named_public
    # A shift can skip the owner-chain tier if its pharmacy has no active owner chain.
    has_owner_chain = Q(Exists(Chain.objects.filter(
        owner_id=OuterRef('pharmacy__owner_id'), pharmacies=OuterRef('pharmacy_id'), is_active=True,
    )))
    return (
        (Q(pharmacy_id__in=staff.values('pharmacy_id')) & (
            Q(visibility__in=COMMUNITY_LEVELS) | named_public
        ))
        | (Q(pharmacy_id__in=favourites.values('pharmacy_id')) & (
            Q(visibility__in=['LOCUM_CASUAL', 'OWNER_CHAIN', 'ORG_CHAIN']) | named_public
        ))
        | (Q(pharmacy__owner_id__in=staff.values('pharmacy__owner_id')) & (
            Q(visibility='OWNER_CHAIN') | (organisation_or_public & has_owner_chain)
        ))
        | (Q(pharmacy__organization_id__in=staff.values('pharmacy__organization_id')) & organisation_or_public)
    )


def slot_occurrence_ended(slot_date, start_time, end_time, local_date, clock):
    """True once the occurrence on slot_date has ended; one ending at or before its start ends the next day."""
    end_date = slot_date + timedelta(days=1) if end_time <= start_time else slot_date
    return (end_date, end_time) < (local_date, clock)


def slot_not_ended_q(local_date, clock, *, date='date', start='start_time', end='end_time'):
    """SQL form of `not slot_occurrence_ended` for the occurrence dated by the `date` field."""
    overnight = Q(**{f'{end}__lte': F(start)})
    return (
        Q(**{f'{date}__gt': local_date})
        | (Q(**{date: local_date}) & (Q(**{f'{end}__gte': clock}) | overnight))
        | (Q(**{date: local_date - timedelta(days=1), f'{end}__gte': clock}) & overnight)
    )


BOOKED_TIMEZONE = 'engagement_terms_snapshot__booking_site__timezone'


def assignment_not_ended_q(now, zone):
    local = now.astimezone(zone)
    times = {'start': 'slot__start_time', 'end': 'slot__end_time'}
    return slot_not_ended_q(local.date(), local.time(), date='slot_date', **times) | (
        Q(slot_date__isnull=True) & slot_not_ended_q(local.date(), local.time(), date='slot__date', **times)
    )


def snapshot_assignment_filters(now, assignments):
    """Return the saved-zone rows and the subset still upcoming in their booked zone."""
    saved = Q(**{f'{BOOKED_TIMEZONE}__isnull': False})
    upcoming = Q(pk__in=[])
    zones = assignments.filter(saved).order_by().values_list(BOOKED_TIMEZONE, flat=True).distinct()
    for zone in zones:
        upcoming |= Q(**{BOOKED_TIMEZONE: zone}) & assignment_not_ended_q(now, ZoneInfo(zone))
    return saved, upcoming


def _future_or_current_slot_q(now, today, prefix=''):
    result = Q(pk__in=[])
    pharmacy_ids_by_zone = {}
    for pharmacy in Pharmacy.objects.only('pk', 'timezone', 'state', 'postcode'):
        zone = get_pharmacy_timezone(pharmacy)
        pharmacy_ids_by_zone.setdefault(zone, []).append(pharmacy.pk)
    for zone, pharmacy_ids in pharmacy_ids_by_zone.items():
        local_now = now.astimezone(zone)
        local_date = local_now.date()
        clock = local_now.time()
        times = {'start': f'{prefix}start_time', 'end': f'{prefix}end_time'}
        result |= Q(**{f'{prefix}shift__pharmacy_id__in': pharmacy_ids}) & (
            (Q(**{f'{prefix}is_recurring': True})
             & slot_not_ended_q(local_date, clock, date=f'{prefix}recurring_end_date', **times)) |
            slot_not_ended_q(local_date, clock, date=f'{prefix}date', **times)
        )
    return result


def _past_slot_q(now, today):
    return ~_future_or_current_slot_q(now, today)


def _matching_shift_slot_exists(*, now, today, assigned_user_id=None, state='active'):
    slots = ShiftSlot.objects.filter(shift_id=OuterRef('pk'))
    slot_assignments = ShiftSlotAssignment.objects.filter(
        shift_id=OuterRef('shift_id'),
        slot_id=OuterRef('pk'),
    )
    if assigned_user_id is not None:
        slot_assignments = slot_assignments.filter(user_id=assigned_user_id)

    pending_payment = ShiftOffer.objects.filter(
        shift_id=OuterRef('shift_id'),
        slot_id=OuterRef('pk'),
        status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT,
    )

    slots = slots.annotate(
        has_assignment=Exists(slot_assignments),
        has_pending_payment=Exists(pending_payment),
    )

    if state == 'active':
        slots = slots.filter(_future_or_current_slot_q(now, today)).filter(
            Q(has_assignment=False) | Q(has_pending_payment=True)
        )
    elif state == 'confirmed':
        scope = ShiftSlotAssignment.objects.filter(
            Q(slot_date__gte=now.date() - timedelta(days=2))
            | Q(slot_date__isnull=True, slot__date__gte=now.date() - timedelta(days=2))
        )
        if assigned_user_id is not None:
            scope = scope.filter(user_id=assigned_user_id)
        saved_zone, upcoming = snapshot_assignment_filters(now, scope)
        slots = slots.filter(has_pending_payment=False).filter(
            Exists(slot_assignments.filter(upcoming))
            | (_future_or_current_slot_q(now, today) & Exists(slot_assignments.filter(~saved_zone)))
        )
    # elif state == 'history':
    #     slots = slots.filter(_past_slot_q(now, today)).filter(
    #         has_assignment=True,
    #         has_pending_payment=False,
    #     )

# this part will be removed later
    elif state == 'history':
        slots = slots.filter(
            has_assignment=True,
            has_pending_payment=False,
        )


    else:
        raise ValueError(f"Unsupported slot lifecycle state: {state}")

    return Exists(slots)


def _shift_has_past_slot_exists(*, now, today):
    slots = ShiftSlot.objects.filter(shift_id=OuterRef('pk')).filter(_past_slot_q(now, today))
    return Exists(slots)
