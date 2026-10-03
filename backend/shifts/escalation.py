"""Shift visibility escalation: which tiers a pharmacy can escalate through, and moving a shift up those tiers.

FULL_PART_TIME -> LOCUM_CASUAL -> [OWNER_CHAIN if the pharmacy is in one of its owner's chains] ->
[ORG_CHAIN if the pharmacy belongs to an organization] -> PLATFORM. A shift escalates manually (owner action, roster)
or automatically when an escalate_to_* timestamp is due and nobody has expressed interest yet.
"""
import uuid

from django.db.models import Q
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from organizations.models import Chain
from shifts.access import ShiftActionRefused
from shifts.limits import enforce_public_shift_daily_limit
from shifts.models import Shift

COMMUNITY_LEVELS = ['FULL_PART_TIME', 'LOCUM_CASUAL', 'OWNER_CHAIN', 'ORG_CHAIN']

PUBLIC_LEVEL = 'PLATFORM'

ESCALATION_FIELD_MAP = {
    'LOCUM_CASUAL': 'escalate_to_locum_casual',
    'OWNER_CHAIN': 'escalate_to_owner_chain',
    'ORG_CHAIN': 'escalate_to_org_chain',
    'PLATFORM': 'escalate_to_platform',
}


def allowed_tiers(pharmacy):
    """
    Determine which escalation tiers are available for this pharmacy.
    Chain escalation is only available when the pharmacy belongs to at least
    one of the owner's chains. Organization escalation requires the pharmacy
    to be claimed by an organization.
    """
    tiers = ['FULL_PART_TIME', 'LOCUM_CASUAL']

    owner = getattr(pharmacy, 'owner', None)
    if owner and Chain.objects.filter(owner=owner, pharmacies=pharmacy).exists():
        tiers.append('OWNER_CHAIN')

    if pharmacy.organization_id:
        tiers.append('ORG_CHAIN')

    tiers.append('PLATFORM')
    return tiers


def resolve_current_index(shift, allowed_tiers):
    try:
        return allowed_tiers.index(shift.visibility)
    except ValueError:
        idx = shift.escalation_level or 0
        if idx < 0:
            idx = 0
        if idx >= len(allowed_tiers):
            idx = len(allowed_tiers) - 1
        return idx


def apply_escalation(shift, allowed_tiers, target_index, *, stamp_missing=True, timestamp=None):
    target_visibility = allowed_tiers[target_index]
    update_fields = ['visibility', 'escalation_level']
    shift.visibility = target_visibility
    shift.escalation_level = target_index

    if stamp_missing:
        stamp_time = timestamp or timezone.now()
        for idx in range(1, target_index + 1):
            tier = allowed_tiers[idx]
            field = ESCALATION_FIELD_MAP.get(tier)
            if field and not getattr(shift, field):
                setattr(shift, field, stamp_time)
                update_fields.append(field)

    # Remove duplicates while preserving order
    shift.save(update_fields=list(dict.fromkeys(update_fields)))
    return target_visibility


def auto_escalate_due_shifts(now, tiers_for=allowed_tiers):
    """Escalate every shift whose next escalate_to_* time is due and that has no interest yet. A PLATFORM step is
    skipped while the pharmacy is at its daily public-shift limit."""
    date_filter = Q()
    for field in ESCALATION_FIELD_MAP.values():
        date_filter |= Q(**{f'{field}__lte': now})

    if not date_filter:
        return

    candidates = Shift.objects.filter(
        interests__isnull=True
    ).filter(date_filter).select_related('pharmacy', 'pharmacy__owner', 'created_by')

    for shift in candidates:
        tiers = tiers_for(shift.pharmacy)
        if not tiers:
            continue

        current_index = resolve_current_index(shift, tiers)
        target_index = current_index

        for idx in range(current_index + 1, len(tiers)):
            tier = tiers[idx]
            field = ESCALATION_FIELD_MAP.get(tier)
            if not field:
                continue
            ts = getattr(shift, field)
            if ts and ts <= now:
                target_index = idx

        if target_index > current_index:
            target_visibility = tiers[target_index]
            if target_visibility == PUBLIC_LEVEL:
                try:
                    enforce_public_shift_daily_limit(shift.pharmacy)
                except ValidationError:
                    continue
            apply_escalation(shift, tiers, target_index, stamp_missing=False)


def escalate_shift(shift, *, allowed_tiers, target_visibility=None):
    """A manager widening a shift's visibility: to `target_visibility`, or one tier up. Going public counts against
    the pharmacy's daily public-shift limit. Returns the new visibility."""
    current_index = resolve_current_index(shift, allowed_tiers)

    if target_visibility:
        if target_visibility not in allowed_tiers:
            raise ShiftActionRefused(f"Invalid target_visibility. Must be one of {allowed_tiers}.")
        target_index = allowed_tiers.index(target_visibility)
    else:
        target_index = current_index + 1

    if target_index <= current_index:
        raise ShiftActionRefused('Shift is already at or above that visibility level.')
    if target_index >= len(allowed_tiers):
        raise ShiftActionRefused('Already at the highest escalation level.')

    next_visibility = allowed_tiers[target_index]
    if next_visibility == PUBLIC_LEVEL:
        enforce_public_shift_daily_limit(shift.pharmacy)

    return apply_escalation(shift, allowed_tiers, target_index)


def issue_share_token(shift):
    """A fresh public share token for a platform-visible shift (the previous link stops working)."""
    # Only platform-visible shifts can be shared.
    if shift.visibility != 'PLATFORM':
        raise ShiftActionRefused('You must escalate this shift to platform level before it can be shared.')

    shift.share_token = uuid.uuid4()
    shift.save(update_fields=['share_token'])
    return shift.share_token
