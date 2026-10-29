"""Membership-owned account conversion; actor validation stays in identity HTTP adapters."""
from django.db import transaction
from rest_framework.exceptions import ValidationError

from memberships.models import Membership
from organizations.models import PharmacyAdmin
from users.models import User


def convert_manager_account(actor_user, role, staff_role, requested_pharmacy_id, update_staff_profile):
    with transaction.atomic():
        user = User.objects.select_for_update().get(pk=actor_user.pk)
        if user.role != "PHARMACY_MANAGER":
            raise ValidationError({"role": "Your account type is already set."})

        candidates = (
            Membership.objects.select_for_update()
            .select_related("admin_assignment")
            .filter(
                user=user,
                role="CONTACT",
                is_active=True,
                status=Membership.Status.ACCEPTED,
                pharmacy__organization__isnull=False,
                admin_assignment__is_active=True,
                admin_assignment__admin_level=PharmacyAdmin.AdminLevel.MANAGER,
            )
            .order_by("pk")
        )
        if requested_pharmacy_id is not None:
            membership = candidates.filter(pharmacy_id=requested_pharmacy_id).first()
        else:
            matches = list(candidates[:2])
            membership = matches[0] if len(matches) == 1 else None

        if membership is None:
            raise ValidationError({
                "pharmacy_id": (
                    "Choose the organisation pharmacy whose admin-only CONTACT membership "
                    "should become your personal workforce membership."
                )
            })

        assignment = membership.admin_assignment
        user.role = role
        user.save(update_fields=["role"])

        membership.role = staff_role
        membership.save(update_fields=["role", "updated_at"])
        assignment.staff_role = staff_role
        assignment.save(update_fields=["staff_role", "updated_at"])

        if role == "OTHER_STAFF":
            update_staff_profile(user)
    return user, membership
