"""Organization reads consumed by identity projections and validation adapters."""
from dataclasses import dataclass
from typing import Callable

from django.core.exceptions import ImproperlyConfigured


@dataclass(frozen=True)
class OrganizationReads:
    all_organizations: Callable
    all_pharmacies: Callable
    organization_pharmacy_summaries: Callable
    pharmacies_in_organization: Callable
    owned_pharmacies: Callable
    admin_assignments_for: Callable
    visible_pharmacies_for_membership: Callable
    manager_dashboard_pharmacy_id: Callable


_reads: OrganizationReads | None = None


def configure_organization_reads(reads: OrganizationReads) -> None:
    global _reads
    _reads = reads


def organization_reads() -> OrganizationReads:
    if _reads is None:
        raise ImproperlyConfigured('Application startup must configure identity organization reads.')
    return _reads
