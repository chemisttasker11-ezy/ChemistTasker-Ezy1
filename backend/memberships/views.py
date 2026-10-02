"""Membership API: memberships, invite links, magic-link information, applications and a user's own memberships."""
from rest_framework import permissions, serializers, status, viewsets
from memberships.models import Membership, MembershipApplication, MembershipInviteLink
from client_profile.models import (
    OtherStaffOnboarding,
    OwnerOnboarding,
    PharmacistOnboarding,
    Pharmacy,
    PharmacyAdmin,
)
from notifications.models import Notification
from rest_framework.response import Response
from rest_framework.views import APIView
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.decorators import action
from client_profile.domains.orgs.access import CAPABILITY_MANAGE_STAFF, has_admin_capability, pharmacies_user_admins
from django.shortcuts import get_object_or_404
from django.db.models import Q
from django.utils import timezone
from client_profile.domains.common.helpers import clean_email
from memberships.labels import membership_role_label
from notifications.services import notify_users
from django.utils.crypto import get_random_string
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from django.conf import settings
from core.task_queue import async_task
from datetime import date
from client_profile.domains.orgs.access import _collect_org_access_scope, _get_org_pharmacies_queryset
from django.db import transaction
from django.db.models.deletion import ProtectedError
from datetime import timedelta
from users.models import OrganizationMembership, User
from users.org_roles import membership_capabilities, membership_visible_pharmacy_ids, OrgCapability
from memberships.serializers import (
    _count_active_memberships,
    MAX_ACTIVE_PHARMACY_MEMBERSHIPS,
    MembershipApplicationReviewSerializer,
    MembershipApplicationSerializer,
    MembershipInviteLinkSerializer,
    MembershipSerializer,
    required_user_role_for_membership,
)


def _user_can_invite_members_to_pharmacy(user, pharmacy):
    if not user or not getattr(user, "is_authenticated", False) or not pharmacy:
        return False

    if getattr(user, "is_staff", False) or getattr(user, "is_superuser", False):
        return True

    if getattr(pharmacy.owner, "user", None) == user:
        return True

    if has_admin_capability(user, pharmacy, CAPABILITY_MANAGE_STAFF):
        return True

    org_memberships = user.organization_memberships.filter(
        organization_id=pharmacy.organization_id
    ).prefetch_related('pharmacies')
    for membership in org_memberships:
        caps = membership_capabilities(membership)
        can_invite = (
            OrgCapability.INVITE_STAFF in caps
            or OrgCapability.MANAGE_STAFF in caps
            or OrgCapability.MANAGE_ADMINS in caps
        )
        if not can_invite:
            continue
        if OrgCapability.VIEW_ALL_PHARMACIES in caps:
            return True
        if pharmacy.id in membership_visible_pharmacy_ids(membership):
            return True

    return False


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


class MembershipViewSet(viewsets.ModelViewSet):
    """
    CRUD and listing for Membership. Listings scoped to pharmacies
    the user owns or administrates.
    """
    serializer_class = MembershipSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        
        # 1. Determine ALL pharmacies where the user should be able to see the member list.
        
        # Pharmacies they own
        owned_pharmacies = Pharmacy.objects.none()
        if hasattr(user, 'owneronboarding'):
            owned_pharmacies = Pharmacy.objects.filter(owner=user.owneronboarding)

        full_org_ids, scoped_org_map = _collect_org_access_scope(user)
        org_pharmacies = Pharmacy.objects.none()
        if full_org_ids:
            org_pharmacies |= Pharmacy.objects.filter(organization_id__in=full_org_ids)
        scoped_ids = set()
        for ids in scoped_org_map.values():
            scoped_ids.update(ids)
        if scoped_ids:
            org_pharmacies |= Pharmacy.objects.filter(id__in=scoped_ids)

        # Pharmacies they are a PHARMACY_ADMIN in
        admin_pharmacies = Pharmacy.objects.filter(
            admin_assignments__user=user,
            admin_assignments__is_active=True
        )
        
        # NEW RULE: Pharmacies they are a regular, active member of
        member_pharmacies = Pharmacy.objects.filter(
            memberships__user=user,
            memberships__is_active=True,
            memberships__status=Membership.Status.ACCEPTED,
        )

        # Combine all visible pharmacies into one master queryset
        visible_pharmacies = (owned_pharmacies | org_pharmacies | admin_pharmacies | member_pharmacies).distinct()

        # 2. Base the Membership query on these visible pharmacies.
        qs = (
            Membership.objects.filter(pharmacy__in=visible_pharmacies)
            .filter(
                Q(is_active=True, status=Membership.Status.ACCEPTED)
                | Q(status=Membership.Status.PENDING)
            )
            .select_related(
                "user",
                "invited_by",
                "pharmacy",
                "pharmacy__owner",
                "pharmacy__organization",
            )
            .prefetch_related(
                "pharmacy__chains",
                "pharmacy__claims",
            )
        )

        # 3. Apply the optional query filters from the request.
        pharmacy_id = (
            self.request.query_params.get('pharmacy_id')
            or self.request.query_params.get('pharmacy')
            or self.request.query_params.get('pharmacy_pk')
        )
        chain_id = self.request.query_params.get('chain_id')
        organization_id = self.request.query_params.get('organization')
        
        if pharmacy_id:
            try:
                pharmacy_id_int = int(pharmacy_id)
            except (TypeError, ValueError):
                qs = qs.none()
            else:
                allowed = visible_pharmacies.filter(id=pharmacy_id_int).exists()
                if not allowed:
                    if pharmacy_id_int in scoped_ids:
                        allowed = True
                    else:
                        pharmacy = Pharmacy.objects.filter(id=pharmacy_id_int).only('organization_id').first()
                        if pharmacy and pharmacy.organization_id in full_org_ids:
                            allowed = True
                if allowed:
                    qs = qs.filter(pharmacy_id=pharmacy_id_int)
                else:
                    qs = qs.none()
        elif chain_id:
            # --- THIS IS THE FIX ---
            # Correctly filter by pharmacies belonging to a chain using the proper relationship
            qs = qs.filter(pharmacy__chains__id=chain_id)
            # ---------------------
        elif organization_id:
            try:
                organization_id_int = int(organization_id)
            except (TypeError, ValueError):
                qs = qs.none()
            else:
                # Allow any org staff OR any pharmacy member whose pharmacy belongs to this org
                is_org_staff = OrganizationMembership.objects.filter(
                    user=user, organization_id=organization_id_int
                ).exists()
                is_org_pharmacy_member = Membership.objects.filter(
                    user=user,
                    is_active=True,
                    status=Membership.Status.ACCEPTED,
                    pharmacy__organization_id=organization_id_int,
                ).exists()
                is_org_member = is_org_staff or is_org_pharmacy_member

                if is_org_member:
                    # User is part of this org (staff or pharmacy member); show ALL members of ALL pharmacies in the org.
                    qs = (
                        Membership.objects.filter(
                            pharmacy__organization_id=organization_id_int,
                        )
                        .filter(
                            Q(is_active=True, status=Membership.Status.ACCEPTED)
                            | Q(status=Membership.Status.PENDING)
                        )
                        .select_related(
                            "user",
                            "invited_by",
                            "pharmacy",
                            "pharmacy__owner",
                            "pharmacy__organization",
                        )
                        .prefetch_related(
                            "pharmacy__chains",
                            "pharmacy__claims",
                        )
                    )
                else:
                    if organization_id_int in full_org_ids:
                        qs = qs.filter(pharmacy__organization_id=organization_id_int)
                    elif organization_id_int in scoped_org_map:
                        allowed_ids = scoped_org_map.get(organization_id_int, set())
                        if allowed_ids:
                            qs = qs.filter(pharmacy_id__in=allowed_ids)
                        else:
                            qs = qs.none()
                    else:
                        qs = qs.none()

        return qs.distinct()


    def check_object_permissions(self, request, obj):
        user = request.user
        pharm = obj.pharmacy

        # Owner of this pharmacy
        if pharm and pharm.owner and pharm.owner.user == user:
            return

        if pharm:
            memberships = user.organization_memberships.filter(
                organization_id=pharm.organization_id
            ).prefetch_related('pharmacies')
            for membership in memberships:
                caps = membership_capabilities(membership)
                if OrgCapability.MANAGE_STAFF in caps or OrgCapability.MANAGE_ADMINS in caps:
                    if OrgCapability.VIEW_ALL_PHARMACIES in caps:
                        return
                    if pharm.id in membership_visible_pharmacy_ids(membership):
                        return

        # Pharmacy Admin of THIS pharmacy
        if pharm and has_admin_capability(user, pharm, CAPABILITY_MANAGE_STAFF):
            return

        self.permission_denied(request, message="Not allowed to modify this membership.")


    def destroy(self, request, *args, **kwargs):
        """
        Permanently deletes a membership.
        First, it removes the member from any chat rooms they are a part of to satisfy the PROTECT rule.
        Then, it deletes the membership record itself.
        WARNING: This will also delete all messages sent by this member.
        """
        membership = self.get_object()

        with transaction.atomic():
            # Step 1: Delete the protecting Participant records first.
            # The related_name on the Participant model is 'chat_participations'.
            membership.chat_participations.all().delete()

            # Step 2: Now that the protection is removed, delete the membership.
            # This will also cascade-delete all of their messages.
            try:
                membership.delete()
            except ProtectedError:
                membership.is_active = False
                membership.save(update_fields=["is_active"])

        return Response(status=status.HTTP_204_NO_CONTENT)

    @transaction.atomic
    def _create_membership_invite(self, data, inviter):
        """
        Helper to create or invite a user as a membership and send emails.
        Returns: (membership_instance, None) if successful, (None, error_message) if not.
        """
        try:
            email_raw = (data.get('email') or data.get('user_email') or '').strip().lower()
            email = clean_email(email_raw)
            pharmacy_id = data.get('pharmacy')
            role = data.get('role')
            employment_type = data.get('employment_type', '')

            if not email or not pharmacy_id or not role:
                return None, 'email, pharmacy, and role are required.'

            if role == "PHARMACY_ADMIN":
                return None, 'Use the pharmacy admin management endpoint to invite admins.'

            try:
                pharmacy = (
                    Pharmacy.objects
                    .select_for_update()
                    .select_related("owner__user")
                    .get(id=pharmacy_id)
                )
            except Pharmacy.DoesNotExist:
                return None, 'Pharmacy not found.'

            source_application_id = data.get('source_application_id')
            pending_application_qs = MembershipApplication.objects.filter(
                pharmacy=pharmacy,
                email__iexact=email,
                status="PENDING",
            )
            if source_application_id:
                pending_application_qs = pending_application_qs.exclude(pk=source_application_id)
            if pending_application_qs.exists():
                return None, (
                    "This person already has a pending membership application for this pharmacy. "
                    "Review that application instead of creating a duplicate invitation."
                )

            # Find or create user
            user = User.objects.filter(email__iexact=email).first()
            user_created = False
            
            if not user:
                try:
                    if role == "PHARMACIST":
                        user_role = "PHARMACIST"
                    elif role in ["INTERN", "STUDENT", "ASSISTANT", "TECHNICIAN"]:
                        user_role = "OTHER_STAFF"
                    else:
                        user_role = "EXPLORER"

                    user = User.objects.create_user(
                        email=email,
                        password=get_random_string(12),
                        role=user_role,
                        is_otp_verified=False,
                    )
                    user_created = True
                except Exception as e:
                    import traceback
                    traceback.print_exc()
                    return None, f'Failed to create user: {str(e)}'
            else:
                required_user_role = required_user_role_for_membership(role)
                if required_user_role and user.role != required_user_role:
                    membership_role_label_text = membership_role_label(role)
                    user_role_label = dict(User.ROLE_CHOICES).get(user.role, user.role or "Unspecified")
                    required_role_label = dict(User.ROLE_CHOICES).get(required_user_role, required_user_role)
                    return None, (
                        f"{user.email} is registered as {user_role_label} and cannot be added as "
                        f"{membership_role_label_text}. Ask them to complete the {required_role_label} onboarding first."
                    )

            # Enforce maximum active pharmacy memberships per user
            active_memberships = _count_active_memberships(user)
            if active_memberships >= MAX_ACTIVE_PHARMACY_MEMBERSHIPS:
                return None, f'This user already a member in {MAX_ACTIVE_PHARMACY_MEMBERSHIPS} pharmacies.'

            # Membership exists?
            existing_membership = Membership.objects.filter(user=user, pharmacy_id=pharmacy_id).first()
            if existing_membership:
                if existing_membership.status == Membership.Status.PENDING:
                    return None, 'This user already has a pending invitation for this pharmacy.'
                if existing_membership.status == Membership.Status.ACCEPTED and existing_membership.is_active:
                    return None, 'User is already a member of this pharmacy.'

            # --- START OF THE FIX ---
            # Prepare data for Membership creation, including new classification fields
            job_title_value = (data.get('job_title') or '').strip()
            if employment_type not in {'FULL_TIME', 'PART_TIME'}:
                job_title_value = ''

            membership_data = {
                'user': user.pk,
                'pharmacy': pharmacy.pk,
                'invited_name': data.get('invited_name', ''),
                'role': role,
                'employment_type': employment_type,
                'job_title': job_title_value,
                # Add classification fields from the request data
                'pharmacist_award_level': data.get('pharmacist_award_level', None),
                'otherstaff_classification_level': data.get('otherstaff_classification_level', None),
                'intern_half': data.get('intern_half', None),
                'student_year': data.get('student_year', None),
            }
            activate_immediately = bool(data.get('activate_immediately'))
            if user_created or activate_immediately:
                membership_data['is_active'] = True
                membership_data['status'] = Membership.Status.ACCEPTED
            else:
                membership_data['is_active'] = False
                membership_data['status'] = Membership.Status.PENDING

            # Create membership through the serializer so role/classification rules
            # stay identical across manual invites and magic-link approvals.
            serializer_kwargs = {
                'data': membership_data,
                'context': {'request': getattr(self, 'request', None)},
            }
            if existing_membership:
                serializer_kwargs['instance'] = existing_membership
                serializer_kwargs['partial'] = True
            membership_serializer = MembershipSerializer(**serializer_kwargs)
            try:
                membership_serializer.is_valid(raise_exception=True)
                membership = membership_serializer.save(invited_by=inviter)
                desired_status = membership_data.get('status', Membership.Status.ACCEPTED)
                desired_active = bool(membership_data.get('is_active', True))
                force_update_fields = []
                if membership.status != desired_status:
                    membership.status = desired_status
                    force_update_fields.append('status')
                if membership.is_active != desired_active:
                    membership.is_active = desired_active
                    force_update_fields.append('is_active')
                if force_update_fields:
                    force_update_fields.append('updated_at')
                    membership.save(update_fields=force_update_fields)
            except serializers.ValidationError as e:
                detail = e.detail
                if isinstance(detail, dict):
                    for messages in detail.values():
                        if isinstance(messages, list) and messages:
                            return None, str(messages[0])
                        if isinstance(messages, str):
                            return None, messages
                return None, str(detail)
            except Exception as e:
                import traceback
                traceback.print_exc()
                return None, f'Failed to create membership: {str(e)}'
            # --- END OF THE FIX ---

            # Prepare and send email
            try:
                base = _frontend_base_url_for_notifications()
                admin_landing_url = f"{base}/dashboard/owner/manage-pharmacies/my-pharmacies"
                login_url = f"{base}/login"

                is_admin_role = False

                context = {
                    "pharmacy_name": pharmacy.name,
                    "inviter": inviter.get_full_name() or inviter.email or "A pharmacy admin",
                    "role": membership_role_label(role),
                    "is_admin": is_admin_role,                    # <-- NEW
                    "admin_landing_url": admin_landing_url,       # <-- NEW
                }

                recipient_list = [user.email]


                if user_created:
                    uid = urlsafe_base64_encode(force_bytes(user.pk))
                    token = default_token_generator.make_token(user)
                    context["magic_link"] = f"{base}/reset-password/{uid}/{token}/"

                    subject = (
                        f"You’ve been invited as Pharmacy Admin at {pharmacy.name}"
                        if is_admin_role
                        else "You’re invited to join a pharmacy on ChemistTasker"
                    )

                    transaction.on_commit(lambda: async_task(
                        'users.tasks.send_async_email',
                        subject=subject,
                        recipient_list=recipient_list,
                        template_name="emails/pharmacy_invite_new_user.html",
                        context=context,
                        text_template="emails/pharmacy_invite_new_user.txt",
                    ))

                elif activate_immediately:
                    pass
                else:
                    worker_role = "pharmacist" if getattr(user, "role", "") == "PHARMACIST" else "otherstaff"
                    membership_url = f"{base}/dashboard/{worker_role}/memberships"
                    context["frontend_dashboard_link"] = admin_landing_url if is_admin_role else membership_url
                    context["membership_url"] = membership_url

                    subject = (
                        f"You’ve been added as Pharmacy Admin at {pharmacy.name}"
                        if is_admin_role
                        else f"Review your invitation to join {pharmacy.name}"
                    )

                    transaction.on_commit(lambda: async_task(
                        'users.tasks.send_async_email',
                        subject=subject,
                        recipient_list=recipient_list,
                        template_name="emails/pharmacy_invite_existing_user.html",
                        context=context,
                        text_template="emails/pharmacy_invite_existing_user.txt",
                        notification={
                            "user_ids": [user.id],
                            "title": f"Invitation to join {pharmacy.name}",
                            "body": f"You have been invited as {membership_role_label(role)}. Accept or reject the invitation from Manage Memberships.",
                            "type": Notification.Type.ALERT,
                            "action_url": membership_url,
                            "payload": {
                                "membership_id": membership.id,
                                "pharmacy_id": pharmacy.id,
                                "status": membership.status,
                            },
                        },
                    ))


            except Exception as e:
                import traceback
                traceback.print_exc()
                # Don't return error here - membership was created successfully
                # Just log the email error but continue

            return membership, None
            
        except Exception as e:
            import traceback
            traceback.print_exc()
            return None, f'Unexpected error: {str(e)}'


    # --- Single Invite (scoped to target pharmacy) ---
    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        inviter = request.user

        # Require a target pharmacy id
        pharmacy_id_for_perm = data.get('pharmacy')
        if not pharmacy_id_for_perm:
            return Response({'detail': 'Field "pharmacy" is required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            target_pharmacy = Pharmacy.objects.select_related("owner__user").get(
                id=pharmacy_id_for_perm
            )
        except Pharmacy.DoesNotExist:
            return Response({'detail': 'Pharmacy not found.'}, status=status.HTTP_404_NOT_FOUND)

        if not _user_can_invite_members_to_pharmacy(inviter, target_pharmacy):
            return Response(
                {'detail': 'Only admins, pharmacy owners, or claimed organization users with staff invite permissions may invite.'},
                status=status.HTTP_403_FORBIDDEN
            )

        membership, error = self._create_membership_invite(data, inviter)
        if error:
            return Response({'detail': error}, status=status.HTTP_400_BAD_REQUEST)

        serializer = self.get_serializer(membership)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    # --- Bulk Invite (row-by-row scope enforcement) ---
    @action(detail=False, methods=['post'], url_path='bulk_invite')
    def bulk_invite(self, request):
        inviter = request.user
        invitations = request.data.get('invitations', [])
        if not invitations or not isinstance(invitations, list):
            return Response({'detail': 'Invitations must be a list.'}, status=status.HTTP_400_BAD_REQUEST)

        results, errors = [], []

        for idx, invite in enumerate(invitations):
            # Validate target pharmacy per row
            pid = invite.get('pharmacy')
            if not pid:
                errors.append({'line': idx + 1, 'email': invite.get('email'), 'error': 'Field "pharmacy" is required.'})
                continue

            try:
                target_pharmacy = Pharmacy.objects.select_related("owner__user").get(id=pid)
            except Pharmacy.DoesNotExist:
                errors.append({
                    'line': idx + 1,
                    'email': invite.get('email'),
                    'error': 'Pharmacy not found.'
                })
                continue

            if not _user_can_invite_members_to_pharmacy(inviter, target_pharmacy):
                errors.append({
                    'line': idx + 1,
                    'email': invite.get('email'),
                    'error': 'Not permitted to invite into this pharmacy.'
                })
                continue

            # Default employment type for Pharmacy Admin if omitted
            if invite.get('role') == 'PHARMACY_ADMIN':
                errors.append({
                    'line': idx + 1,
                    'email': invite.get('email'),
                    'error': 'Pharmacy admin invitations must use the admin management endpoint.'
                })
                continue

            membership, error = self._create_membership_invite(invite, inviter)
            if error:
                errors.append({'line': idx + 1, 'email': invite.get('email'), 'error': error})
            else:
                results.append({
                    'email': invite.get('email'),
                    'role': invite.get('role'),
                    'employment_type': invite.get('employment_type'),
                    'status': 'invited',
                    'membership_id': membership.id,
                    'membership_status': membership.status,
                    'membership_is_active': membership.is_active,
                })

        response = {'results': results}
        if errors:
            response['errors'] = errors
            return Response(response, status=status.HTTP_207_MULTI_STATUS)  # Partial success

        return Response(response, status=status.HTTP_201_CREATED)


class MembershipInviteLinkViewSet(viewsets.ModelViewSet):
    """
    POST /membership-invite-links/    -> create a magic link
    GET  /membership-invite-links/?pharmacy=<id> -> list my links
    """
    serializer_class = MembershipInviteLinkSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # Owners see own pharmacies; Org-Admins see org; Pharmacy Admins see their pharmacies
        # mirror visibility logic from MembershipViewSet.get_queryset
        visible_pharmacies = _get_org_pharmacies_queryset(user)
        if not visible_pharmacies.exists():
            try:
                owner = OwnerOnboarding.objects.get(user=user)
                visible_pharmacies = Pharmacy.objects.filter(owner=owner)
            except OwnerOnboarding.DoesNotExist:
                visible_pharmacies = Pharmacy.objects.none()
        admin_scoped_ids = [
            pharm.id
            for pharm in pharmacies_user_admins(user)
            if has_admin_capability(user, pharm, CAPABILITY_MANAGE_STAFF)
        ]
        if admin_scoped_ids:
            visible_pharmacies |= Pharmacy.objects.filter(id__in=admin_scoped_ids)
        visible_pharmacies = visible_pharmacies.distinct()
        qs = MembershipInviteLink.objects.filter(pharmacy__in=visible_pharmacies, is_active=True)
        pid = self.request.query_params.get('pharmacy')
        return qs.filter(pharmacy_id=pid) if pid else qs

    def create(self, request, *args, **kwargs):
        data = request.data.copy()
        pharmacy_id = data.get('pharmacy')
        category = data.get('category')
        days = int(data.get('expires_in_days') or 14)

        if not pharmacy_id or not category:
            return Response({'detail': 'pharmacy and category are required.'}, status=400)

        user = request.user
        try:
            target_pharmacy = Pharmacy.objects.select_related("owner__user").get(id=pharmacy_id)
        except Pharmacy.DoesNotExist:
            return Response({'detail': 'Pharmacy not found.'}, status=404)

        if not _user_can_invite_members_to_pharmacy(user, target_pharmacy):
            return Response({'detail': 'Not allowed to generate links for this pharmacy.'}, status=403)

        expires_at = timezone.now() + timedelta(days=days)
        serializer = self.get_serializer(data={'pharmacy': pharmacy_id, 'category': category, 'expires_at': expires_at})
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(serializer.data, status=201)


class MagicLinkInfoView(APIView):
    """
    GET /magic/memberships/<token>/
    Validate link and return pharmacy name + category (no auth).
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, token):
        try:
            link = MembershipInviteLink.objects.get(token=token)
        except (MembershipInviteLink.DoesNotExist, DjangoValidationError):   # unknown token, or not a UUID at all
            return Response({'detail': 'Invalid link.'}, status=404)
        if not link.is_valid():
            return Response({'detail': 'Link expired or inactive.'}, status=410)

        return Response({
            'pharmacy': link.pharmacy_id,
            'pharmacy_name': link.pharmacy.name,
            'category': link.category,
            'expires_at': link.expires_at,
            'payroll_enabled': bool(link.pharmacy.use_chemisttasker_payroll),
        })


class SubmitMembershipApplication(APIView):
    """
    POST /magic/memberships/<token>/apply
    Body: { role, first_name, last_name, username, mobile_number, (level fields), (email optional) }
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request, token):
        try:
            link = MembershipInviteLink.objects.get(token=token)
        except (MembershipInviteLink.DoesNotExist, DjangoValidationError):   # unknown token, or not a UUID at all
            return Response({'detail': 'Invalid link.'}, status=404)
        if not link.is_valid():
            return Response({'detail': 'Link expired or inactive.'}, status=410)

        payload = request.data.copy()
        payload['invite_link'] = link.pk  # serializer will lock category+pharmacy from link

        # Enforce membership limit for workers responding via magic link
        email_raw = payload.get('email')
        if email_raw:
            email_clean = clean_email((email_raw or '').strip().lower())
            payload['email'] = email_clean
            try:
                existing_user = User.objects.get(email=email_clean)
            except User.DoesNotExist:
                existing_user = None
            if existing_user:
                active_count = _count_active_memberships(existing_user)
                if active_count >= MAX_ACTIVE_PHARMACY_MEMBERSHIPS:
                    return Response(
                        {
                            'detail': f'You already belong to {MAX_ACTIVE_PHARMACY_MEMBERSHIPS} pharmacies.'
                        },
                        status=status.HTTP_400_BAD_REQUEST
                    )

        with transaction.atomic():
            # Serialize direct invites and link applications for the same pharmacy
            # so both paths cannot pass duplicate checks concurrently.
            Pharmacy.objects.select_for_update().get(pk=link.pharmacy_id)
            serializer = MembershipApplicationSerializer(data=payload, context={'request': request})
            serializer.is_valid(raise_exception=True)
            app = serializer.save(
                pharmacy=link.pharmacy,
                category=link.category,
                invite_link=link,
                submitted_by=request.user if request.user.is_authenticated else None,
            )

            # async notify owner + admins only after the application commits
            transaction.on_commit(
                lambda app_id=app.id: async_task(
                    'client_profile.tasks.email_membership_application_submitted', app_id
                ),
                robust=True,
            )

        return Response(MembershipApplicationSerializer(app).data, status=201)


class MembershipApplicationViewSet(viewsets.ModelViewSet):
    """
    Owners/Org Admins/Pharmacy Admins can list pending apps for their pharmacies,
    edit employment-facing fields, and approve/reject.
    Applicant identifiers are immutable after submission.
    """
    serializer_class = MembershipApplicationSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_serializer_class(self):
        if self.action in {"update", "partial_update"}:
            return MembershipApplicationReviewSerializer
        return MembershipApplicationSerializer

    def get_queryset(self):
        user = self.request.user
        # visible pharmacies same as above
        org_ids = list(
            OrganizationMembership.objects.filter(user=user, role='ORG_ADMIN').values_list('organization_id', flat=True)
        )
        if org_ids:
            visible_pharmacies = Pharmacy.objects.filter(organization_id__in=org_ids)
        else:
            try:
                owner = OwnerOnboarding.objects.get(user=user)
                visible_pharmacies = Pharmacy.objects.filter(owner=owner)
            except OwnerOnboarding.DoesNotExist:
                visible_pharmacies = Pharmacy.objects.none()
        admin_staff_ids = [
            pharm.id
            for pharm in pharmacies_user_admins(user)
            if has_admin_capability(user, pharm, CAPABILITY_MANAGE_STAFF)
        ]
        if admin_staff_ids:
            visible_pharmacies |= Pharmacy.objects.filter(id__in=admin_staff_ids)
        visible_pharmacies = visible_pharmacies.distinct()
        qs = MembershipApplication.objects.filter(pharmacy__in=visible_pharmacies).order_by('-submitted_at')
        status_q = self.request.query_params.get('status')
        return qs.filter(status=status_q) if status_q else qs

    def perform_update(self, serializer):
        before = list(getattr(serializer.instance, "review_changes", None) or [])
        application = serializer.save()
        after = list(getattr(application, "review_changes", None) or [])
        new_changes = after[len(before):] if len(after) >= len(before) else []
        if new_changes:
            app_id = application.id
            transaction.on_commit(lambda: async_task(
                'client_profile.tasks.email_membership_application_review_updated',
                app_id,
                new_changes,
            ))

    @action(detail=True, methods=['post'], url_path='award-preview')
    def award_preview(self, request, pk=None):
        app = self.get_object()
        if app.category != 'FULL_PART_TIME':
            return Response(
                {'detail': 'Award preview is only available for pharmacy-staff applications.'},
                status=status.HTTP_400_BAD_REQUEST,
            )

        employment_type = str(request.data.get('employment_type') or 'CASUAL').upper()
        if employment_type not in {'FULL_TIME', 'PART_TIME', 'CASUAL'}:
            return Response(
                {'employment_type': ['Choose FULL_TIME, PART_TIME or CASUAL.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        classification = str(
            request.data.get('award_classification')
            or app.pharmacist_award_level
            or app.otherstaff_classification_level
            or app.intern_half
            or app.student_year
            or ''
        ).upper()
        effective_from_raw = request.data.get('effective_from') or str(timezone.localdate())
        try:
            effective_from = date.fromisoformat(str(effective_from_raw))
        except (TypeError, ValueError):
            return Response(
                {'effective_from': ['Use YYYY-MM-DD.']},
                status=status.HTTP_400_BAD_REQUEST,
            )

        from workforce.award_rates import classification_options, resolve_award_schedule

        try:
            resolved = resolve_award_schedule(
                role=app.role,
                classification=classification,
                employment_type=employment_type,
                date_of_birth=app.date_of_birth,
                as_of=effective_from,
            )
        except DjangoValidationError as exc:
            return Response(
                getattr(exc, 'message_dict', {'detail': exc.messages}),
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({
            **resolved,
            'classification_options': classification_options(app.role),
            'default_classification': classification,
            'payroll_enabled': bool(app.pharmacy.use_chemisttasker_payroll),
        })


    @action(detail=True, methods=['post'])
    def approve(self, request, pk=None):
        app = self.get_object()
        user = request.user
        pharm_id = app.pharmacy_id
        is_org_admin = OrganizationMembership.objects.filter(
            user=user,
            role='ORG_ADMIN',
            organization_id=app.pharmacy.organization_id,
        ).exists()
        is_owner = Pharmacy.objects.filter(id=pharm_id, owner__user=user).exists()
        can_manage_staff = has_admin_capability(user, app.pharmacy, CAPABILITY_MANAGE_STAFF)
        if not (is_org_admin or is_owner or can_manage_staff):
            return Response({'detail': 'Not allowed to approve for this pharmacy.'}, status=403)

        allowed_ftpt = {'FULL_TIME', 'PART_TIME', 'CASUAL'}
        allowed_fav = {'LOCUM', 'SHIFT_HERO'}
        raw_employment_type = request.data.get('employment_type')
        req_emp = str(raw_employment_type or '').strip().upper()
        if app.category == 'FULL_PART_TIME':
            if raw_employment_type not in (None, '') and req_emp not in allowed_ftpt:
                return Response(
                    {'employment_type': ['Choose FULL_TIME, PART_TIME or CASUAL.']},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            employment_type = req_emp or 'CASUAL'
        else:
            if raw_employment_type not in (None, '') and req_emp not in allowed_fav:
                return Response(
                    {'employment_type': ['Choose LOCUM or SHIFT_HERO.']},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            employment_type = req_emp or (
                'LOCUM' if app.role == 'PHARMACIST' else 'SHIFT_HERO'
            )

        payroll_terms = request.data.get('employment_engagement')
        payroll_required = bool(
            app.category == 'FULL_PART_TIME'
            and app.pharmacy.use_chemisttasker_payroll
        )

        if app.category == 'FULL_PART_TIME':
            from memberships.serializers import _application_payment_profile_status
            payment_profile = _application_payment_profile_status(app)
            if payment_profile.get('payment_preference') != 'TFN':
                return Response(
                    {
                        'payment_profile': [
                            'Pharmacy staff are employees and must use the TFN pathway in their private ChemistTasker worker profile before approval.'
                        ],
                        'payment_profile_status': payment_profile,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )
            if payroll_required and not payment_profile.get('payroll_ready'):
                return Response(
                    {
                        'payment_profile': [
                            'ChemistTasker Payroll is enabled. The worker must complete TFN and super setup in their private profile before final approval.'
                        ],
                        'payment_profile_status': payment_profile,
                    },
                    status=status.HTTP_400_BAD_REQUEST,
                )

        if payroll_required and not isinstance(payroll_terms, dict):
            return Response(
                {
                    'employment_engagement': [
                        'ChemistTasker Payroll is enabled. Add the initial employment terms before approving this staff application.'
                    ]
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        email = clean_email((app.email or '').strip().lower())
        if not email:
            return Response({'email': ['Application email is required.']}, status=status.HTTP_400_BAD_REQUEST)

        employment_engagement_public_id = None
        try:
            with transaction.atomic():
                app = (
                    MembershipApplication.objects
                    .select_for_update()
                    .select_related('pharmacy')
                    .get(pk=app.pk)
                )
                if app.status != 'PENDING':
                    return Response({'detail': f'Already {app.status.lower()}.'}, status=400)

                existing_worker = User.objects.filter(email__iexact=email).first()
                user_existed_before_approval = existing_worker is not None
                if existing_worker:
                    onboarding = (
                        PharmacistOnboarding.objects.filter(user=existing_worker).first()
                        if app.role == 'PHARMACIST'
                        else OtherStaffOnboarding.objects.filter(user=existing_worker).first()
                    )
                    existing_dob = getattr(onboarding, 'date_of_birth', None) if onboarding else None
                    if existing_dob and existing_dob != app.date_of_birth:
                        raise DjangoValidationError({
                            'date_of_birth': ['Application date of birth does not match the worker onboarding profile.']
                        })

                data = {
                    'email': email,
                    'pharmacy': app.pharmacy_id,
                    'role': app.role,
                    'employment_type': employment_type,
                    'invited_name': f'{app.first_name} {app.last_name}'.strip(),
                    'job_title': app.job_title if app.job_title else '',
                    'pharmacist_award_level': app.pharmacist_award_level,
                    'otherstaff_classification_level': app.otherstaff_classification_level,
                    'intern_half': app.intern_half,
                    'student_year': app.student_year,
                    'activate_immediately': True,
                    'source_application_id': app.id,
                }

                membership, error = MembershipViewSet()._create_membership_invite(
                    data,
                    inviter=request.user,
                )
                if error:
                    raise DjangoValidationError({'detail': [error]})

                worker_user = membership.user
                if not user_existed_before_approval:
                    worker_user.first_name = app.first_name.strip()
                    worker_user.last_name = app.last_name.strip()
                    worker_user.username = (app.username or '').strip()
                    worker_user.mobile_number = (app.mobile_number or '').strip()
                    worker_user.save(
                        update_fields=['first_name', 'last_name', 'username', 'mobile_number']
                    )

                onboarding = (
                    PharmacistOnboarding.objects.filter(user=worker_user).first()
                    if app.role == 'PHARMACIST'
                    else OtherStaffOnboarding.objects.filter(user=worker_user).first()
                )
                if onboarding and not onboarding.date_of_birth:
                    onboarding.date_of_birth = app.date_of_birth
                    onboarding.save(update_fields=['date_of_birth'])

                if payroll_required:
                    from workforce.employment_engagement_service import build_employment_engagement_payload
                    from workforce.models import EmploymentEngagement

                    engagement_data = dict(payroll_terms)
                    engagement_data.setdefault('employment_type', employment_type)
                    engagement_data.setdefault('job_title', app.job_title or '')
                    engagement_data.setdefault(
                        'award_classification',
                        app.pharmacist_award_level
                        or app.otherstaff_classification_level
                        or app.intern_half
                        or app.student_year
                        or '',
                    )
                    engagement_data.setdefault('pay_basis', 'AWARD')

                    effective_from_raw = engagement_data.get('effective_from') or str(timezone.localdate())
                    try:
                        effective_from = date.fromisoformat(str(effective_from_raw))
                    except (TypeError, ValueError) as exc:
                        raise DjangoValidationError({
                            'effective_from': ['Use YYYY-MM-DD for the employment terms effective date.']
                        }) from exc

                    effective_to_raw = engagement_data.get('effective_to')
                    effective_to = None
                    if effective_to_raw:
                        try:
                            effective_to = date.fromisoformat(str(effective_to_raw))
                        except (TypeError, ValueError) as exc:
                            raise DjangoValidationError({
                                'effective_to': ['Use YYYY-MM-DD for the employment terms end date.']
                            }) from exc

                    engagement_payload = build_employment_engagement_payload(
                        engagement_data,
                        membership,
                        effective_from=effective_from,
                        effective_to=effective_to,
                    )
                    engagement = EmploymentEngagement(
                        membership=membership,
                        effective_from=effective_from,
                        effective_to=effective_to,
                        created_by=request.user,
                        updated_by=request.user,
                        **engagement_payload,
                    )
                    engagement.full_clean()
                    engagement.save()
                    employment_engagement_public_id = str(engagement.public_id)

                app.status = 'APPROVED'
                app.decided_at = timezone.now()
                app.decided_by = request.user
                app.approved_membership = membership
                app.pending_identity_key = None
                app.save(update_fields=[
                    'status',
                    'decided_at',
                    'decided_by',
                    'approved_membership',
                    'pending_identity_key',
                ])
                transaction.on_commit(
                    lambda app_id=app.id: async_task(
                        'client_profile.tasks.email_membership_application_approved',
                        app_id,
                    )
                )
        except DjangoValidationError as exc:
            return Response(
                getattr(exc, 'message_dict', {'detail': exc.messages}),
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response({
            'status': 'approved',
            'membership_id': membership.id,
            'employment_engagement_public_id': employment_engagement_public_id,
            'payroll_enabled': bool(app.pharmacy.use_chemisttasker_payroll),
        }, status=200)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        visible_app = self.get_object()
        user = request.user
        pharm_id = visible_app.pharmacy_id
        is_org_admin = OrganizationMembership.objects.filter(
            user=user,
            role='ORG_ADMIN',
            organization_id=visible_app.pharmacy.organization_id,
        ).exists()
        is_owner = Pharmacy.objects.filter(id=pharm_id, owner__user=user).exists()
        can_manage_staff = has_admin_capability(user, visible_app.pharmacy, CAPABILITY_MANAGE_STAFF)
        if not (is_org_admin or is_owner or can_manage_staff):
            return Response({'detail': 'Not allowed to reject for this pharmacy.'}, status=403)

        with transaction.atomic():
            app = MembershipApplication.objects.select_for_update().get(pk=visible_app.pk)
            if app.status != 'PENDING':
                return Response({'detail': f'Already {app.status.lower()}.'}, status=400)
            app.status = 'REJECTED'
            app.decided_at = timezone.now()
            app.decided_by = request.user
            app.pending_identity_key = None
            app.save(update_fields=['status', 'decided_at', 'decided_by', 'pending_identity_key'])
            transaction.on_commit(
                lambda app_id=app.id: async_task(
                    'client_profile.tasks.email_membership_application_rejected',
                    app_id,
                )
            )
        return Response({'status': 'rejected'}, status=200)


class MyMembershipsViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MembershipSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        # Ensure owners always retain an active OWNER membership for their pharmacies.
        if hasattr(user, 'owneronboarding'):
            owned_pharmacies = Pharmacy.objects.filter(owner=user.owneronboarding)
            for pharmacy in owned_pharmacies:
                membership, created = Membership.objects.get_or_create(
                    user=user,
                    pharmacy=pharmacy,
                    defaults={
                        'role': 'OWNER',
                        'employment_type': 'FULL_TIME',
                        'is_active': True,
                        'status': Membership.Status.ACCEPTED,
                        'invited_by': user,
                    }
                )
                if not created:
                    updated = False
                    if membership.role != 'OWNER':
                        membership.role = 'OWNER'
                        updated = True
                    if not membership.is_active:
                        membership.is_active = True
                        updated = True
                    if membership.status != Membership.Status.ACCEPTED:
                        membership.status = Membership.Status.ACCEPTED
                        updated = True
                    if updated:
                        membership.save(update_fields=['role', 'is_active', 'status'])
        return (
            Membership.objects.filter(user=user)
            .filter(status__in=[Membership.Status.PENDING, Membership.Status.ACCEPTED])
            .select_related('pharmacy', 'user', 'invited_by', 'pharmacy__organization')
            .order_by('-created_at')
        )

    def _get_owned_membership(self, pk):
        return get_object_or_404(Membership, pk=pk, user=self.request.user)

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        membership = self._get_owned_membership(pk)
        if membership.status != Membership.Status.PENDING:
            return Response({'detail': 'Only pending invitations can be accepted.'}, status=status.HTTP_400_BAD_REQUEST)
        active_count = _count_active_memberships(request.user, exclude_membership_id=membership.pk)
        if active_count >= MAX_ACTIVE_PHARMACY_MEMBERSHIPS:
            return Response(
                {'detail': f'You already belong to {MAX_ACTIVE_PHARMACY_MEMBERSHIPS} pharmacies.'},
                status=status.HTTP_400_BAD_REQUEST,
            )
        membership.status = Membership.Status.ACCEPTED
        membership.is_active = True
        membership.responded_at = timezone.now()
        membership.save(update_fields=['status', 'is_active', 'responded_at', 'updated_at'])
        PharmacyAdmin.objects.filter(membership=membership).update(
            is_active=True,
            updated_at=timezone.now(),
        )
        transaction.on_commit(
            lambda membership_id=membership.id: _notify_membership_response(
                Membership.objects.select_related("user", "pharmacy", "invited_by").get(id=membership_id),
                Membership.Status.ACCEPTED,
            )
        )
        return Response(self.get_serializer(membership).data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        membership = self._get_owned_membership(pk)
        if membership.status != Membership.Status.PENDING:
            return Response({'detail': 'Only pending invitations can be rejected.'}, status=status.HTTP_400_BAD_REQUEST)
        membership.status = Membership.Status.REJECTED
        membership.is_active = False
        membership.responded_at = timezone.now()
        membership.save(update_fields=['status', 'is_active', 'responded_at', 'updated_at'])
        PharmacyAdmin.objects.filter(membership=membership).update(
            is_active=False,
            updated_at=timezone.now(),
        )
        transaction.on_commit(
            lambda membership_id=membership.id: _notify_membership_response(
                Membership.objects.select_related("user", "pharmacy", "invited_by").get(id=membership_id),
                Membership.Status.REJECTED,
            )
        )
        return Response({'status': 'rejected'})

    @action(detail=True, methods=['post'])
    def quit(self, request, pk=None):
        membership = self._get_owned_membership(pk)
        if membership.status != Membership.Status.ACCEPTED or not membership.is_active:
            return Response({'detail': 'Only active memberships can be quit.'}, status=status.HTTP_400_BAD_REQUEST)
        if membership.role == 'OWNER' or getattr(getattr(membership.pharmacy, 'owner', None), 'user_id', None) == request.user.id:
            return Response({'detail': 'Pharmacy owners cannot quit their owner membership.'}, status=status.HTTP_400_BAD_REQUEST)
        membership.status = Membership.Status.LEFT
        membership.is_active = False
        membership.responded_at = timezone.now()
        membership.save(update_fields=['status', 'is_active', 'responded_at', 'updated_at'])
        PharmacyAdmin.objects.filter(membership=membership).update(
            is_active=False,
            updated_at=timezone.now(),
        )
        transaction.on_commit(
            lambda membership_id=membership.id: _notify_membership_response(
                Membership.objects.select_related("user", "pharmacy", "invited_by").get(id=membership_id),
                Membership.Status.LEFT,
            )
        )
        return Response({'status': 'left'})
