"""Roster-management authority: who may manage the roster, attendance approvals and worker shift requests of a pharmacy."""
from client_profile.models import Pharmacy


def is_authorized_attendance_manager(user, pharmacy: Pharmacy) -> bool:
    """Validate roster-management authority for this destination pharmacy."""
    # Keep attendance, roster and workforce route authorization on one capability
    # contract, including scoped organisation memberships.
    from workforce.permissions import can_manage_roster_pharmacy
    return bool(can_manage_roster_pharmacy(user, pharmacy))
