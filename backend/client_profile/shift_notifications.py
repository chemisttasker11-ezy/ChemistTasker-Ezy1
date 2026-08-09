from __future__ import annotations

import logging
from typing import Iterable

from users.models import OrganizationMembership

from client_profile.admin_helpers import CAPABILITY_MANAGE_ROSTER, has_admin_capability
from client_profile.models import PharmacyAdmin
from client_profile.notifications import notify_users

log = logging.getLogger(__name__)


def shift_url_for_user(shift, user) -> str:
    role = str(getattr(user, "role", "") or "").upper()
    if role == "PHARMACIST":
        return f"/dashboard/pharmacist/shifts/{shift.id}"
    if role == "OTHER_STAFF":
        return f"/dashboard/otherstaff/shifts/{shift.id}"
    if role == "EXPLORER":
        return f"/dashboard/explorer/shifts/{shift.id}"
    if role == "OWNER":
        return f"/dashboard/owner/shifts/{shift.id}"
    if role.startswith("ORG_"):
        return f"/dashboard/organization/shifts/{shift.id}"
    if has_admin_capability(user, shift.pharmacy, CAPABILITY_MANAGE_ROSTER):
        return f"/dashboard/admin/{shift.pharmacy_id}/shifts/{shift.id}"
    return f"/dashboard/owner/shifts/{shift.id}"


def shift_manager_recipients(shift) -> list:
    users_by_id = {}

    def add(user):
        if user and getattr(user, "id", None) and getattr(user, "is_active", True):
            users_by_id[user.id] = user

    add(getattr(shift, "created_by", None))
    add(getattr(getattr(getattr(shift, "pharmacy", None), "owner", None), "user", None))

    if getattr(shift, "pharmacy_id", None):
        for admin_assignment in PharmacyAdmin.objects.filter(
            pharmacy_id=shift.pharmacy_id,
            is_active=True,
        ).select_related("user"):
            add(admin_assignment.user)

    organization_id = getattr(getattr(shift, "pharmacy", None), "organization_id", None)
    if organization_id:
        for org_membership in OrganizationMembership.objects.filter(
            organization_id=organization_id,
            role__in=["ORG_ADMIN", "CHIEF_ADMIN", "REGION_ADMIN"],
        ).select_related("user"):
            add(org_membership.user)

    return list(users_by_id.values())


def notify_shift_users(
    recipients: Iterable,
    *,
    shift,
    title: str,
    body: str,
    kind: str,
    payload: dict | None = None,
) -> None:
    base_payload = {
        "shift_id": shift.id,
        "notification_kind": kind,
        **(payload or {}),
    }
    sent = 0
    for recipient in recipients:
        if not recipient or not getattr(recipient, "id", None):
            continue
        notify_users(
            [recipient.id],
            title=title,
            body=body,
            action_url=shift_url_for_user(shift, recipient),
            payload=base_payload,
        )
        sent += 1
    if sent == 0:
        log.warning("No recipients resolved for shift notification kind=%s shift_id=%s", kind, getattr(shift, "id", None))


def notify_shift_managers(
    shift,
    *,
    title: str,
    body: str,
    kind: str,
    payload: dict | None = None,
) -> list:
    recipients = shift_manager_recipients(shift)
    notify_shift_users(recipients, shift=shift, title=title, body=body, kind=kind, payload=payload)
    return recipients

