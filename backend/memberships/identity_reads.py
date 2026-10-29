"""Membership-owned selectors for identity/session and organization directory adapters."""
from memberships.models import Membership


def accepted_for_user(user):
    return Membership.objects.filter(
        user=user,
        is_active=True,
        status=Membership.Status.ACCEPTED,
    ).select_related('pharmacy')


def directory_memberships(organization_id, visible_pharmacy_ids):
    membership_qs = Membership.objects.filter(
        pharmacy__organization_id=organization_id,
        is_active=True,
    )
    if visible_pharmacy_ids is not None:
        membership_qs = membership_qs.filter(pharmacy_id__in=visible_pharmacy_ids)
    return list(
        membership_qs.select_related("user", "pharmacy").order_by("id")
    )
