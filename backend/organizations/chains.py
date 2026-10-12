"""Organization-owned chain membership used by pharmacy metadata and shift outreach."""
from organizations.models import Chain


def active_owner_chains_for_pharmacy(pharmacy):
    if not pharmacy or not pharmacy.owner_id:
        return Chain.objects.none()
    return Chain.objects.filter(owner_id=pharmacy.owner_id, pharmacies=pharmacy, is_active=True)
