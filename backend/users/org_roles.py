"""
Centralised definitions for organisation-level roles and their capabilities.

This module exposes both machine-friendly structures (for views/serialisers)
and human-readable documentation so product and engineering stay aligned.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Mapping, MutableMapping, Sequence

from access_control.pharmacy_roles import PharmacyAdminPolicy


class OrgCapability:
    MANAGE_ADMINS = "manage_admins"
    MANAGE_STAFF = "manage_staff"
    MANAGE_ROSTER = "manage_roster"
    MANAGE_COMMS = "manage_communications"
    INVITE_STAFF = "invite_staff"
    CLAIM_PHARMACY = "claim_pharmacy"
    VIEW_ALL_PHARMACIES = "view_all_pharmacies"
    ASSIGN_PHARMACIES = "assign_pharmacies"


PHARMACY_ADMIN_CAPABILITIES = {
    OrgCapability.MANAGE_ADMINS: PharmacyAdminPolicy.CAPABILITY_MANAGE_ADMINS,
    OrgCapability.MANAGE_STAFF: PharmacyAdminPolicy.CAPABILITY_MANAGE_STAFF,
    OrgCapability.MANAGE_ROSTER: PharmacyAdminPolicy.CAPABILITY_MANAGE_ROSTER,
    OrgCapability.MANAGE_COMMS: PharmacyAdminPolicy.CAPABILITY_MANAGE_COMMS,
}


@dataclass(frozen=True)
class AdminLevelDefinition:
    key: str
    label: str
    description: str
    pharmacy_capabilities: Sequence[str]


ADMIN_LEVEL_DEFINITIONS: Mapping[str, AdminLevelDefinition] = {
    PharmacyAdminPolicy.AdminLevel.MANAGER: AdminLevelDefinition(
        key=PharmacyAdminPolicy.AdminLevel.MANAGER,
        label="Manager",
        description=(
            "Full pharmacy manager: can invite and manage members/admins, control roster,"
            " approve shifts, and communicate in organisation hubs."
        ),
        pharmacy_capabilities=(
            OrgCapability.MANAGE_ADMINS,
            OrgCapability.MANAGE_STAFF,
            OrgCapability.MANAGE_ROSTER,
            OrgCapability.MANAGE_COMMS,
        ),
    ),
    PharmacyAdminPolicy.AdminLevel.ROSTER_MANAGER: AdminLevelDefinition(
        key=PharmacyAdminPolicy.AdminLevel.ROSTER_MANAGER,
        label="Roster Manager",
        description=(
            "Roster-focused manager: can post/accept shifts and participate in communications."
        ),
        pharmacy_capabilities=(
            OrgCapability.MANAGE_ROSTER,
            OrgCapability.MANAGE_COMMS,
        ),
    ),
    PharmacyAdminPolicy.AdminLevel.COMMUNICATION_MANAGER: AdminLevelDefinition(
        key=PharmacyAdminPolicy.AdminLevel.COMMUNICATION_MANAGER,
        label="Communication Manager",
        description=(
            "Communication-only admin: can access chats, announcements, and organisation hub tools."
        ),
        pharmacy_capabilities=(OrgCapability.MANAGE_COMMS,),
    ),
}


@dataclass(frozen=True)
class OrgRoleDefinition:
    key: str
    label: str
    description: str
    default_admin_level: str
    allowed_admin_levels: Sequence[str]
    organisation_capabilities: Sequence[str]
    requires_job_title: bool = False
    requires_region: bool = False
    requires_pharmacies: bool = False

    def consolidated_capabilities(self, admin_level: str | None = None) -> set[str]:
        """
        Return the union of organisation-level capabilities and the pharmacy capabilities
        granted by the supplied admin level (or the default level if omitted).
        """
        level_key = admin_level or self.default_admin_level
        level_def = ADMIN_LEVEL_DEFINITIONS.get(level_key)
        pharmacy_caps = level_def.pharmacy_capabilities if level_def else ()
        return set(self.organisation_capabilities) | set(pharmacy_caps)


ROLE_DEFINITIONS: Mapping[str, OrgRoleDefinition] = {
    "ORG_ADMIN": OrgRoleDefinition(
        key="ORG_ADMIN",
        label="Organisation Admin",
        description=(
            "Primary organisation owner. Full control to claim/create pharmacies, invite staff,"
            " assign admins, and manage every pharmacy tied to the organisation."
        ),
        default_admin_level=PharmacyAdminPolicy.AdminLevel.MANAGER,
        allowed_admin_levels=(
            PharmacyAdminPolicy.AdminLevel.MANAGER,
            PharmacyAdminPolicy.AdminLevel.ROSTER_MANAGER,
            PharmacyAdminPolicy.AdminLevel.COMMUNICATION_MANAGER,
        ),
        organisation_capabilities=(
            OrgCapability.MANAGE_ADMINS,
            OrgCapability.MANAGE_STAFF,
            OrgCapability.MANAGE_ROSTER,
            OrgCapability.MANAGE_COMMS,
            OrgCapability.INVITE_STAFF,
            OrgCapability.CLAIM_PHARMACY,
            OrgCapability.VIEW_ALL_PHARMACIES,
        ),
        requires_job_title=False,
        requires_region=False,
        requires_pharmacies=False,
    ),
    "CHIEF_ADMIN": OrgRoleDefinition(
        key="CHIEF_ADMIN",
        label="Chief Admin",
        description=(
            "Organisation-wide administrator. Same capabilities as an organisation admin across every"
            " pharmacy tied to the organisation, but cannot create or change organisation admins."
        ),
        default_admin_level=PharmacyAdminPolicy.AdminLevel.MANAGER,
        allowed_admin_levels=(
            PharmacyAdminPolicy.AdminLevel.MANAGER,
            PharmacyAdminPolicy.AdminLevel.ROSTER_MANAGER,
            PharmacyAdminPolicy.AdminLevel.COMMUNICATION_MANAGER,
        ),
        organisation_capabilities=(
            OrgCapability.MANAGE_ADMINS,
            OrgCapability.MANAGE_STAFF,
            OrgCapability.MANAGE_ROSTER,
            OrgCapability.MANAGE_COMMS,
            OrgCapability.INVITE_STAFF,
            OrgCapability.CLAIM_PHARMACY,
            OrgCapability.VIEW_ALL_PHARMACIES,
        ),
        requires_job_title=True,
        requires_region=False,
        requires_pharmacies=False,
    ),
    "REGION_ADMIN": OrgRoleDefinition(
        key="REGION_ADMIN",
        label="Region Admin",
        description=(
            "Scoped administrator responsible for a region-specific subset of pharmacies."
            " Capabilities mirror a pharmacy admin at the selected admin level but only for"
            " the pharmacies explicitly assigned to them."
        ),
        default_admin_level=PharmacyAdminPolicy.AdminLevel.MANAGER,
        allowed_admin_levels=(
            PharmacyAdminPolicy.AdminLevel.MANAGER,
            PharmacyAdminPolicy.AdminLevel.ROSTER_MANAGER,
            PharmacyAdminPolicy.AdminLevel.COMMUNICATION_MANAGER,
        ),
        # Roster/staff/admin/comms capabilities come from the chosen admin level.
        organisation_capabilities=(
            OrgCapability.INVITE_STAFF,
            OrgCapability.ASSIGN_PHARMACIES,
        ),
        requires_job_title=True,
        requires_region=True,
        requires_pharmacies=True,
    ),
}


# ROLE_DESCRIPTION_SUMMARY = """
# Organisation Roles
# ==================

# Organisation Admin
# ------------------
# - Full control over the organisation.
# - Can invite staff, manage memberships, assign admins, and claim/create pharmacies.
# - Sees every pharmacy tied to the organisation.

# Chief Admin
# -----------
# - Organisation-wide administrator with the organisation admin's capabilities over every pharmacy.
# - Cannot create, change or remove organisation admins.
# - Requires a job title for clarity in directories.

# Region Admin
# ------------
# - Scoped administrator limited to an assigned list of pharmacies.
# - Must provide job title, operating region, and the pharmacies they oversee.
# - Capabilities match the chosen admin level (Manager, Roster Manager, or Communication Manager).
# """


# Organisation roles whose authority spans every pharmacy of their organisation. Use this (or
# membership_has_org_wide_scope) instead of comparing a role name with "ORG_ADMIN".
ORG_WIDE_ADMIN_ROLES: tuple[str, ...] = tuple(
    key
    for key, definition in ROLE_DEFINITIONS.items()
    if OrgCapability.VIEW_ALL_PHARMACIES in definition.organisation_capabilities
)


def get_role_definition(role: str) -> OrgRoleDefinition | None:
    return ROLE_DEFINITIONS.get(role)


def get_admin_level_definition(level: str) -> AdminLevelDefinition | None:
    return ADMIN_LEVEL_DEFINITIONS.get(level)


def role_allows_pharmacy(role: str, admin_level: str | None = None) -> bool:
    definition = get_role_definition(role)
    if not definition:
        return False
    level = admin_level or definition.default_admin_level
    return level in definition.allowed_admin_levels


def role_requires_field(role: str, field_name: str) -> bool:
    definition = get_role_definition(role)
    if not definition:
        return False
    return {
        "job_title": definition.requires_job_title,
        "region": definition.requires_region,
        "pharmacy_ids": definition.requires_pharmacies,
    }.get(field_name, False)


def role_capabilities(role: str, admin_level: str | None = None) -> set[str]:
    definition = get_role_definition(role)
    if not definition:
        return set()
    return definition.consolidated_capabilities(admin_level)


def membership_capabilities(membership) -> set[str]:
    return role_capabilities(getattr(membership, "role", None), getattr(membership, "admin_level", None))


def membership_has_org_wide_scope(membership) -> bool:
    return OrgCapability.VIEW_ALL_PHARMACIES in membership_capabilities(membership)


def membership_visible_pharmacies(membership):
    from organizations.models import Pharmacy  # Local import to avoid circular loading

    if not membership:
        return Pharmacy.objects.none()

    if membership_has_org_wide_scope(membership):
        return Pharmacy.objects.filter(organization=membership.organization)

    if membership.role == 'REGION_ADMIN':
        return membership.pharmacies.filter(organization_id=membership.organization_id)

    return Pharmacy.objects.none()


def membership_visible_pharmacy_ids(membership) -> list[int]:
    return list(membership_visible_pharmacies(membership).values_list('id', flat=True))


def membership_covers_pharmacy(membership, pharmacy) -> bool:
    """Resolve organisation scope only; callers retain their actor and action-capability checks."""
    if not membership or not pharmacy:
        return False
    organization_id = getattr(membership, "organization_id", None)
    if organization_id is None or organization_id != getattr(pharmacy, "organization_id", None):
        return False
    return (
        membership_has_org_wide_scope(membership)
        or pharmacy.pk in membership_visible_pharmacy_ids(membership)
    )
