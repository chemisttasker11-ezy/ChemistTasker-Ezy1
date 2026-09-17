from django.core.exceptions import PermissionDenied


def can_manage_pharmacy(user, pharmacy) -> bool:
    from client_profile.attendance_approvals import is_authorized_attendance_manager
    return bool(is_authorized_attendance_manager(user, pharmacy))


def require_manage_pharmacy(user, pharmacy):
    if not can_manage_pharmacy(user, pharmacy):
        raise PermissionDenied("You are not authorized to manage workforce records for this pharmacy.")


def can_view_worker_timesheet(user, timesheet) -> bool:
    if user and user.is_authenticated and user.pk == timesheet.user_id:
        return True
    return can_manage_pharmacy(user, timesheet.period.pharmacy)
