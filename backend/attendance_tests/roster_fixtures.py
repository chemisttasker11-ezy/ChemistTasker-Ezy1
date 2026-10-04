"""Shared data builders of the isolated roster tests."""
from datetime import datetime, time, timedelta

from organizations.timezone import get_pharmacy_timezone


def approved_workforce_leave(*, user, pharmacy, day, leave_type="ANNUAL"):
    """Approved whole-day leave in the pharmacy's local time.

    WorkforceLeaveRequest is the leave record the roster validation and worker actions check (the legacy
    client_profile LeaveRequest rows were consolidated into it by workforce.0005)."""
    from workforce.models import WorkforceLeaveRequest

    start = datetime.combine(day, time.min, tzinfo=get_pharmacy_timezone(pharmacy))
    return WorkforceLeaveRequest.objects.create(
        user=user,
        pharmacy=pharmacy,
        leave_type=leave_type,
        status=WorkforceLeaveRequest.Status.APPROVED,
        start_at=start,
        end_at=start + timedelta(days=1),
    )
