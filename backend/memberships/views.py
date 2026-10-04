"""Membership API: memberships, invite links, magic-link information, applications and a user's own memberships."""
from rest_framework import permissions, status, viewsets
from memberships.models import Membership, MembershipApplication, MembershipInviteLink  # noqa: F401  (MembershipApplication: ownership contract)
from organizations.models import (
    Pharmacy,
    PharmacyAdmin,
)
from rest_framework.response import Response
from rest_framework.exceptions import ValidationError as DRFValidationError
from rest_framework.views import APIView
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.decorators import action
from django.shortcuts import get_object_or_404
from django.utils import timezone
from users.normalization import sanitize_email_text as clean_email
from core.task_queue import async_task
from datetime import date
from django.db import transaction
from django.db.models.deletion import ProtectedError
from datetime import timedelta
from users.models import User
from memberships.serializers import (
    _count_active_memberships,
    MAX_ACTIVE_PHARMACY_MEMBERSHIPS,
    MembershipApplicationReviewSerializer,
    MembershipApplicationSerializer,
    MembershipInviteLinkSerializer,
    MembershipSerializer,
)
from memberships.access import (  # noqa: F401  (historical import path of the invite rule)
    user_can_change_membership,
    user_can_invite_members_to_pharmacy,
    user_can_invite_members_to_pharmacy as _user_can_invite_members_to_pharmacy,
)
from memberships.applications import ApplicationRefused, approve_application, reject_application
from memberships.invites import bulk_invite, create_membership_invite
from memberships.notifications import (  # noqa: F401  (historical import path of the notification helpers)
    _format_membership_person,
    _frontend_base_url_for_notifications,
    _membership_controller_users,
    _notify_membership_invitation_sent,
    _notify_membership_response,
    _pharmacy_membership_manage_url,
    _worker_membership_url,
)
from memberships.selectors import own_memberships, visible_applications, visible_invite_links, visible_memberships
import logging

logger = logging.getLogger(__name__)


















class MembershipViewSet(viewsets.ModelViewSet):
    """
    CRUD and listing for Membership. Listings scoped to pharmacies
    the user owns or administrates.
    """
    serializer_class = MembershipSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return visible_memberships(self.request.user, self.request.query_params)


    def check_object_permissions(self, request, obj):
        if not user_can_change_membership(request.user, obj):
            self.permission_denied(request, message="Not allowed to modify this membership.")

    def perform_update(self, serializer):
        """Serialize generic reactivation against the cross-pharmacy membership cap.

        DRF validates before perform_update(), so the serializer's normal cap
        check alone can race across two pharmacies. Re-check the activation
        transition under the same user -> membership lock order used by worker
        self-acceptance.
        """
        original = serializer.instance
        with transaction.atomic():
            User.objects.select_for_update().only("pk").get(pk=original.user_id)
            locked = Membership.objects.select_for_update().get(pk=original.pk)

            will_be_active = serializer.validated_data.get("is_active", locked.is_active)
            if will_be_active and not locked.is_active:
                active_count = _count_active_memberships(
                    locked.user,
                    exclude_membership_id=locked.pk,
                )
                if active_count >= MAX_ACTIVE_PHARMACY_MEMBERSHIPS:
                    raise DRFValidationError({
                        "is_active": f"User already belongs to {MAX_ACTIVE_PHARMACY_MEMBERSHIPS} pharmacies."
                    })

            serializer.instance = locked
            serializer.save()


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

    def _create_membership_invite(self, data, inviter):
        """Historical entry point: owned by memberships.invites."""
        return create_membership_invite(data, inviter, request=getattr(self, 'request', None))


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

        if not user_can_invite_members_to_pharmacy(inviter, target_pharmacy):
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

        results, errors = bulk_invite(invitations, inviter, request=request)

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
        return visible_invite_links(self.request.user, self.request.query_params)

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

        if not user_can_invite_members_to_pharmacy(user, target_pharmacy):
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
        return visible_applications(self.request.user, self.request.query_params)

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
        try:
            body = approve_application(self.get_object(), decided_by=request.user, data=request.data)
        except ApplicationRefused as refusal:
            return Response(refusal.body, status=refusal.status)
        return Response(body, status=200)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        try:
            body = reject_application(self.get_object(), decided_by=request.user)
        except ApplicationRefused as refusal:
            return Response(refusal.body, status=refusal.status)
        return Response(body, status=200)


class MyMembershipsViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = MembershipSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return own_memberships(self.request.user)

    def _get_owned_membership(self, pk, *, for_update=False):
        queryset = Membership.objects
        if for_update:
            queryset = queryset.select_for_update()
        return get_object_or_404(queryset, pk=pk, user=self.request.user)

    @action(detail=True, methods=['post'])
    def accept(self, request, pk=None):
        with transaction.atomic():
            # One worker row coordinates the membership-cap check across every
            # pharmacy. Lock it before the specific invite to give all writers
            # the same user -> membership lock order.
            User.objects.select_for_update().only("pk").get(pk=request.user.pk)
            membership = self._get_owned_membership(pk, for_update=True)
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
            response_data = self.get_serializer(membership).data
        return Response(response_data)

    @action(detail=True, methods=['post'])
    def reject(self, request, pk=None):
        with transaction.atomic():
            membership = self._get_owned_membership(pk, for_update=True)
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
        with transaction.atomic():
            membership = self._get_owned_membership(pk, for_update=True)
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
