"""Membership notifications: invitations sent to workers, a worker's response sent to the pharmacy's managers, and
the dashboard links they carry (per recipient role)."""
from django.conf import settings

from core.task_queue import async_task
from memberships.models import Membership
from notifications.models import Notification
from notifications.services import notify_users
from organizations.access import CAPABILITY_MANAGE_STAFF, has_admin_capability
from organizations.models import PharmacyAdmin
from users.models import OrganizationMembership


def _frontend_base_url() -> str:
    """
    Returns the FE base URL for building absolute links.
    Falls back to localhost:5174 for dev if not set.
    """
    base = getattr(settings, "FRONTEND_BASE_URL", "").rstrip("/")
    return base or "http://localhost:5174"


def _manage_path_for_role(recipient_role: str) -> str:
    """
    Map the recipient's role to the correct dashboard route.
    - Owner & Pharmacy Admin use the Owner dashboard area
    - Org Admin uses the Organization dashboard area
    """
    if recipient_role in ("OWNER", "PHARMACY_ADMIN"):
        return "/dashboard/owner/manage-pharmacies"
    if recipient_role == "ORG_ADMIN":
        return "/dashboard/organization/manage-pharmacies"
    # Fallback to owner area if something unexpected slips through
    return "/dashboard/owner/manage-pharmacies"


def _manage_detail_url_for_role(recipient_role: str, pharmacy_id: int | str) -> str:
    base_path = _manage_path_for_role(recipient_role)
    return f"{base_path}?workspace=internal&pharmacy_id={pharmacy_id}&view=detail&pharmacyId={pharmacy_id}"


def _worker_membership_url(user):
    base = _frontend_base_url_for_notifications()
    role = "pharmacist" if getattr(user, "role", "") == "PHARMACIST" else "otherstaff"
    return f"{base}/dashboard/{role}/memberships"


def _frontend_base_url_for_notifications():
    return (getattr(settings, "FRONTEND_BASE_URL", "") or "http://localhost:5173").rstrip("/")


def _pharmacy_membership_manage_url(pharmacy, recipient=None):
    base = _frontend_base_url_for_notifications()
    detail_query = f"?view=detail&pharmacyId={pharmacy.id}"
    owner_user = getattr(getattr(pharmacy, "owner", None), "user", None)
    if recipient and owner_user and getattr(owner_user, "id", None) == getattr(recipient, "id", None):
        return f"{base}/dashboard/owner/manage-pharmacies/my-pharmacies{detail_query}"
    if recipient and has_admin_capability(recipient, pharmacy, CAPABILITY_MANAGE_STAFF):
        return f"{base}/dashboard/admin/{pharmacy.id}/manage-pharmacies/my-pharmacies{detail_query}"
    if recipient and OrganizationMembership.objects.filter(user=recipient, organization_id=pharmacy.organization_id).exists():
        return f"{base}/dashboard/organization/manage-pharmacies/my-pharmacies{detail_query}"
    return f"{base}/dashboard/owner/manage-pharmacies/my-pharmacies{detail_query}"


def _membership_controller_users(pharmacy, invited_by=None):
    users_by_id = {}

    def add(user):
        if user and getattr(user, "id", None):
            users_by_id[user.id] = user

    add(invited_by)
    add(getattr(getattr(pharmacy, "owner", None), "user", None))

    for admin in PharmacyAdmin.objects.filter(pharmacy=pharmacy, is_active=True).select_related("user"):
        add(admin.user)

    if getattr(pharmacy, "organization_id", None):
        for org_membership in OrganizationMembership.objects.filter(
            organization_id=pharmacy.organization_id,
            role="ORG_ADMIN",
        ).select_related("user"):
            add(org_membership.user)

    return list(users_by_id.values())


def _format_membership_person(user):
    if not user:
        return "A candidate"
    return user.get_full_name() or user.email or getattr(user, "username", "") or "A candidate"


def _notify_membership_invitation_sent(membership):
    user = membership.user
    pharmacy = membership.pharmacy
    if not user or not pharmacy:
        return
    action_url = _worker_membership_url(user)
    role_label = dict(Membership.ROLE_CHOICES).get(membership.role, membership.role)
    notify_users(
        [user.id],
        title=f"Invitation to join {pharmacy.name}",
        body=f"You have been invited as {role_label}. Accept or reject the invitation from Manage Memberships.",
        notification_type=Notification.Type.ALERT,
        action_url=action_url,
        payload={
            "membership_id": membership.id,
            "pharmacy_id": pharmacy.id,
            "status": membership.status,
        },
    )


def _notify_membership_response(membership, response_status):
    pharmacy = membership.pharmacy
    worker = membership.user
    if not pharmacy or not worker:
        return

    worker_name = _format_membership_person(worker)
    role_label = dict(Membership.ROLE_CHOICES).get(membership.role, membership.role)
    response_config = {
        Membership.Status.ACCEPTED: {
            "status_label": "accepted",
            "action_phrase": "accepted the invitation to join",
        },
        Membership.Status.REJECTED: {
            "status_label": "rejected",
            "action_phrase": "rejected the invitation to join",
        },
        Membership.Status.LEFT: {
            "status_label": "left",
            "action_phrase": "left their membership at",
        },
    }.get(response_status, {
        "status_label": str(response_status).lower(),
        "action_phrase": "updated their membership at",
    })
    status_label = response_config["status_label"]
    action_phrase = response_config["action_phrase"]
    subject = f"{worker_name} {status_label} {pharmacy.name}"
    body = f"{worker_name} has {action_phrase} {pharmacy.name}."
    recipients = _membership_controller_users(pharmacy, invited_by=membership.invited_by)

    for recipient in recipients:
        recipient_id = getattr(recipient, "id", None)
        if not recipient_id:
            continue
        action_url = _pharmacy_membership_manage_url(pharmacy, recipient=recipient)
        notify_users(
            [recipient_id],
            title=subject,
            body=body,
            notification_type=Notification.Type.ALERT,
            action_url=action_url,
            payload={
                "membership_id": membership.id,
                "pharmacy_id": pharmacy.id,
                "status": response_status,
            },
        )

        if not getattr(recipient, "email", None):
            continue
        async_task(
            "users.tasks.send_async_email",
            subject=subject,
            recipient_list=[recipient.email],
            template_name="emails/membership_invitation_response.html",
            text_template="emails/membership_invitation_response.txt",
            context={
                "worker_name": worker_name,
                "worker_email": worker.email,
                "pharmacy_name": pharmacy.name,
                "role": role_label,
                "status_label": status_label,
                "action_phrase": action_phrase,
                "manage_url": action_url,
            },
        )
