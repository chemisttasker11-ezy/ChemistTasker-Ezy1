"""Backward-compatible import facade for membership models.

Membership model source is owned by `memberships.models`. During this phase
the models retain `Meta.app_label = "client_profile"`, preserving migration
state, ContentTypes and physical table names.
"""
from memberships.models import (
    FAVORITE_STAFF_EMPLOYMENT_TYPES,
    PHARMACY_STAFF_EMPLOYMENT_TYPES,
    Membership,
    MembershipApplication,
    MembershipInviteLink,
)

__all__ = [
    "PHARMACY_STAFF_EMPLOYMENT_TYPES",
    "FAVORITE_STAFF_EMPLOYMENT_TYPES",
    "Membership",
    "MembershipInviteLink",
    "MembershipApplication",
]
