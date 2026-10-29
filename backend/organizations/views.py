"""Organisation API: organisations, pharmacies, chains and pharmacy admins."""
import hashlib
import json

from django.core.files.uploadedfile import UploadedFile
from rest_framework import permissions, serializers, status, viewsets
from organizations.models import Chain, Organization, Pharmacy, PharmacyAdmin
from organizations.membership_port import membership_operations
from onboarding.models import OwnerOnboarding
from notifications.models import Notification
from users.permissions import AuthenticatedOrganizationMember, IsOwner, OrganizationRolePermission
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import NotFound, PermissionDenied, ValidationError
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework.decorators import action
from organizations.access import (
    CAPABILITY_MANAGE_ADMINS,
    has_admin_capability,
    is_admin_of,
    pharmacies_user_admins,
    user_can_edit_pharmacy_record,
)
from django.shortcuts import get_object_or_404
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from django.db.models import Q
from django.utils import timezone
from django.conf import settings
from core.task_queue import async_task
from core.integrations.abr import _parse_abn_html_fields, abn_lookup
from organizations.access import _get_org_pharmacies_queryset
from django.db import IntegrityError, transaction
from django.contrib.auth import get_user_model
from users.models import OrganizationMembership, User
from users.org_roles import ORG_WIDE_ADMIN_ROLES, membership_capabilities, membership_visible_pharmacy_ids, OrgCapability
from organizations.claims import _send_pharmacy_created_email
from organizations.serializers import (
    ChainSerializer,
    OrganizationSerializer,
    PharmacyAdminSerializer,
    PharmacySerializer,
    PharmacyWithEditSerializer,
    PublicOrganizationSerializer,
)


# Onboardings
class OrganizationViewSet(viewsets.ModelViewSet):
    """
    CRUD for corporate Organizations.
     - LIST/RETRIEVE: any authenticated user
     - CREATE: superusers only
     - UPDATE/DELETE: only organisation-wide admins (Org Admin / Chief Admin) of that org
    """
    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.IsAuthenticated()]
        if self.action == 'create':
            return [permissions.IsAdminUser()]
        # update, partial_update, destroy
        self.required_roles = list(ORG_WIDE_ADMIN_ROLES)
        return [permissions.IsAuthenticated(), OrganizationRolePermission()]

    @transaction.atomic
    def perform_destroy(self, instance):
        from shifts.deletion import protect_pharmacy_shift_deletion

        organization = get_object_or_404(Organization.objects.select_for_update(), pk=instance.pk)
        pharmacy_ids = list(
            Pharmacy.objects.select_for_update().filter(organization=organization)
            .order_by('pk').values_list('pk', flat=True)
        )
        protect_pharmacy_shift_deletion(pharmacy_ids)
        organization.delete()


# Chain, Pharmacy and membership
class PharmacyViewSet(viewsets.ModelViewSet):
    """
    Pharmacy CRUD:
      - Owners manage their own pharmacies.
      - Organization-wide admins manage their organization's pharmacies.
    """
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    queryset = Pharmacy.objects.all()
    serializer_class = PharmacyWithEditSerializer
    permission_classes = [permissions.IsAuthenticated]

    @transaction.atomic
    def perform_destroy(self, instance):
        from shifts.deletion import protect_pharmacy_shift_deletion

        pharmacy = get_object_or_404(Pharmacy.objects.select_for_update(), pk=instance.pk)
        self.check_object_permissions(self.request, pharmacy)
        protect_pharmacy_shift_deletion([pharmacy.pk])
        pharmacy.delete()

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method in permissions.SAFE_METHODS:
            return
        user = request.user
        if IsOwner().has_permission(request, self) or AuthenticatedOrganizationMember().has_permission(request, self):
            return
        self.permission_denied(request)

    def check_object_permissions(self, request, obj):
        if self.action in ['update', 'partial_update', 'destroy']:
            if user_can_edit_pharmacy_record(request.user, obj):
                return
            self.permission_denied(request)
        user = request.user
        # Owner-of-this-pharmacy?
        if obj.owner and obj.owner.user == user:
            return
        # Active pharmacy admin assignment?
        if is_admin_of(user, obj.id):
            return
        org_memberships = request.user.organization_memberships.filter(
            organization_id=obj.organization_id
        ).prefetch_related('pharmacies')
        for membership in org_memberships:
            caps = membership_capabilities(membership)
            if OrgCapability.VIEW_ALL_PHARMACIES in caps:
                return
            visible_ids = membership_visible_pharmacy_ids(membership)
            if obj.id in visible_ids:
                return
        self.permission_denied(request)

    def get_queryset(self):
        user = self.request.user

        # Pharmacies where I am an active Pharmacy Admin
        admin_pharmacies = Pharmacy.objects.filter(
            admin_assignments__user=user,
            admin_assignments__is_active=True
        )
        accessible_ids = set(admin_pharmacies.values_list('id', flat=True))

        org_pharmacies = _get_org_pharmacies_queryset(user)
        accessible_ids.update(org_pharmacies.values_list('id', flat=True))

        owner_ids = []
        try:
            owner = OwnerOnboarding.objects.get(user=user)
        except OwnerOnboarding.DoesNotExist:
            owner = None
        if owner:
            owner_ids = list(Pharmacy.objects.filter(owner=owner).values_list('id', flat=True))
            accessible_ids.update(owner_ids)

        if accessible_ids:
            return Pharmacy.objects.filter(id__in=accessible_ids).select_related('owner').distinct()

        # Fallback to admin assignments if no other visibility applies
        if admin_pharmacies.exists():
            return admin_pharmacies
        if owner:
            return Pharmacy.objects.filter(owner=owner)
        return Pharmacy.objects.none()

    def create(self, request, *args, **kwargs):
        raw_key = request.headers.get('Idempotency-Key')
        if raw_key is None:
            return super().create(request, *args, **kwargs)

        self.idempotency_key = serializers.UUIDField().run_validation(raw_key)
        pharmacy = Pharmacy.objects.filter(idempotency_key=self.idempotency_key).first()
        if pharmacy is not None:
            return self._idempotent_create_response(pharmacy)

        self.idempotency_fingerprint = self._request_fingerprint()
        try:
            with transaction.atomic():
                return super().create(request, *args, **kwargs)
        except IntegrityError:
            # The unique key also protects simultaneous retries that both saw no row.
            pharmacy = Pharmacy.objects.filter(idempotency_key=self.idempotency_key).first()
            if pharmacy is None:
                raise
            return self._idempotent_create_response(pharmacy)

    def _idempotent_create_response(self, pharmacy):
        if pharmacy.idempotency_user_id != self.request.user.pk:
            raise ValidationError('Idempotency key belongs to another user.')
        pharmacy = get_object_or_404(self.get_queryset(), pk=pharmacy.pk)
        self.check_object_permissions(self.request, pharmacy)
        fingerprint = getattr(self, 'idempotency_fingerprint', None) or self._request_fingerprint()
        if pharmacy.idempotency_fingerprint != fingerprint:
            return Response({
                'detail': 'This pharmacy was already saved earlier with different details. Open it for editing to re-apply your changes.',
                'pharmacy_id': pharmacy.pk,
            }, status=status.HTTP_409_CONFLICT)
        return Response(self.get_serializer(pharmacy).data, status=status.HTTP_200_OK)

    def _request_fingerprint(self):
        fields, files = {}, {}
        data = self.request.data
        if not isinstance(data, dict):
            raise ValidationError('Expected an object of pharmacy fields.')
        items = data.lists() if hasattr(data, 'lists') else ((key, [value]) for key, value in data.items())
        for key, values in items:
            for value in values:
                if isinstance(value, UploadedFile):
                    position = value.tell()
                    digest = hashlib.sha256()
                    try:
                        for chunk in value.chunks():
                            digest.update(chunk)
                    finally:
                        value.seek(position)
                    files.setdefault(key, []).append({
                        'name': value.name, 'size': value.size, 'sha256': digest.hexdigest(),
                    })
                else:
                    fields.setdefault(key, []).append(value)
        canonical = json.dumps({'fields': fields, 'files': files}, sort_keys=True, separators=(',', ':'))
        return hashlib.sha256(canonical.encode('utf-8')).hexdigest()

    def perform_create(self, serializer):
        user = self.request.user
        owner_onboarding = None
        organization = None

        if hasattr(user, 'owneronboarding'):
            owner_onboarding = user.owneronboarding
        
        for membership in user.organization_memberships.select_related('organization').prefetch_related('pharmacies'):
            if OrgCapability.CLAIM_PHARMACY in membership_capabilities(membership):
                organization = membership.organization
                break

        if not owner_onboarding and not organization:
            raise PermissionDenied("You must have an owner profile or an organization role with creation rights to create a pharmacy.")
        
        # Use a database transaction to ensure both operations succeed or fail together
        with transaction.atomic():
            # Save the pharmacy instance
            key = getattr(self, 'idempotency_key', None)
            pharmacy = serializer.save(
                owner=owner_onboarding, organization=organization,
                idempotency_key=key, idempotency_user=user if key is not None else None,
                idempotency_fingerprint=getattr(self, 'idempotency_fingerprint', None),
            )

            # NOW, CREATE THE MEMBERSHIP RECORD FOR THE OWNER
            # This ensures the owner is also a member and can use member-only features like chat.
            membership_operations().link_owner(user, pharmacy)
            transaction.on_commit(
                lambda: _send_pharmacy_created_email(
                    pharmacy=pharmacy,
                    created_by_user=user,
                    organization=organization,
                )
            )

    def perform_update(self, serializer):
        super().perform_update(serializer)

    @action(detail=False, methods=['post'], url_path='lookup-abn')
    def lookup_abn(self, request):
        raw_abn = str(request.data.get("abn") or "").strip()
        digits = "".join(ch for ch in raw_abn if ch.isdigit())
        if len(digits) != 11:
            return Response({"abn": ["ABN must be 11 digits."]}, status=status.HTTP_400_BAD_REQUEST)

        legal_name, html = abn_lookup(digits)
        parsed = _parse_abn_html_fields(html or "")

        if not legal_name:
            note = "Failed to fetch ABN details. ABN may be invalid or ABR site unavailable."
        else:
            note = "ABN details fetched from ABR. Review the details below and confirm in the UI if they belong to you."

        payload = {
            "abn": digits,
            "abn_entity_name": parsed.get("entity_name") or legal_name or "",
            "abn_entity_type": parsed.get("entity_type") or "",
            "abn_status": parsed.get("abn_status") or "",
            "abn_gst_registered": parsed.get("abn_gst_registered", None),
            "abn_gst_from": parsed.get("abn_gst_from").isoformat() if parsed.get("abn_gst_from") else None,
            "abn_gst_to": parsed.get("abn_gst_to").isoformat() if parsed.get("abn_gst_to") else None,
            "abn_last_checked": timezone.now().isoformat(),
            "abn_verification_note": note,
            "abn_verified": False,
            "abn_entity_confirmed": False,
        }
        return Response(payload)


class PharmacyAdminViewSet(viewsets.ModelViewSet):
    serializer_class = PharmacyAdminSerializer
    permission_classes = [permissions.IsAuthenticated]
    http_method_names = ['get', 'post', 'delete', 'head', 'options']

    STAFF_ROLE_MEMBERSHIP_MAP = {
        "PHARMACIST": "PHARMACIST",
        "INTERN": "INTERN",
        "TECHNICIAN": "TECHNICIAN",
        "ASSISTANT": "ASSISTANT",
        "STUDENT": "STUDENT",
    }

    @action(detail=False, methods=['get'], url_path='my-pending-invitations')
    def my_pending_invitations(self, request):
        return membership_operations().pending_admin_invitations(self, request)

    @action(detail=True, methods=['post'], url_path='accept-invitation')
    def accept_invitation(self, request, pk=None):
        return membership_operations().accept_admin_invitation(self, request, pk=pk)

    @action(detail=True, methods=['post'], url_path='reject-invitation')
    def reject_invitation(self, request, pk=None):
        return membership_operations().reject_admin_invitation(self, request, pk=pk)

    def get_queryset(self):
        return membership_operations().admin_queryset(self)

    def _can_manage_admins(self, user, pharmacy: Pharmacy) -> bool:
        if getattr(pharmacy.owner, "user_id", None) == user.id:
            return True
        if pharmacy.organization_id and OrganizationMembership.objects.filter(
            user=user, role__in=ORG_WIDE_ADMIN_ROLES, organization_id=pharmacy.organization_id
        ).exists():
            return True
        return has_admin_capability(user, pharmacy, CAPABILITY_MANAGE_ADMINS)

    def create(self, request, *args, **kwargs):
        return membership_operations().create_admin(self, request, *args, async_task=lambda *args, **kwargs: async_task(*args, **kwargs), **kwargs)

    def destroy(self, request, *args, **kwargs):
        return membership_operations().revoke_admin(self, request, *args, **kwargs)


class ChainViewSet(viewsets.ModelViewSet):
    """
    Manage Chains—and within a chain, add/remove pharmacies & staff.
    """
    parser_classes = [JSONParser, MultiPartParser, FormParser]
    queryset = Chain.objects.all()
    serializer_class = ChainSerializer
    permission_classes = [permissions.IsAuthenticated]

    def check_permissions(self, request):
        super().check_permissions(request)   # permission_classes (IsAuthenticated) first: the lookups below need a user
        if request.method in permissions.SAFE_METHODS:
            return

        user = request.user
        # allow create for both OwnerOnboarding and org-wide admins
        if request.method == 'POST':
            if OwnerOnboarding.objects.filter(user=user).exists():
                return
            if OrganizationMembership.objects.filter(user=user, role__in=ORG_WIDE_ADMIN_ROLES).exists():
                return
            self.permission_denied(request)

        # allow update/delete if chain owner or any org-wide admin
        if IsOwner().has_permission(request, self):
            return
        if OrganizationMembership.objects.filter(user=user, role__in=ORG_WIDE_ADMIN_ROLES).exists():
            return
        self.permission_denied(request)

    def get_queryset(self):
        user = self.request.user
        qs = Chain.objects.none()

        # Owner-created chains
        if OwnerOnboarding.objects.filter(user=user).exists():
            owner = OwnerOnboarding.objects.get(user=user)
            qs |= Chain.objects.filter(owner=owner)

        # Org-admin–created chains
        org_mem = OrganizationMembership.objects.filter(
            user=user, role__in=ORG_WIDE_ADMIN_ROLES
        ).first()
        if org_mem:
            qs |= Chain.objects.filter(organization=org_mem.organization)

        return qs.distinct()

    def perform_create(self, serializer):
        user = self.request.user
        # Owner flow
        if OwnerOnboarding.objects.filter(user=user).exists():
            owner = OwnerOnboarding.objects.get(user=user)
            serializer.save(owner=owner)
            return
        # Org-admin flow
        org_mem = OrganizationMembership.objects.filter(
            user=user, role__in=ORG_WIDE_ADMIN_ROLES
        ).first()
        if org_mem:
            serializer.save(organization=org_mem.organization)
            return
        # fallback
        serializer.save()

    @action(detail=True, methods=['get'])
    def pharmacies(self, request, pk=None):
        """
        GET /chains/{id}/pharmacies/
        Returns only pharmacies assigned to this chain.
        """
        self.pagination_class = None # Disable pagination for this action
        chain = self.get_object()
        qs = chain.pharmacies.all()
        return Response(PharmacySerializer(qs, many=True).data)

    @action(detail=True, methods=['post'])
    def add_pharmacy(self, request, pk=None):
        chain = self.get_object()
        pid = request.data.get('pharmacy_id')
        pharm = Pharmacy.objects.filter(id=pid).first()
        if not pharm:
            raise NotFound("That pharmacy does not exist.")

        self.get_serializer(chain).validate_pharmacy_ids([pharm])

        chain.pharmacies.add(pharm)
        return Response({'status': 'Pharmacy added', 'pharmacy': pharm.name})

    @action(detail=True, methods=['post'])
    def remove_pharmacy(self, request, pk=None):
        chain = self.get_object()
        pid = request.data.get('pharmacy_id')
        pharm = chain.pharmacies.filter(id=pid).first()
        if not pharm:
            raise NotFound("That pharmacy is not part of this chain.")
        chain.pharmacies.remove(pharm)
        return Response({'status': 'Pharmacy removed', 'pharmacy': pharm.name})

    @action(detail=True, methods=['post'])
    def add_user(self, request, pk=None):
        return membership_operations().chain_add_user(self, request, pk=pk)

    @action(detail=True, methods=['post'])
    def remove_user(self, request, pk=None):
        return membership_operations().chain_remove_user(self, request, pk=pk)


class PublicOrganizationDetailView(APIView):
    """
    Public, unauthenticated organization profile by slug.
    """
    permission_classes = [permissions.AllowAny]

    def get(self, request, slug):
        organization = get_object_or_404(
            Organization.objects.all(),
            slug=slug
        )
        serializer = PublicOrganizationSerializer(
            organization,
            context={"request": request},
        )
        return Response(serializer.data)
