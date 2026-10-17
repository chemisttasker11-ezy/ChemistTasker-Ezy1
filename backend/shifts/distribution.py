"""Keep roster publication, internal-community discovery and marketplace escalation distinct.

This is a read-only domain-boundary check, NOT another booking state machine.
Workforce retains authority to publish/unpublish a roster and to release an
assigned worker. A manager-approved release can hand the SAME Shift/ShiftSlot
to shift-marketplace discovery, without duplicating it or changing its origin.
"""
from shifts.models import ShiftSlotAssignment


INTERNAL_COMMUNITY_TIERS = frozenset({"FULL_PART_TIME", "LOCUM_CASUAL"})
NETWORK_TIERS = frozenset({"OWNER_CHAIN", "ORG_CHAIN"})
PUBLIC_TIER = "PLATFORM"


def is_roster_owned_for_marketplace(shift):
    """True while roster publication/worker actions own the shift's release.

    A roster container *continues* to have is_roster_container=True after
    explicit release; do not permanently blacklist such released vacancies.
    The committed manager-release audit distinguishes that handoff.
    """
    if not shift.pk:
        return bool(getattr(shift, "is_roster_container", False))
    if shift.slots.filter(roster_period__isnull=False).exists():
        return True
    if ShiftSlotAssignment.objects.filter(shift_id=shift.pk, is_rostered=True).exists():
        return True
    if not shift.is_roster_container:
        return False

    from workforce.models import RosterActionAudit
    return not RosterActionAudit.objects.filter(
        pharmacy_id=shift.pharmacy_id,
        action_type=RosterActionAudit.ActionType.WORKER_RELEASED,
        details__shift_id=shift.pk,
    ).exists()


def marketplace_escalation_block_reason(shift):
    """Refuse public/chain widening for un-released roster or direct booking."""
    if getattr(shift, "dedicated_user_id", None):
        return "Dedicated bookings cannot widen their audience."
    if is_roster_owned_for_marketplace(shift):
        return "This is a roster-owned shift. Use the authorised roster release workflow before marketplace escalation."
    return None


def shift_distribution(shift):
    """Information-only classification for the journey audit; not a new model."""
    if is_roster_owned_for_marketplace(shift):
        return "ROSTER"
    if getattr(shift, "dedicated_user_id", None):
        return "DEDICATED"
    if shift.visibility in INTERNAL_COMMUNITY_TIERS:
        return "INTERNAL_COMMUNITY"
    if shift.visibility in NETWORK_TIERS:
        return "OWNER_OR_ORGANISATION_NETWORK"
    if shift.visibility == PUBLIC_TIER:
        return "PUBLIC"
    return "UNSUPPORTED"
