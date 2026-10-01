"""Moved verbatim from client_profile/views.py (Stage 2 domain split). Behaviour is unchanged; client_profile/views.py re-exports these names."""
from rest_framework import mixins, permissions, status, viewsets
from client_profile.models import Membership, OwnerOnboarding, Pharmacy, PharmacyAdmin, PharmacyClaim
from notifications.models import Notification
from django.core.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied
from django.db.models import Q
from django.utils import timezone
from client_profile.utils import clean_email, get_frontend_dashboard_url
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from django.conf import settings
from core.task_queue import async_task
from client_profile.domains.common.access import _collect_org_access_scope
from django.db import transaction
from users.models import OrganizationMembership, User
from users.utils import build_org_invite_context
import re
from client_profile.domains.orgs.serializers import (
    PharmacyClaimCreateSerializer,
    PharmacyClaimSerializer,
    PharmacySerializer,
)


def _build_owner_claims_url(owner_user):
    base_url = get_frontend_dashboard_url(owner_user)
    if not base_url.endswith('/'):
        base_url = f"{base_url}/"
    return f"{base_url}claim-requests"


def _build_org_claims_url():
    return f"{settings.FRONTEND_BASE_URL}/dashboard/organization/claim"


def _create_owner_claim_notification(claim):
    owner_profile = getattr(claim.pharmacy, "owner", None)
    owner_user = getattr(owner_profile, "user", None)
    if not owner_user:
        return

    action_url = _build_owner_claims_url(owner_user)
    title = f"{claim.organization.name} wants to manage {claim.pharmacy.name}"
    body = claim.message or "Please review this organization claim request."
    Notification.objects.create(
        user=owner_user,
        type=Notification.Type.ALERT,
        title=title,
        body=body,
        action_url=action_url,
        payload={
            "claim_id": claim.id,
            "pharmacy_id": claim.pharmacy_id,
            "organization_id": claim.organization_id,
        },
    )


def _send_owner_claim_email(claim):
    owner_profile = getattr(claim.pharmacy, "owner", None)
    owner_user = getattr(owner_profile, "user", None)
    if not owner_user or not owner_user.email:
        return

    action_url = _build_owner_claims_url(owner_user)
    subject = f"{claim.organization.name} wants to claim {claim.pharmacy.name}"
    context = {
        "owner_name": owner_user.get_full_name() or owner_user.email,
        "pharmacy_name": claim.pharmacy.name,
        "organization_name": claim.organization.name,
        "message": claim.message or "",
        "action_url": action_url,
    }
    email_kwargs = {
        "subject": subject,
        "recipient_list": [owner_user.email],
        "template_name": "emails/pharmacy_claim_request.html",
        "text_template": "emails/pharmacy_claim_request.txt",
        "context": context,
    }
    async_task("users.tasks.send_async_email", **email_kwargs)


def _send_pharmacy_created_email(pharmacy, created_by_user, organization=None):
    pharmacy_email = clean_email(getattr(pharmacy, "email", "") or "")
    if not pharmacy_email:
        return

    if organization and getattr(organization, "name", None):
        creator_name = organization.name
    else:
        creator_name = created_by_user.get_full_name() or created_by_user.email or created_by_user.username or "A ChemistTasker user"

    context = {
        "pharmacy_name": pharmacy.name,
        "creator_name": creator_name,
        "contact_email": "info@chemisttasker.com.au",
    }
    async_task(
        "users.tasks.send_async_email",
        subject=f"{pharmacy.name} was added to ChemistTasker",
        recipient_list=[pharmacy_email],
        template_name="emails/pharmacy_created_notification.html",
        text_template="emails/pharmacy_created_notification.txt",
        context=context,
    )


def _notify_org_of_claim_response(claim):
    admins = OrganizationMembership.objects.filter(
        organization_id=claim.organization_id,
        role="ORG_ADMIN",
    ).select_related("user")
    recipients = []
    action_url = _build_org_claims_url()
    title = f"{claim.pharmacy.name} claim {claim.get_status_display()}"
    body = (
        claim.response_message
        or f"{claim.pharmacy.owner.user.get_full_name() if getattr(claim.pharmacy.owner, 'user', None) else 'The owner'} responded to your claim."
    )
    for membership in admins:
        user = membership.user
        if not user:
            continue
        if user.email:
            recipients.append(user.email)
        Notification.objects.create(
            user=user,
            type=Notification.Type.ALERT,
            title=title,
            body=body,
            action_url=action_url,
            payload={
                "claim_id": claim.id,
                "pharmacy_id": claim.pharmacy_id,
                "status": claim.status,
            },
        )
    if not recipients:
        return
    owner_user = getattr(getattr(claim.pharmacy, "owner", None), "user", None)
    owner_display = owner_user.get_full_name() or owner_user.email if owner_user else "The owner"
    context = {
        "organization_name": claim.organization.name,
        "pharmacy_name": claim.pharmacy.name,
        "status_display": claim.get_status_display(),
        "response_message": claim.response_message or "",
        "owner_name": owner_display,
        "action_url": action_url,
    }
    email_kwargs = {
        "subject": f"{claim.pharmacy.name} claim {claim.get_status_display()}",
        "recipient_list": sorted(set(recipients)),
        "template_name": "emails/pharmacy_claim_response.html",
        "text_template": "emails/pharmacy_claim_response.txt",
        "context": context,
    }
    async_task("users.tasks.send_async_email", **email_kwargs)


class OwnerOnboardingClaim(APIView):
    """
    Organization admin endpoint to request a pharmacy claim (per pharmacy, not per owner).
    """
    permission_classes = [permissions.IsAuthenticated]

    def _generate_placeholder_name(self, email: str) -> str:
        local_part = (email.split('@')[0] if email else '').strip()
        cleaned = re.sub(r'[^A-Za-z0-9]+', ' ', local_part).strip()
        if not cleaned:
            cleaned = 'New'
        name = f"{cleaned.title()} Pharmacy"
        return name[:120]

    def _ensure_org_user_account(self, email: str):
        user, created = User.objects.get_or_create(
            email=email,
            defaults={'role': 'ORG_STAFF'}
        )
        temp_password = None
        if created:
            user.set_unusable_password()
            user.save(update_fields=['password'])
        return user, temp_password

    def _ensure_scoped_chief_admin_membership(self, user, organization, pharmacy):
        membership_defaults = {
            'role': 'CHIEF_ADMIN',
            'admin_level': PharmacyAdmin.AdminLevel.MANAGER,
            'job_title': 'Pharmacy Onboarding Admin',
        }
        membership, _created = OrganizationMembership.objects.get_or_create(
            user=user,
            organization=organization,
            defaults=membership_defaults,
        )
        update_fields = set()
        if membership.role != 'CHIEF_ADMIN':
            membership.role = 'CHIEF_ADMIN'
            update_fields.add('role')
        if membership.admin_level != PharmacyAdmin.AdminLevel.MANAGER:
            membership.admin_level = PharmacyAdmin.AdminLevel.MANAGER
            update_fields.add('admin_level')
        if not membership.job_title:
            membership.job_title = 'Pharmacy Onboarding Admin'
            update_fields.add('job_title')
        if update_fields:
            membership.save(update_fields=list(update_fields))
        if not membership.pharmacies.filter(pk=pharmacy.pk).exists():
            membership.pharmacies.add(pharmacy)
        return membership

    def _send_org_invite_email(self, user, organization, pharmacy, inviter, temp_password=None):
        uid = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        frontend_url = settings.FRONTEND_BASE_URL
        magic_link = f"{frontend_url}/reset-password/{uid}/{token}/"

        membership = (
            OrganizationMembership.objects.select_related("organization")
            .prefetch_related("pharmacies")
            .filter(user=user, organization=organization)
            .first()
        )

        invitation_context = build_org_invite_context(
            membership=membership,
            inviter=inviter,
            magic_link=magic_link,
            dashboard_link=f"{frontend_url}/dashboard/organization/overview",
            temp_password=temp_password,
        )

        async_task(
            'users.tasks.send_async_email',
            subject=f"You've been invited to join {organization.name} on ChemistTasker",
            recipient_list=[user.email],
            template_name="emails/org_invite_new_user.html",
            context=invitation_context,
            text_template="emails/org_invite_new_user.txt",
        )

    def _bootstrap_pharmacy_for_email(self, email, organization, request):
        placeholder_name = self._generate_placeholder_name(email)
        with transaction.atomic():
            pharmacy = Pharmacy.objects.create(
                name=placeholder_name,
                email=email,
                organization=organization,
                verified=False,
            )
            user, temp_password = self._ensure_org_user_account(email)
            membership = self._ensure_scoped_chief_admin_membership(user, organization, pharmacy)
            pharmacy_membership, _ = Membership.objects.get_or_create(
                user=user,
                pharmacy=pharmacy,
                defaults={
                    'role': 'OWNER',
                    'employment_type': 'FULL_TIME',
                    'is_active': True,
                    'invited_by': request.user,
                }
            )
            PharmacyAdmin.objects.update_or_create(
                user=user,
                pharmacy=pharmacy,
                defaults={
                    'membership': pharmacy_membership,
                    'admin_level': PharmacyAdmin.AdminLevel.OWNER,
                    'staff_role': 'OTHER',
                    'is_active': True,
                    'created_by': request.user,
                }
            )
        self._send_org_invite_email(user, organization, pharmacy, request.user, temp_password=temp_password)
        serialized = PharmacySerializer(pharmacy, context={'request': request}).data
        return {
            'detail': 'Pharmacy created and invitation sent.',
            'pharmacy': serialized,
            'user_id': user.id,
            # return both: org-scoped membership and pharmacy ownership membership
            'organization_membership_id': membership.id,
            'pharmacy_membership_id': pharmacy_membership.id,
        }

    def post(self, request):
        membership = request.user.organization_memberships.filter(
            role='ORG_ADMIN'
        ).select_related('organization').first()
        if not membership:
            return Response(
                {'detail': 'Not an Org-Admin.'},
                status=status.HTTP_403_FORBIDDEN,
            )

        serializer = PharmacyClaimCreateSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        validated = serializer.validated_data

        message = validated.get('message') or ''
        pharmacy = None
        org = membership.organization

        if validated.get('pharmacy_id'):
            pharmacy = Pharmacy.objects.select_related('owner__user').filter(pk=validated['pharmacy_id']).first()
            if not pharmacy:
                return Response({'detail': 'Pharmacy not found.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            cleaned = clean_email(validated.get('pharmacy_email', ''))
            if not cleaned:
                return Response({'detail': 'Valid pharmacy_email is required.'}, status=status.HTTP_400_BAD_REQUEST)
            try:
                pharmacy = Pharmacy.objects.select_related('owner__user').get(email__iexact=cleaned)
            except Pharmacy.DoesNotExist:
                payload = self._bootstrap_pharmacy_for_email(cleaned, org, request)
                return Response(payload, status=status.HTTP_201_CREATED)

        if not pharmacy.owner_id:
            return Response({'detail': 'Pharmacy does not have an owner profile yet.'}, status=status.HTTP_400_BAD_REQUEST)

        if pharmacy.organization_id and pharmacy.organization_id != org.id:
            return Response(
                {'detail': 'Pharmacy is already managed by another organization.'},
                status=status.HTTP_409_CONFLICT,
            )

        existing_active = PharmacyClaim.objects.filter(
            pharmacy=pharmacy,
            status__in=[PharmacyClaim.Status.PENDING, PharmacyClaim.Status.ACCEPTED],
        ).exclude(organization=org)
        if existing_active.exists():
            return Response(
                {'detail': 'Pharmacy already has an active claim.'},
                status=status.HTTP_409_CONFLICT,
            )

        active_claim = PharmacyClaim.objects.filter(
            pharmacy=pharmacy,
            organization=org,
            status__in=[PharmacyClaim.Status.PENDING, PharmacyClaim.Status.ACCEPTED],
        ).first()
        if active_claim:
            return Response(
                PharmacyClaimSerializer(active_claim, context={'request': request}).data,
                status=status.HTTP_200_OK,
            )

        claim = PharmacyClaim.objects.create(
            pharmacy=pharmacy,
            organization=org,
            requested_by=request.user,
            message=message,
        )
        _create_owner_claim_notification(claim)
        _send_owner_claim_email(claim)

        return Response(
            PharmacyClaimSerializer(claim, context={'request': request}).data,
            status=status.HTTP_201_CREATED,
        )


class PharmacyClaimViewSet(mixins.ListModelMixin,
                           mixins.RetrieveModelMixin,
                           mixins.UpdateModelMixin,
                           viewsets.GenericViewSet):
    serializer_class = PharmacyClaimSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        user = self.request.user
        base_qs = PharmacyClaim.objects.select_related(
            'pharmacy',
            'pharmacy__owner',
            'pharmacy__owner__user',
            'organization',
            'requested_by',
            'responded_by',
        )
        full_org_ids, scoped_org_map = _collect_org_access_scope(user)
        scoped_pharmacy_ids = set()
        for ids in scoped_org_map.values():
            scoped_pharmacy_ids.update(ids)

        accessible_filter = Q()
        if full_org_ids:
            accessible_filter |= Q(organization_id__in=full_org_ids)
        for org_id, pharmacy_ids in scoped_org_map.items():
            if pharmacy_ids:
                accessible_filter |= Q(organization_id=org_id, pharmacy_id__in=pharmacy_ids)
        owner_profile = OwnerOnboarding.objects.filter(user=user).first()

        params = self.request.query_params
        def _is_truthy(value):
            return str(value).lower() in {'1', 'true', 'yes', 'on'}

        filters = Q()
        owned_by_me = params.get('owned_by_me')
        if owned_by_me is not None and _is_truthy(owned_by_me):
            if owner_profile:
                filters |= Q(pharmacy__owner_id=owner_profile.id)
        else:
            if accessible_filter:
                filters |= accessible_filter
            if owner_profile:
                filters |= Q(pharmacy__owner_id=owner_profile.id)

        if not filters:
            return base_qs.none()

        qs = base_qs.filter(filters)

        status_params = params.getlist('status')
        if not status_params:
            single_status = params.get('status')
            if single_status:
                status_params = [single_status]
        if status_params:
            normalized = {status.strip().upper() for status in status_params if status}
            valid_statuses = [s for s in normalized if s in PharmacyClaim.Status.values]
            if valid_statuses:
                qs = qs.filter(status__in=valid_statuses)
            else:
                qs = qs.none()

        org_filter = params.get('organization')
        if org_filter:
            try:
                org_filter_id = int(org_filter)
            except (TypeError, ValueError):
                qs = qs.none()
            else:
                if org_filter_id in full_org_ids:
                    qs = qs.filter(organization_id=org_filter_id)
                elif org_filter_id in scoped_org_map:
                    allowed_ids = scoped_org_map.get(org_filter_id, set())
                    if allowed_ids:
                        qs = qs.filter(organization_id=org_filter_id, pharmacy_id__in=allowed_ids)
                    else:
                        qs = qs.none()
                else:
                    qs = qs.none()

        pharmacy_filter = params.get('pharmacy')
        if pharmacy_filter:
            try:
                pharmacy_id = int(pharmacy_filter)
            except (TypeError, ValueError):
                qs = qs.none()
            else:
                pharmacy = Pharmacy.objects.filter(id=pharmacy_id).only('organization_id').first()
                if not pharmacy:
                    qs = qs.none()
                else:
                    org_id = pharmacy.organization_id
                    allowed = False
                    if org_id in full_org_ids:
                        allowed = True
                    elif org_id in scoped_org_map and pharmacy_id in scoped_org_map[org_id]:
                        allowed = True
                    elif owner_profile and Pharmacy.objects.filter(owner=owner_profile, id=pharmacy_id).exists():
                        allowed = True

                    if allowed:
                        qs = qs.filter(pharmacy_id=pharmacy_id)
                    else:
                        qs = qs.none()

        return qs.order_by('-created_at')

    def partial_update(self, request, *args, **kwargs):
        claim = self.get_object()
        owner_profile = OwnerOnboarding.objects.filter(user=request.user).select_related('user').first()
        if not owner_profile or claim.pharmacy.owner_id != owner_profile.id:
            raise PermissionDenied("Only the pharmacy owner can respond to this claim.")

        if claim.status != PharmacyClaim.Status.PENDING:
            raise ValidationError({'detail': 'Only pending claims can be updated.'})

        status_value = request.data.get('status')
        if status_value not in [PharmacyClaim.Status.ACCEPTED, PharmacyClaim.Status.REJECTED]:
            raise ValidationError({'status': 'Status must be ACCEPTED or REJECTED.'})

        response_message = request.data.get('response_message', '')

        impacted_ids = []
        with transaction.atomic():
            if status_value == PharmacyClaim.Status.ACCEPTED:
                impacted_ids = self._accept_claim(claim, request.user, response_message)
            else:
                impacted_ids = self._reject_claim(claim, request.user, response_message)

        impacted_ids = list(dict.fromkeys(impacted_ids or []))

        def trigger_notification():
            for claim_id in impacted_ids:
                refreshed = PharmacyClaim.objects.select_related(
                    'pharmacy',
                    'pharmacy__owner',
                    'pharmacy__owner__user',
                    'organization',
                ).get(pk=claim_id)
                _notify_org_of_claim_response(refreshed)

        transaction.on_commit(trigger_notification)

        serializer = self.get_serializer(claim)
        return Response(serializer.data)

    def _accept_claim(self, claim, user, response_message):
        now = timezone.now()
        impacted_ids = [claim.id]

        # Demote any existing accepted claims to keep uniqueness.
        for other in claim.pharmacy.claims.filter(status=PharmacyClaim.Status.ACCEPTED).exclude(pk=claim.pk):
            other.status = PharmacyClaim.Status.REJECTED
            other.response_message = "Superseded by a new organization acceptance."
            other.responded_by = user
            other.responded_at = now
            other.save(update_fields=['status', 'response_message', 'responded_by', 'responded_at', 'updated_at'])
            impacted_ids.append(other.id)

        for pending in claim.pharmacy.claims.filter(status=PharmacyClaim.Status.PENDING).exclude(pk=claim.pk):
            pending.status = PharmacyClaim.Status.REJECTED
            pending.response_message = "Automatically rejected after another organization was accepted."
            pending.responded_by = user
            pending.responded_at = now
            pending.save(update_fields=['status', 'response_message', 'responded_by', 'responded_at', 'updated_at'])
            impacted_ids.append(pending.id)

        claim.status = PharmacyClaim.Status.ACCEPTED
        claim.response_message = response_message
        claim.responded_by = user
        claim.responded_at = now
        claim.save(update_fields=['status', 'response_message', 'responded_by', 'responded_at', 'updated_at'])

        pharmacy = claim.pharmacy
        if pharmacy.organization_id != claim.organization_id:
            pharmacy.organization = claim.organization
            pharmacy.save(update_fields=['organization'])

        return impacted_ids

    def _reject_claim(self, claim, user, response_message):
        now = timezone.now()

        claim.status = PharmacyClaim.Status.REJECTED
        claim.response_message = response_message
        claim.responded_by = user
        claim.responded_at = now
        claim.save(update_fields=['status', 'response_message', 'responded_by', 'responded_at', 'updated_at'])

        pharmacy = claim.pharmacy
        if pharmacy.organization_id == claim.organization_id:
            pharmacy.organization = None
            pharmacy.save(update_fields=['organization'])
        return [claim.id]
