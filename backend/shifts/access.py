"""Request and role helpers of the shift domain: which shift roles a worker may see and take, request metadata.

`client_profile.domains.common.access` and `shifts.base` re-export them at their historical paths.
"""
from rest_framework import permissions, status
from rest_framework.exceptions import APIException

from onboarding.models import OtherStaffOnboarding
from onboarding.qualifications import has_claimed_dispensing_competency


class Http400(APIException):
    status_code = status.HTTP_400_BAD_REQUEST
    default_detail = 'Bad Request.'
    default_code = 'bad_request'


class ShiftActionRefused(APIException):
    """A shift service refusing an action. The response body is `{"detail": detail}` (or `detail` itself when it is
    a dict), with the given status, exactly as the views used to build it by hand."""

    def __init__(self, detail, status_code=status.HTTP_400_BAD_REQUEST):
        super().__init__(detail)
        self.status_code = status_code


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


def staff_membership_can_claim_role(membership, role_needed):
    """Instant staffing relies on the pharmacy-accepted employment role, not a new skill claim."""
    role = _normalized_role_code(getattr(membership, 'role', None))
    vacancy = _normalized_role_code(role_needed)
    if vacancy == 'ASSISTANT':
        return role in {'ASSISTANT', 'TECHNICIAN', 'INTERN', 'STUDENT'}
    if vacancy == 'TECHNICIAN':
        return role in {'TECHNICIAN', 'INTERN', 'STUDENT'}
    return role == vacancy


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
        profile = OtherStaffOnboarding.objects.filter(user=user).first()
        staff_role = _normalized_role_code(getattr(profile, 'role_type', None))
        # Pharmacy-assistant work is the broad Other Staff entry point and is
        # visible to every Other Staff subtype. Intern and student vacancies stay
        # role-specific; technician vacancies also accept interns/students and
        # assistants with a dispensing claim, subject to assignment safeguards.
        if staff_role == "INTERN":
            return ["ASSISTANT", "INTERN", "TECHNICIAN"]
        if staff_role == "TECHNICIAN":
            return ["ASSISTANT", "TECHNICIAN"]
        if staff_role == "STUDENT":
            return ["ASSISTANT", "STUDENT", "TECHNICIAN"]
        if staff_role == "ASSISTANT" and has_claimed_dispensing_competency(profile):
            return ["ASSISTANT", "TECHNICIAN"]
        return ["ASSISTANT"]
    return ["PHARMACIST", "TECHNICIAN", "ASSISTANT", "EXPLORER", "INTERN", "STUDENT"]


def _user_can_perform_shift_role(user, shift_role):
    role = _normalized_role_code(shift_role)
    if role == "PHARMACIST" and _normalized_role_code(getattr(user, "role", None)) == "OWNER":
        from onboarding.models import OwnerOnboarding
        # Pharmacy managers (including AHPRA-suspended owners) still see their shifts but can't work as pharmacists.
        if OwnerOnboarding.objects.filter(user=user, role="MANAGER").exists():
            return False
    return role in _shift_roles_visible_to_user(user)
