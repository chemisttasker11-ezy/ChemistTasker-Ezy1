"""A pharmacy an organisation onboarded by email becomes owned by its contact once they complete owner onboarding.

Email onboarding (organizations.claims) creates an ownerless pharmacy whose email is the contact's address and gives
the contact a pharmacy MANAGER assignment on a PHARMACY_MANAGER account. If that person later chooses the OWNER
account type and submits owner onboarding, they become the pharmacy's real owner: the pharmacy points at their owner
profile and their assignment becomes the OWNER level (reserved for the owner). The pharmacy stays in its organisation.
"""
from django.db import transaction

from organizations.models import Pharmacy, PharmacyAdmin


def adopt_onboarded_pharmacies(owner_onboarding):
    """Link every ownerless, org-onboarded pharmacy this person administers to their owner profile. Returns them."""
    user = owner_onboarding.user
    if not user or not user.email:
        return []
    candidate_ids = list(
        Pharmacy.objects.filter(
            owner__isnull=True,
            organization__isnull=False,
            email__iexact=user.email,
            admin_assignments__user=user,
            admin_assignments__is_active=True,
        )
        .values_list("id", flat=True)
        .distinct()
    )
    adopted = []
    with transaction.atomic():
        for pharmacy in Pharmacy.objects.select_for_update().filter(id__in=candidate_ids, owner__isnull=True):
            pharmacy.owner = owner_onboarding
            pharmacy.save(update_fields=["owner"])
            PharmacyAdmin.objects.filter(user=user, pharmacy=pharmacy, is_active=True).update(
                admin_level=PharmacyAdmin.AdminLevel.OWNER
            )
            adopted.append(pharmacy)
    return adopted
