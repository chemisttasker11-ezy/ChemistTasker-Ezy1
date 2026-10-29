"""Organization-owned selectors for identity payloads and form validation."""
from organizations.access import admin_assignments_for  # canonical permission-filtered selector
from organizations.models import Organization, Pharmacy


def all_organizations():
    return Organization.objects.all()


def all_pharmacies():
    return Pharmacy.objects.all()


def organization_pharmacy_summaries(org_admin_ids):
    return Pharmacy.objects.filter(organization_id__in=org_admin_ids).values('id', 'name', 'organization_id')


def pharmacies_in_organization(unique_ids, org_id):
    return Pharmacy.objects.filter(id__in=unique_ids, organization_id=org_id)


def owned_pharmacies(user):
    return Pharmacy.objects.filter(owner__user=user)
