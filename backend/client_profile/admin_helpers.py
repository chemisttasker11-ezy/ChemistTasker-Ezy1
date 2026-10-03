"""Backward-compatible imports for pharmacy administration access helpers.

New code should import from `organizations.access`. This module
remains as a stable compatibility facade for existing callers while the
client_profile kernel is decomposed incrementally.
"""
from organizations.access import (
    AdminCapability,
    CAPABILITY_MANAGE_ADMINS,
    CAPABILITY_MANAGE_COMMS,
    CAPABILITY_MANAGE_ROSTER,
    CAPABILITY_MANAGE_STAFF,
    admin_assignments_for,
    assignment_for,
    can_manage_admins,
    can_manage_comms,
    can_manage_roster,
    can_manage_staff,
    has_admin_capability,
    is_admin_of,
    is_any_admin,
    is_owner_admin,
    pharmacies_user_admins,
)

__all__ = [
    "AdminCapability",
    "CAPABILITY_MANAGE_ADMINS",
    "CAPABILITY_MANAGE_COMMS",
    "CAPABILITY_MANAGE_ROSTER",
    "CAPABILITY_MANAGE_STAFF",
    "admin_assignments_for",
    "assignment_for",
    "can_manage_admins",
    "can_manage_comms",
    "can_manage_roster",
    "can_manage_staff",
    "has_admin_capability",
    "is_admin_of",
    "is_any_admin",
    "is_owner_admin",
    "pharmacies_user_admins",
]
