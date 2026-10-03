"""Query helpers of the hub: the staff members of a community group."""
from django.db.models import Q, Prefetch
from memberships.models import PHARMACY_STAFF_EMPLOYMENT_TYPES
from pharmacy_hub.models import PharmacyCommunityGroupMembership


STAFF_GROUP_MEMBER_FILTER = Q(
    memberships__membership__is_active=True,
    memberships__membership__employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
)


def staff_group_members_prefetch():
    return Prefetch(
        "memberships",
        queryset=(
            PharmacyCommunityGroupMembership.objects.filter(
                membership__is_active=True,
                membership__employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
            ).select_related("membership", "membership__user", "membership__pharmacy")
        ),
        to_attr="staff_memberships",
    )
