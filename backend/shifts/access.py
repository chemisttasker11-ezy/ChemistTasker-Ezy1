"""Request and role helpers used by the shift views. `client_profile.domains.common.access` re-exports them."""
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
