"""
Centralised definitions for organisation-level roles and their capabilities.

This module exposes both machine-friendly structures (for views/serialisers)
and human-readable documentation so product and engineering stay aligned.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Mapping, MutableMapping, Sequence

from client_profile.models import PharmacyAdmin


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
    OrgCapability.MANAGE_ADMINS: PharmacyAdmin.CAPABILITY_MANAGE_ADMINS,
    OrgCapability.MANAGE_STAFF: PharmacyAdmin.CAPABILITY_MANAGE_STAFF,
    OrgCapability.MANAGE_ROSTER: PharmacyAdmin.CAPABILITY_MANAGE_ROSTER,
    OrgCapability.MANAGE_COMMS: PharmacyAdmin.CAPABILITY_MANAGE_COMMS,
}


@dataclass(frozen=True)
class AdminLevelDefinition:
    key: str
    label: str
    description: str
    pharmacy_capabilities: Sequence[str]


ADMIN_LEVEL_DEFINITIONS: Mapping[str, AdminLevelDefinition] = {
    PharmacyAdmin.AdminLevel.MANAGER: AdminLevelDefinition(
        key=PharmacyAdmin.AdminLevel.MANAGER,
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
    PharmacyAdmin.AdminLevel.ROSTER_MANAGER: AdminLevelDefinition(
        key=PharmacyAdmin.AdminLevel.ROSTER_MANAGER,
        label="Roster Manager",
        description=(
            "Roster-focused manager: can post/accept shifts and participate in communications."
        ),
        pharmacy_capabilities=(
            OrgCapability.MANAGE_ROSTER,
            OrgCapability.MANAGE_COMMS,
        ),
    ),
    PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER: AdminLevelDefinition(
        key=PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER,
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
        default_admin_level=PharmacyAdmin.AdminLevel.MANAGER,
        allowed_admin_levels=(
            PharmacyAdmin.AdminLevel.MANAGER,
            PharmacyAdmin.AdminLevel.ROSTER_MANAGER,
            PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER,
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
            "Scoped organisation administrator who focuses on onboarding or managing specific pharmacies."
            " Shares pharmacy-level capabilities with an organisation admin but visibility is limited"
            " to the pharmacies explicitly assigned to them."
        ),
        default_admin_level=PharmacyAdmin.AdminLevel.MANAGER,
        allowed_admin_levels=(
            PharmacyAdmin.AdminLevel.MANAGER,
            PharmacyAdmin.AdminLevel.ROSTER_MANAGER,
            PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER,
        ),
        organisation_capabilities=(
            OrgCapability.MANAGE_ADMINS,
            OrgCapability.MANAGE_STAFF,
            OrgCapability.MANAGE_ROSTER,
            OrgCapability.MANAGE_COMMS,
            OrgCapability.INVITE_STAFF,
        ),
        requires_job_title=True,
        requires_region=False,
        requires_pharmacies=True,
    ),
    "REGION_ADMIN": OrgRoleDefinition(
        key="REGION_ADMIN",
        label="Region Admin",
        description=(
            "Scoped administrator responsible for a region-specific subset of pharmacies."
            " Capabilities mirror a pharmacy admin at the selected admin level but only for"
            " the pharmacies explicitly assigned to them."
        ),
        default_admin_level=PharmacyAdmin.AdminLevel.MANAGER,
        allowed_admin_levels=(
            PharmacyAdmin.AdminLevel.MANAGER,
            PharmacyAdmin.AdminLevel.ROSTER_MANAGER,
            PharmacyAdmin.AdminLevel.COMMUNICATION_MANAGER,
        ),
        organisation_capabilities=(
            OrgCapability.MANAGE_ROSTER,
            OrgCapability.MANAGE_COMMS,
            OrgCapability.MANAGE_STAFF,
            OrgCapability.MANAGE_ADMINS,
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
# - Senior administrator focused on a defined set of pharmacies.
# - Shares pharmacy-level capabilities with the selected admin level (Manager/Roster/Comms).
# - Requires a job title for clarity in directories and an explicit list of pharmacies to manage.

# Region Admin
# ------------
# - Scoped administrator limited to an assigned list of pharmacies.
# - Must provide job title, operating region, and the pharmacies they oversee.
# - Capabilities match the chosen admin level (Manager, Roster Manager, or Communication Manager).
# """


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


def membership_visible_pharmacies(membership):
    from client_profile.models import Pharmacy  # Local import to avoid circular loading

    if not membership:
        return Pharmacy.objects.none()

    if membership.role == 'ORG_ADMIN':
        return Pharmacy.objects.filter(organization=membership.organization)

    if membership.role in {'CHIEF_ADMIN', 'REGION_ADMIN'}:
        return membership.pharmacies.all()

    return Pharmacy.objects.none()


def membership_visible_pharmacy_ids(membership) -> list[int]:
    return list(membership_visible_pharmacies(membership).values_list('id', flat=True))
