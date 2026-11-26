"""A pharmacy changing or removing one of its memberships: row locks, the invitation and cap rules, and what removal does
to confirmed work."""
from django.db import transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import PermissionDenied, ValidationError

from memberships.access import user_can_change_membership
from memberships.employment_port import employment_services
from memberships.models import Membership
from memberships.serializers import MAX_ACTIVE_PHARMACY_MEMBERSHIPS, _count_active_memberships
from users.models import User

CHANGE_DENIED = "Not allowed to modify this membership."


class ConfirmedBookingsNeedDecision(Exception):
    """The member still has confirmed future work and the caller has not said to keep it."""

    def __init__(self, bookings):
        super().__init__(bookings)
        self.bookings = bookings


def lock_membership_for_change(membership, changes):
    """Lock user then membership (the worker self-acceptance order) and re-check activation on the locked row.

    DRF validates before this runs, so the serializer's own cap check can race across two pharmacies.
    Call inside the transaction that saves `changes`.
    """
    User.objects.select_for_update().only("pk").get(pk=membership.user_id)
    locked = Membership.objects.select_for_update().get(pk=membership.pk)

    will_be_active = changes.get("is_active", locked.is_active)
    if will_be_active and locked.direct_invited_at and locked.status == Membership.Status.PENDING:
        raise ValidationError({"is_active": "The worker needs to join from their invitation first."})
    if will_be_active and not locked.is_active:
        active_count = _count_active_memberships(
            locked.user,
            exclude_membership_id=locked.pk,
        )
        if active_count >= MAX_ACTIVE_PHARMACY_MEMBERSHIPS:
            raise ValidationError({
                "is_active": f"User already belongs to {MAX_ACTIVE_PHARMACY_MEMBERSHIPS} pharmacies."
            })
    return locked


@transaction.atomic
def remove_member(membership, *, removed_by, keep_confirmed_bookings):
    """Withdraw a pending invitation, or remove a member once their confirmed future work has been decided."""
    User.objects.select_for_update().only("pk").get(pk=membership.user_id)
    locked = get_object_or_404(Membership.objects.select_for_update(), pk=membership.pk)
    if not user_can_change_membership(removed_by, locked):
        raise PermissionDenied(CHANGE_DENIED)
    if locked.status == Membership.Status.PENDING:
        locked.status = Membership.Status.REJECTED
        locked.is_active = False
        locked.responded_at = timezone.now()
        locked.save(update_fields=["status", "is_active", "responded_at", "updated_at"])
        locked.revoke_admin_access()
        return
    if not keep_confirmed_bookings and locked.pharmacy_id:
        bookings = employment_services().future_confirmed_bookings(locked.pharmacy, user_id=locked.user_id)
        if bookings:
            raise ConfirmedBookingsNeedDecision(bookings)
    locked.remove()
