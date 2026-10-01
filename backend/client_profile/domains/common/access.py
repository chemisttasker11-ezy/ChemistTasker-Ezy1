"""Permission classes and helpers shared by the client_profile views."""
from rest_framework import permissions, status
from client_profile.models import Membership, OtherStaffOnboarding, Pharmacy
from rest_framework.exceptions import APIException
from users.org_roles import membership_capabilities, membership_visible_pharmacy_ids, OrgCapability


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


MAX_ACTIVE_PHARMACY_MEMBERSHIPS = 3


def _get_request_ip(request):
    forwarded_for = request.META.get("HTTP_X_FORWARDED_FOR")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return request.META.get("REMOTE_ADDR")


def _count_active_memberships(user, exclude_membership_id=None):
    if not user:
        return 0
    qs = Membership.objects.filter(
        user=user,
        is_active=True,
        status=Membership.Status.ACCEPTED,
    )
    if exclude_membership_id:
        qs = qs.exclude(pk=exclude_membership_id)
    return qs.count()


def _collect_org_access_scope(user):
    """
    Determine which organisations the user can fully access and which pharmacies they are scoped to.
    Returns a tuple of (full_access_org_ids, scoped_pharmacies_by_org).
    """
    if not user or not getattr(user, "is_authenticated", False):
        return set(), {}

    memberships = user.organization_memberships.select_related('organization').prefetch_related('pharmacies')
    full_access_org_ids = set()
    scoped_by_org = {}

    for membership in memberships:
        caps = membership_capabilities(membership)
        if OrgCapability.VIEW_ALL_PHARMACIES in caps:
            full_access_org_ids.add(membership.organization_id)
            continue

        visible_ids = membership_visible_pharmacy_ids(membership)
        if visible_ids:
            scoped = scoped_by_org.setdefault(membership.organization_id, set())
            scoped.update(visible_ids)

    return full_access_org_ids, scoped_by_org


def _get_org_pharmacies_queryset(user):
    full_access_org_ids, scoped_by_org = _collect_org_access_scope(user)
    qs = Pharmacy.objects.none()

    if full_access_org_ids:
        qs = qs | Pharmacy.objects.filter(organization_id__in=full_access_org_ids)

    scoped_ids = set()
    for ids in scoped_by_org.values():
        scoped_ids.update(ids)
    if scoped_ids:
        qs = qs | Pharmacy.objects.filter(id__in=scoped_ids)

    return qs.distinct()


# --- Mixin to enforce pharmacist or other_staff only ---
class IsPharmacistOrOtherStaff(permissions.BasePermission):
    def has_permission(self, request, view):
        return (
            request.user and
            request.user.is_authenticated and
            request.user.role in ('PHARMACIST', 'OTHER_STAFF')
        )
