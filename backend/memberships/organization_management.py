"""Membership-owned orchestration used by organisation HTTP adapters.

The adapters supply their existing permission/serializer callbacks and dispatch
patch point. Transaction boundaries and operation bodies retain their order.
Composition supplies these operations through the organisation-owned port.
"""
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework import status
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework.response import Response

from memberships.access import user_can_change_membership
from memberships.labels import membership_role_label
from memberships.models import Membership
from memberships.role_resolution import membership_role_refusal, personal_pharmacy_role
from memberships.serializers import (
    MAX_ACTIVE_PHARMACY_MEMBERSHIPS, _count_active_memberships,
    required_user_role_for_membership,
)
from notifications.models import Notification
from organizations.access import pharmacies_user_admins
from organizations.models import Pharmacy, PharmacyAdmin
from users.models import OrganizationMembership, User
from users.org_roles import ORG_WIDE_ADMIN_ROLES


def pending_admin_invitations(self, request):
    assignments = PharmacyAdmin.objects.filter(
        user=request.user,
        is_active=False,
    ).filter(
        Q(membership__status=Membership.Status.PENDING)
        | Q(membership__status=Membership.Status.ACCEPTED, membership__is_active=True)
    ).select_related('pharmacy', 'membership').order_by('-created_at')
    return Response([
        {
            'id': assignment.id,
            'membership_id': assignment.membership_id,
            'pharmacy_id': assignment.pharmacy_id,
            'pharmacy_name': assignment.pharmacy.name,
            'admin_level': assignment.admin_level,
            'staff_role': assignment.staff_role,
            'job_title': assignment.job_title,
            'membership_status': assignment.membership.status,
        }
        for assignment in assignments
    ])


def accept_admin_invitation(self, request, pk=None):
    with transaction.atomic():
        assignment = get_object_or_404(
            PharmacyAdmin.objects.select_for_update(of=('self',)),
            pk=pk, user=request.user, is_active=False,
            membership__status__in=[Membership.Status.PENDING, Membership.Status.ACCEPTED],
        )
        membership = Membership.objects.select_for_update().get(pk=assignment.membership_id)
        if membership.status != Membership.Status.PENDING and not (
            membership.status == Membership.Status.ACCEPTED and membership.is_active
        ):
            return Response({'detail': 'This admin invitation is no longer available.'}, status=status.HTTP_409_CONFLICT)
        if membership.status == Membership.Status.PENDING:
            if _count_active_memberships(request.user, exclude_membership_id=membership.pk) >= MAX_ACTIVE_PHARMACY_MEMBERSHIPS:
                return Response(
                    {'detail': f'You already belong to {MAX_ACTIVE_PHARMACY_MEMBERSHIPS} pharmacies.'},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            membership.status = Membership.Status.ACCEPTED
            membership.is_active = True
            membership.responded_at = timezone.now()
            membership.save(update_fields=['status', 'is_active', 'responded_at', 'updated_at'])
        assignment.is_active = True
        assignment.save(update_fields=['is_active', 'updated_at'])
    return Response({'status': 'accepted'})


def reject_admin_invitation(self, request, pk=None):
    with transaction.atomic():
        assignment = get_object_or_404(
            PharmacyAdmin.objects.select_for_update(of=('self',)),
            pk=pk, user=request.user, is_active=False,
            membership__status__in=[Membership.Status.PENDING, Membership.Status.ACCEPTED],
        )
        membership = Membership.objects.select_for_update().get(pk=assignment.membership_id)
        if membership.status != Membership.Status.PENDING and not (
            membership.status == Membership.Status.ACCEPTED and membership.is_active
        ):
            return Response({'detail': 'This admin invitation is no longer available.'}, status=status.HTTP_409_CONFLICT)
        if membership.status == Membership.Status.PENDING:
            membership.status = Membership.Status.REJECTED
            membership.is_active = False
            membership.responded_at = timezone.now()
            membership.save(update_fields=['status', 'is_active', 'responded_at', 'updated_at'])
        assignment.delete()
    return Response({'status': 'rejected'})


def admin_queryset(self):
    user = self.request.user
    qs = PharmacyAdmin.objects.select_related("user", "pharmacy", "membership")
    if self.action == 'destroy':
        qs = qs.filter(Q(is_active=True) | Q(membership__status=Membership.Status.PENDING))
    else:
        qs = qs.filter(is_active=True)
    pharmacy_id = self.request.query_params.get("pharmacy")

    accessible_ids = set()
    if hasattr(user, "owneronboarding"):
        accessible_ids.update(
            Pharmacy.objects.filter(owner=user.owneronboarding).values_list("id", flat=True)
        )
    accessible_ids.update(
        pharmacies_user_admins(user).values_list("id", flat=True)
    )
    org_admin_org_ids = OrganizationMembership.objects.filter(
        user=user, role__in=ORG_WIDE_ADMIN_ROLES
    ).values_list("organization_id", flat=True)
    org_admin_org_ids = list(org_admin_org_ids)
    if org_admin_org_ids:
        accessible_ids.update(
            Pharmacy.objects.filter(
                organization_id__in=org_admin_org_ids
            ).values_list("id", flat=True)
        )

    if pharmacy_id:
        qs = qs.filter(pharmacy_id=pharmacy_id)
    if accessible_ids:
        qs = qs.filter(pharmacy_id__in=list(accessible_ids))
    else:
        qs = qs.none()
    return qs


def create_admin(self, request, *args, async_task, **kwargs):
    data = request.data
    email = (data.get("email") or "").strip().lower()
    requested_admin_level = data.get("admin_level")
    staff_role = data.get("staff_role")
    job_title = (data.get("job_title") or "").strip()
    pharmacy_id = data.get("pharmacy")

    if not email or not requested_admin_level or not staff_role or not pharmacy_id:
        return Response({"detail": "pharmacy, email, admin_level, and staff_role are required."}, status=status.HTTP_400_BAD_REQUEST)

    try:
        pharmacy = Pharmacy.objects.select_related("owner__user").get(id=pharmacy_id)
    except Pharmacy.DoesNotExist:
        return Response({"detail": "Pharmacy not found."}, status=status.HTTP_404_NOT_FOUND)

    if requested_admin_level not in PharmacyAdmin.AdminLevel.values:
        return Response({"detail": "Invalid admin level."}, status=status.HTTP_400_BAD_REQUEST)

    if staff_role not in dict(PharmacyAdmin.ADMIN_STAFF_ROLE_CHOICES):
        return Response({"detail": "Invalid staff role."}, status=status.HTTP_400_BAD_REQUEST)

    if not self._can_manage_admins(request.user, pharmacy):
        return Response({"detail": "Not allowed to manage admins for this pharmacy."}, status=status.HTTP_403_FORBIDDEN)

    user = User.objects.filter(email__iexact=email).first()
    if user and PharmacyAdmin.objects.filter(user=user, pharmacy=pharmacy, is_active=True).exists():
        return Response(
            {"detail": "This user already has active admin access. Edit their assignment instead."},
            status=status.HTTP_409_CONFLICT,
        )
    owner_user_id = getattr(getattr(pharmacy, "owner", None), "user_id", None)
    target_is_owner = bool(user and owner_user_id and user.id == owner_user_id)

    if requested_admin_level == PharmacyAdmin.AdminLevel.OWNER and not target_is_owner:
        return Response(
            {"detail": "OWNER admin level can only be assigned to the pharmacy owner."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    admin_level = (
        PharmacyAdmin.AdminLevel.OWNER
        if target_is_owner
        else requested_admin_level
    )

    if admin_level == PharmacyAdmin.AdminLevel.OWNER:
        membership_role = "CONTACT"
        expected_user_role = "OWNER"
    else:
        membership_role = self.STAFF_ROLE_MEMBERSHIP_MAP.get(staff_role, "CONTACT")
        expected_user_role = required_user_role_for_membership(membership_role) or "EXPLORER"
        if user and membership_role_refusal(user, membership_role):
            # An admin assignment is additional access; do not rewrite the
            # account persona or imply clinical staff eligibility.
            membership_role = "CONTACT"

    user_created = False
    with transaction.atomic():
        if not user:
            user = User.objects.create_user(
                email=email,
                password=None,
                role=expected_user_role,
                is_otp_verified=False,
            )
            user.set_unusable_password()
            user.save(update_fields=["password"])
            user_created = True

        if admin_level == PharmacyAdmin.AdminLevel.OWNER and getattr(getattr(pharmacy, "owner", None), "user_id", None) != user.id:
            return Response(
                {"detail": "OWNER admin level can only be assigned to the pharmacy owner."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        membership, _created = Membership.objects.get_or_create(
            user=user,
            pharmacy=pharmacy,
            defaults={
                "role": membership_role,
                "employment_type": "FULL_TIME",
                "is_active": user_created,
                "status": Membership.Status.ACCEPTED if user_created else Membership.Status.PENDING,
                "invited_by": request.user,
                "invited_name": (data.get("invited_name") or "").strip(),
            },
        )
        membership_update_fields = []
        already_accepted = membership.status == Membership.Status.ACCEPTED and membership.is_active
        if not already_accepted and membership.role != membership_role and membership_role:
            membership.role = membership_role
            membership_update_fields.append("role")
        desired_membership_active = user_created or already_accepted
        desired_membership_status = Membership.Status.ACCEPTED if desired_membership_active else Membership.Status.PENDING
        if membership.is_active != desired_membership_active:
            membership.is_active = desired_membership_active
            membership_update_fields.append("is_active")
        if membership.status != desired_membership_status:
            membership.status = desired_membership_status
            membership_update_fields.append("status")
        invited_name = (data.get("invited_name") or "").strip()
        if invited_name and membership.invited_name != invited_name:
            membership.invited_name = invited_name
            membership_update_fields.append("invited_name")
        if membership.invited_by_id != request.user.id:
            membership.invited_by = request.user
            membership_update_fields.append("invited_by")
        if membership_update_fields:
            membership.save(update_fields=list(set(membership_update_fields + ["updated_at"])))

        try:
            assignment, created = PharmacyAdmin.objects.update_or_create(
                user=user,
                pharmacy=pharmacy,
                defaults={
                    "admin_level": admin_level,
                    "staff_role": staff_role,
                    "job_title": job_title,
                    "membership": membership,
                    "created_by": request.user,
                    "is_active": user_created or (target_is_owner and already_accepted),
                 },
             )
        except DjangoValidationError as exc:
            detail = getattr(exc, 'message_dict', None) or getattr(exc, 'messages', None) or exc.args
            raise ValidationError(detail)

    serializer = self.get_serializer(assignment)
    if not user_created and not assignment.is_active:
        membership_url = f"{settings.FRONTEND_BASE_URL.rstrip('/')}/dashboard/admin-invitations"
        context = {
            "pharmacy_name": pharmacy.name,
            "inviter": request.user.get_full_name() or request.user.email or "A pharmacy admin",
            "role": membership_role_label(membership.role),
            "is_admin": already_accepted,
            "membership_url": membership_url,
            "frontend_dashboard_link": membership_url,
        }
        transaction.on_commit(lambda: async_task(
            "users.tasks.send_async_email",
            subject=f"Review your admin invitation to join {pharmacy.name}",
            recipient_list=[user.email],
            template_name="emails/pharmacy_invite_existing_user.html",
            text_template="emails/pharmacy_invite_existing_user.txt",
            context=context,
            notification={
                "user_ids": [user.id],
                "title": f"Admin invitation to join {pharmacy.name}",
                "body": "You have been invited as an admin. Accept or reject the invitation from Manage Memberships.",
                "type": Notification.Type.ALERT,
                "action_url": membership_url,
                "payload": {
                    "membership_id": membership.id,
                    "pharmacy_id": pharmacy.id,
                    "status": membership.status,
                },
            },
        ))
    return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


def revoke_admin(self, request, *args, **kwargs):
    assignment: PharmacyAdmin = self.get_object()
    if not assignment.can_be_removed_by(request.user):
        return Response({"detail": "Not allowed to remove this admin."}, status=status.HTTP_403_FORBIDDEN)
    # Conditional update: a concurrent accept must not be overwritten to REJECTED.
    now = timezone.now()
    Membership.objects.filter(pk=assignment.membership_id, status=Membership.Status.PENDING).update(
        status=Membership.Status.REJECTED, is_active=False, responded_at=now, updated_at=now,
    )
    # Revocation is not a pending invitation: unlink its membership so
    # my-pending-invitations and accept-invitation cannot resurrect it.
    # Keep the inactive assignment for audit and let a fresh authorized
    # create() explicitly re-link membership for any later re-invite.
    assignment.is_active = False
    assignment.membership = None
    assignment.save(update_fields=["is_active", "membership", "updated_at"])
    return Response(status=status.HTTP_204_NO_CONTENT)


def chain_add_user(self, request, pk=None):
    chain = self.get_object()
    pharm = chain.pharmacies.filter(id=request.data.get('pharmacy_id')).first()
    if not pharm:
        raise NotFound("Pharmacy not in this chain.")
    try:
        user = get_user_model().objects.get(id=request.data.get('user_id'))
    except get_user_model().DoesNotExist:
        raise NotFound("User not found.")

    if Membership.objects.filter(user=user, pharmacy=pharm).exists():
        return Response({"detail": "Already assigned."}, status=400)

    return Response(
        {"detail": "Use the Membership invite endpoint to add staff to a pharmacy (role and employment_type required)."},
        status=400
    )


def chain_remove_user(self, request, pk=None):
    chain = self.get_object()
    membership = Membership.objects.filter(
        user_id=request.data.get('user_id'),
        pharmacy__in=chain.pharmacies.all()
    ).first()
    if not membership:
        raise NotFound("User not in this chain’s pharmacies.")
    if not user_can_change_membership(request.user, membership):
        self.permission_denied(request, message="Not allowed to modify this membership.")
    membership.remove()
    return Response(status=204)


def link_owner(user, pharmacy):
    membership, _created = Membership.objects.get_or_create(
        user=user,
        pharmacy=pharmacy,
        defaults={
            'role': 'CONTACT',
            'employment_type': 'FULL_TIME',
            'is_active': True,
            'invited_by': user,
        }
    )
    PharmacyAdmin.objects.update_or_create(
        user=user,
        pharmacy=pharmacy,
        defaults={
            'membership': membership,
            'admin_level': PharmacyAdmin.AdminLevel.OWNER,
            'staff_role': 'OTHER',
            'is_active': True,
            'created_by': user,
        },
    )


def bootstrap_contact(user, pharmacy, inviter):
    worker_role = personal_pharmacy_role(user)
    pharmacy_membership, _ = Membership.objects.get_or_create(
        user=user,
        pharmacy=pharmacy,
        defaults={
            'role': worker_role or 'CONTACT',
            'employment_type': 'FULL_TIME',
            'status': Membership.Status.ACCEPTED,
            'is_active': True,
            'invited_by': inviter,
        }
    )
    assignment, _ = PharmacyAdmin.objects.update_or_create(
        user=user,
        pharmacy=pharmacy,
        defaults={
            'membership': pharmacy_membership,
            'admin_level': PharmacyAdmin.AdminLevel.MANAGER,
            'staff_role': worker_role,
            'job_title': 'Pharmacy Manager',
            'is_active': True,
            'created_by': inviter,
        }
    )
    return pharmacy_membership, assignment
