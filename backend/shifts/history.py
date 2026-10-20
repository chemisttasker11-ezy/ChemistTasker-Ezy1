"""Preserve assignment history when removing bookings or editing rosters."""
from django.core.exceptions import ValidationError

from shifts.models import LeaveRequest


def _protect_assignment_history(assignment):
    from attendance.models import AttendanceSession, ProvisionalAttendance
    from invoicing.models import InvoiceLineItem
    from workforce.models import WorkforceLeaveRequest
    if (InvoiceLineItem.objects.filter(source_assignment=assignment).exists()
            or WorkforceLeaveRequest.objects.filter(slot_assignment=assignment).exists()):
        raise ValidationError("Cannot change an assignment linked to invoice or workforce leave history.")
    if (LeaveRequest.objects.filter(slot_assignment=assignment).exists()
            or AttendanceSession.objects.filter(assignment=assignment).exists()
            or ProvisionalAttendance.objects.filter(backfill_assignment=assignment).exists()):
        raise ValidationError("Cannot remove an assignment with leave or attendance history.")
