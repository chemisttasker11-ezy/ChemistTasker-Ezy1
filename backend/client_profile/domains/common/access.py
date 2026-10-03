"""Backward-compatible imports for the access helpers once shared by the client_profile views.

The shift request and role helpers are owned by `shifts.access`, the active-membership limit by
`memberships.serializers` and the organisation scope helpers by `organizations.access`.
"""
from rest_framework import permissions, status
from memberships.models import Membership
from memberships.serializers import MAX_ACTIVE_PHARMACY_MEMBERSHIPS, _count_active_memberships
from onboarding.models import OtherStaffOnboarding
from organizations.models import Pharmacy
from rest_framework.exceptions import APIException
from shifts.access import (
    Http400,
    IsPharmacistOrOtherStaff,
    _get_request_ip,
    _normalized_role_code,
    _otherstaff_onboarding_role,
)
from users.org_roles import membership_capabilities, membership_visible_pharmacy_ids, OrgCapability
from organizations.access import (
    _collect_org_access_scope,
    _get_org_pharmacies_queryset,
)
