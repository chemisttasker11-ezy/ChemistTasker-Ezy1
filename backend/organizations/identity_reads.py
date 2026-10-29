"""Organization-owned selectors for identity payloads and form validation."""
from organizations.access import admin_assignments_for  # canonical permission-filtered selector
from organizations.models import Organization, Pharmacy, PharmacyAdmin
from users.org_roles import membership_has_org_wide_scope


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


def visible_pharmacies_for_membership(membership):
    if not membership:
        return Pharmacy.objects.none()

    if membership_has_org_wide_scope(membership):
        return Pharmacy.objects.filter(organization=membership.organization)

    if membership.role == 'REGION_ADMIN':
        return membership.pharmacies.filter(organization_id=membership.organization_id)

    return Pharmacy.objects.none()


def manager_dashboard_pharmacy_id(user):
    """Navigation keeps its original active-assignment ordering, independent of action authority."""
    return (
        PharmacyAdmin.objects.filter(user=user, is_active=True)
        .order_by("id")
        .values_list("pharmacy_id", flat=True)
        .first()
    )
