"""Bind organization selectors at application startup for workers, commands and HTTP."""
from organizations import identity_reads
from users.organization_port import OrganizationReads, configure_organization_reads


def configure_identity_organization_reads():
    configure_organization_reads(OrganizationReads(
        all_organizations=identity_reads.all_organizations,
        all_pharmacies=identity_reads.all_pharmacies,
        organization_pharmacy_summaries=identity_reads.organization_pharmacy_summaries,
        pharmacies_in_organization=identity_reads.pharmacies_in_organization,
        owned_pharmacies=identity_reads.owned_pharmacies,
        admin_assignments_for=identity_reads.admin_assignments_for,
        visible_pharmacies_for_membership=identity_reads.visible_pharmacies_for_membership,
        manager_dashboard_pharmacy_id=identity_reads.manager_dashboard_pharmacy_id,
    ))
