"""Request and role helpers of the shift domain: which shift roles a worker may see and take, request metadata.

`client_profile.domains.common.access` and `shifts.base` re-export them at their historical paths.
"""
from rest_framework import permissions, status
from rest_framework.exceptions import APIException

from onboarding.models import OtherStaffOnboarding


class Http400(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'Bad Request.'
    default_code = 'bad_request'


def _normalized_role_code(value):
    raw = str(value or "").strip().upper().replace("-", "_").replace(" ", "_")
    if raw in {"PHARMACY_ASSISTANT", "ASSISTANT"}:
        return "ASSISTANT"
    if raw in {"DISPENSARY_TECHNICIAN", "TECHNICIAN"}:
        return "TECHNICIAN"
    if raw in {"INTERN_PHARMACIST", "INTERN"}:
        return "INTERN"
    if raw in {"PHARMACY_STUDENT", "STUDENT"}:
        return "STUDENT"
    if raw in {"PHARMACIST", "EXPLORER"}:
        return raw
    return raw


def _otherstaff_onboarding_role(user):
    onboarding = OtherStaffOnboarding.objects.filter(user=user).first()
    return _normalized_role_code(getattr(onboarding, "role_type", None))


def _get_request_ip(request):
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


# --- Mixin to enforce pharmacist or other_staff only ---
class IsPharmacistOrOtherStaff(permissions.BasePermission):
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in ('PHARMACIST', 'OTHER_STAFF')
        )


NON_INTERN_OTHER_STAFF_SHIFT_ROLES = ("ASSISTANT", "TECHNICIAN", "STUDENT")


ALL_OTHER_STAFF_SHIFT_ROLES = NON_INTERN_OTHER_STAFF_SHIFT_ROLES + ("INTERN",)


def _shift_roles_visible_to_user(user):
    top_role = _normalized_role_code(getattr(user, "role", None))
    if top_role == "PHARMACIST":
        return ["PHARMACIST"]
    if top_role == "EXPLORER":
        return ["EXPLORER"]
    if top_role == "OTHER_STAFF":
        staff_role = _otherstaff_onboarding_role(user)
        if staff_role == "INTERN":
            return ["INTERN"]
        if staff_role in ALL_OTHER_STAFF_SHIFT_ROLES:
            return list(NON_INTERN_OTHER_STAFF_SHIFT_ROLES)
        return list(NON_INTERN_OTHER_STAFF_SHIFT_ROLES)
    return ["PHARMACIST", "TECHNICIAN", "ASSISTANT", "EXPLORER", "INTERN", "STUDENT"]


def _user_can_perform_shift_role(user, shift_role):
    return _normalized_role_code(shift_role) in _shift_roles_visible_to_user(user)
