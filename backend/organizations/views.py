"""Organisation API: organisations, pharmacies, chains and pharmacy admins."""
from rest_framework import permissions, status, viewsets
from client_profile.models import Chain, Membership, Organization, OwnerOnboarding, Pharmacy, PharmacyAdmin
from notifications.models import Notification
from users.permissions import AuthenticatedOrganizationMember, IsOwner, OrganizationRolePermission
from memberships.serializers import required_user_role_for_membership
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
)
from django.shortcuts import get_object_or_404
from rest_framework.parsers import FormParser, JSONParser, MultiPartParser
from django.db.models import Q
from django.utils import timezone
from memberships.labels import membership_role_label
from django.conf import settings
from core.task_queue import async_task
from client_profile.tasks import _parse_abn_html_fields, abn_lookup
from memberships.serializers import (
    _count_active_memberships,
    MAX_ACTIVE_PHARMACY_MEMBERSHIPS,
)
from organizations.access import _get_org_pharmacies_queryset
from django.db import transaction
from django.contrib.auth import get_user_model
from users.models import OrganizationMembership, User
from users.org_roles import membership_capabilities, membership_visible_pharmacy_ids, OrgCapability
from organizations.claims import _send_pharmacy_created_email
from organizations.serializers import (
    ChainSerializer,
    OrganizationSerializer,
    PharmacyAdminSerializer,
    PharmacySerializer,
    PublicOrganizationSerializer,
)


# Onboardings
class OrganizationViewSet(viewsets.ModelViewSet):
    """
    CRUD for corporate Organizations.
     - LIST/RETRIEVE: any authenticated user
     - CREATE: superusers only
     - UPDATE/DELETE: only ORG_ADMIN of that org
    """
    queryset = Organization.objects.all()
    serializer_class = OrganizationSerializer

    def get_permissions(self):
        if self.action in ['list', 'retrieve']:
            return [permissions.IsAuthenticated()]
        if self.action == 'create':
            return [permissions.IsAdminUser()]
        # update, partial_update, destroy
        self.required_roles = ['ORG_ADMIN', 'CHIEF_ADMIN', 'REGION_ADMIN']
        return [permissions.IsAuthenticated(), OrganizationRolePermission()]


# Chain, Pharmacy and membership
class PharmacyViewSet(viewsets.ModelViewSet):
    """
    Pharmacy CRUD:
      - Owners manage their own pharmacies.
      - Organization members manage pharmacies according to their scope.
    """
    parser_classes = [MultiPartParser, FormParser, JSONParser]
    queryset = Pharmacy.objects.all()
    serializer_class = PharmacySerializer
    permission_classes = [permissions.IsAuthenticated]

    def check_permissions(self, request):
        super().check_permissions(request)
        if request.method in permissions.SAFE_METHODS:
            return
        user = request.user
        if IsOwner().has_permission(request, self) or AuthenticatedOrganizationMember().has_permission(request, self):
            return
        self.permission_denied(request)

    def check_object_permissions(self, request, obj):
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
        self.permission_denied(request, obj)

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
            return Pharmacy.objects.filter(id__in=accessible_ids).distinct()

        # Fallback to admin assignments if no other visibility applies
        if admin_pharmacies.exists():
            return admin_pharmacies
        if owner:
            return Pharmacy.objects.filter(owner=owner)
        return Pharmacy.objects.none()

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
            pharmacy = serializer.save(owner=owner_onboarding, organization=organization)

            # NOW, CREATE THE MEMBERSHIP RECORD FOR THE OWNER
            # This ensures the owner is also a member and can use member-only features like chat.
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

    STAFF_ROLE_MEMBERSHIP_MAP = {
        "PHARMACIST": "PHARMACIST",
        "INTERN": "INTERN",
        "TECHNICIAN": "TECHNICIAN",
        "ASSISTANT": "ASSISTANT",
        "STUDENT": "STUDENT",
    }

    @action(detail=False, methods=['get'], url_path='my-pending-invitations')
    def my_pending_invitations(self, request):
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

    @action(detail=True, methods=['post'], url_path='accept-invitation')
    def accept_invitation(self, request, pk=None):
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

    @action(detail=True, methods=['post'], url_path='reject-invitation')
    def reject_invitation(self, request, pk=None):
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

    def get_queryset(self):
        user = self.request.user
        qs = PharmacyAdmin.objects.filter(is_active=True).select_related("user", "pharmacy", "membership")
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
            user=user, role="ORG_ADMIN"
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

    def _can_manage_admins(self, user, pharmacy: Pharmacy) -> bool:
        if getattr(pharmacy.owner, "user_id", None) == user.id:
            return True
        if pharmacy.organization_id and OrganizationMembership.objects.filter(
            user=user, role="ORG_ADMIN", organization_id=pharmacy.organization_id
        ).exists():
            return True
        return has_admin_capability(user, pharmacy, CAPABILITY_MANAGE_ADMINS)

    def create(self, request, *args, **kwargs):
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
            if user and user.role != expected_user_role:
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

    def destroy(self, request, *args, **kwargs):
        assignment: PharmacyAdmin = self.get_object()
        if not assignment.can_be_removed_by(request.user):
            return Response({"detail": "Not allowed to remove this admin."}, status=status.HTTP_403_FORBIDDEN)
        assignment.is_active = False
        assignment.save(update_fields=["is_active", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)


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
        # allow create for both OwnerOnboarding and ORG_ADMIN
        if request.method == 'POST':
            if OwnerOnboarding.objects.filter(user=user).exists():
                return
            if OrganizationMembership.objects.filter(user=user, role='ORG_ADMIN').exists():
                return
            self.permission_denied(request)

        # allow update/delete if chain owner or any ORG_ADMIN
        if IsOwner().has_permission(request, self):
            return
        if OrganizationMembership.objects.filter(user=user, role='ORG_ADMIN').exists():
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
            user=user, role='ORG_ADMIN'
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
            user=user, role='ORG_ADMIN'
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

        # Owner-chain: pharmacy.owner must match
        if chain.owner:
            if pharm.owner != chain.owner:
                raise PermissionDenied("You don’t own that pharmacy.")
        # Org-chain: pharmacy.organization must match
        elif chain.organization:
            org = chain.organization
            if pharm.organization != org:
                raise PermissionDenied("That pharmacy isn't in your organization.")
        else:
            # no owner or org on chain
            raise PermissionDenied("Chain has no owner or organization.")

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

    @action(detail=True, methods=['post'])
    def remove_user(self, request, pk=None):
        chain = self.get_object()
        membership = Membership.objects.filter(
            user_id=request.data.get('user_id'),
            pharmacy__in=chain.pharmacies.all()
        ).first()
        if not membership:
            raise NotFound("User not in this chain’s pharmacies.")
        membership.delete()
        return Response(status=204)


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
