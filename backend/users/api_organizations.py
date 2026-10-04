"""Organization membership API: inviting organization users, listing and changing their roles
(with delegation limits) and the role definitions."""
from rest_framework import viewsets, permissions, generics, status, mixins
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode
from django.utils.encoding import force_bytes
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from users.models import OrganizationMembership
from memberships.models import Membership
from organizations.models import Pharmacy
from users.serializers import InviteOrgUserSerializer, OrganizationMembershipDetailSerializer
from users.permissions import OrganizationRolePermission
from users.org_roles import (
    ADMIN_LEVEL_DEFINITIONS,
    ROLE_DEFINITIONS,
    OrgCapability,
    membership_capabilities,
    membership_visible_pharmacy_ids,
)
from django.conf import settings
from core.task_queue import async_task
from rest_framework.views import APIView
from users.utils import build_org_invite_context
from django.db.models import Q
from django.contrib.auth import get_user_model
from django.shortcuts import get_object_or_404

User = get_user_model()


def _enforce_org_delegation(actor_membership, *, role, admin_level, region, pharmacy_ids, existing=None, allow_self_promotion=False):
    """Scoped admins cannot delegate a higher role, level, or pharmacy scope."""
    actor_role = actor_membership.role
    if actor_role not in {'CHIEF_ADMIN', 'REGION_ADMIN'}:
        return
    if (actor_role == 'CHIEF_ADMIN' and allow_self_promotion and existing and
            existing.pk == actor_membership.pk and role == 'ORG_ADMIN'):
        return
    actor_ids = set(actor_membership.pharmacies.values_list('id', flat=True))
    requested_ids = set(pharmacy_ids)
    actor_level = ADMIN_LEVEL_DEFINITIONS.get(actor_membership.admin_level)
    requested_level = ADMIN_LEVEL_DEFINITIONS.get(admin_level)
    allowed_roles = {'CHIEF_ADMIN', 'REGION_ADMIN'} if actor_role == 'CHIEF_ADMIN' else {'REGION_ADMIN'}
    if role not in allowed_roles or (existing and existing.role not in allowed_roles):
        raise PermissionDenied('Cannot delegate an organization role above your own.')
    if not actor_level or not requested_level or not set(requested_level.pharmacy_capabilities).issubset(actor_level.pharmacy_capabilities):
        raise PermissionDenied('Cannot grant an admin level above your own.')
    if actor_role == 'REGION_ADMIN' and (region or '').strip().casefold() != (actor_membership.region or '').strip().casefold():
        raise PermissionDenied('Region admins may assign members only within their region.')
    if not requested_ids or not requested_ids.issubset(actor_ids):
        raise PermissionDenied('Region admins may assign only their scoped pharmacies.')
    if existing:
        existing_ids = set(existing.pharmacies.values_list('id', flat=True))
        existing_level = ADMIN_LEVEL_DEFINITIONS.get(existing.admin_level)
        if not existing_level or not set(existing_level.pharmacy_capabilities).issubset(actor_level.pharmacy_capabilities):
            raise PermissionDenied('Cannot manage an admin above your own level.')
        if (actor_role == 'REGION_ADMIN' and
                (existing.region or '').strip().casefold() != (actor_membership.region or '').strip().casefold()):
            raise PermissionDenied('Cannot manage a membership outside your region scope.')
        if not existing_ids or not existing_ids.issubset(actor_ids):
            raise PermissionDenied('Cannot manage a membership outside your region scope.')


class InviteOrgUserView(generics.CreateAPIView):
    """Invite organization admins within the actor's delegation scope."""
    serializer_class   = InviteOrgUserSerializer

    # Allow role-based access; capability checks enforce fine-grained control.
    required_roles     = ['ORG_ADMIN', 'CHIEF_ADMIN', 'REGION_ADMIN']
    permission_classes = [permissions.IsAuthenticated, OrganizationRolePermission]

    def perform_create(self, serializer):
        data = serializer.validated_data
        organization = data['organization']

        actor_membership = self.request.user.organization_memberships.filter(
            organization=organization
        ).first()
        if not actor_membership or OrgCapability.INVITE_STAFF not in membership_capabilities(actor_membership):
            raise PermissionDenied("You do not have permission to invite staff for this organization.")

        existing_membership = OrganizationMembership.objects.filter(
            user__email__iexact=data['email'], organization=organization
        ).first()
        _enforce_org_delegation(
            actor_membership,
            role=data['role'],
            admin_level=data['admin_level'],
            region=data.get('region'),
            pharmacy_ids=[pharmacy.id for pharmacy in data.get('pharmacies') or []],
            existing=existing_membership,
        )

        # 1) Find or create the User
        try:
            user = User.objects.get(email=data['email'])
            temp_password = None
        except User.DoesNotExist:
            temp_password = None
            user = User.objects.create_user(
                email    = data['email'],
                password = None,
                role     = 'ORG_STAFF'
            )
            user.set_unusable_password()
            user.save(update_fields=['password'])

        # 2) Find or create the membership; update if it already exists
        invitee_membership, created = OrganizationMembership.objects.get_or_create(
            user         = user,
            organization = organization,
            defaults     = {
                'role':        data['role'],
                'region':      data.get('region', ''),
                'job_title':   data.get('job_title', ''),
                'admin_level': data['admin_level'],
            }
        )
        update_fields = {'role', 'region', 'job_title', 'admin_level'}
        invitee_membership.role = data['role']
        invitee_membership.region = data.get('region', '')
        invitee_membership.job_title = data.get('job_title', '')
        invitee_membership.admin_level = data['admin_level']
        invitee_membership.save(update_fields=sorted(update_fields))

        pharmacies = data.get('pharmacies') or []
        if pharmacies:
            invitee_membership.pharmacies.set(pharmacies)
        else:
            invitee_membership.pharmacies.clear()

        # 3) Build the front-end reset link
        uid   = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        frontend_url = settings.FRONTEND_BASE_URL
        front_end_link = f"{frontend_url}/reset-password/{uid}/{token}/"

        invitee_membership = OrganizationMembership.objects.select_related(
            "organization"
        ).prefetch_related("pharmacies").get(pk=invitee_membership.pk)

        # 4) Prepare async email context and send
        context = build_org_invite_context(
            membership=invitee_membership,
            inviter=self.request.user,
            magic_link=front_end_link,
            dashboard_link=f"{frontend_url}/dashboard/organization/overview",
            temp_password=temp_password,
        )
        recipient_list = [user.email]

        async_task(
            'users.tasks.send_async_email',
            subject=f"You've been invited to join {organization.name} on ChemistTasker",
            recipient_list=recipient_list,
            template_name="emails/org_invite_new_user.html",
            context=context,
            text_template="emails/org_invite_new_user.txt",
        )

        # 5) Return success
        return Response({'detail': 'Invitation sent.'}, status=status.HTTP_201_CREATED)


class OrganizationMembershipViewSet(mixins.ListModelMixin,
                                    mixins.RetrieveModelMixin,
                                    mixins.UpdateModelMixin,
                                    mixins.DestroyModelMixin,
                                    viewsets.GenericViewSet):
    serializer_class = OrganizationMembershipDetailSerializer
    permission_classes = [permissions.IsAuthenticated]

    def _management_memberships(self, user):
        memberships = user.organization_memberships.select_related('organization').prefetch_related('pharmacies')
        return [
            membership
            for membership in memberships
            if (
                OrgCapability.MANAGE_ADMINS in membership_capabilities(membership)
                or OrgCapability.MANAGE_STAFF in membership_capabilities(membership)
            )
        ]

    def _user_org_admin_ids(self, user):
        return {membership.organization_id for membership in self._management_memberships(user)}

    def _target_in_actor_scope(self, actor_membership, target_membership):
        caps = membership_capabilities(actor_membership)
        if OrgCapability.VIEW_ALL_PHARMACIES in caps:
            return True
        if actor_membership.pk == target_membership.pk:
            return True

        if actor_membership.role == 'CHIEF_ADMIN':
            allowed_roles = {'CHIEF_ADMIN', 'REGION_ADMIN'}
        elif actor_membership.role == 'REGION_ADMIN':
            allowed_roles = {'REGION_ADMIN'}
        else:
            return False
        if target_membership.role not in allowed_roles:
            return False

        if (
            actor_membership.role == 'REGION_ADMIN'
            and (target_membership.region or '').strip().casefold()
            != (actor_membership.region or '').strip().casefold()
        ):
            return False

        actor_ids = set(membership_visible_pharmacy_ids(actor_membership))
        target_ids = set(target_membership.pharmacies.values_list('id', flat=True))
        return bool(target_ids) and target_ids.issubset(actor_ids)

    def _visible_org_membership_ids(self, user):
        visible_ids = set()
        for actor_membership in self._management_memberships(user):
            targets = (
                OrganizationMembership.objects.filter(
                    organization_id=actor_membership.organization_id
                )
                .select_related('user', 'organization')
                .prefetch_related('pharmacies')
            )
            for target in targets:
                if self._target_in_actor_scope(actor_membership, target):
                    visible_ids.add(target.pk)
        return visible_ids

    def get_queryset(self):
        visible_ids = self._visible_org_membership_ids(self.request.user)
        if not visible_ids:
            return OrganizationMembership.objects.none()
        queryset = OrganizationMembership.objects.filter(
            pk__in=visible_ids
        ).select_related('user', 'organization').prefetch_related('pharmacies')

        organization_param = (
            self.request.query_params.get('organization')
            or self.request.query_params.get('organization_id')
        )
        if organization_param:
            try:
                organization_id = int(organization_param)
            except (TypeError, ValueError):
                raise PermissionDenied("Invalid organization id.")
            if organization_id not in self._user_org_admin_ids(self.request.user):
                raise PermissionDenied("Not allowed to manage this organization.")
            queryset = queryset.filter(organization_id=organization_id)

        search = self.request.query_params.get('search')
        if search:
            search = search.strip()
            if search:
                queryset = queryset.filter(
                    Q(user__first_name__icontains=search) |
                    Q(user__last_name__icontains=search) |
                    Q(user__email__icontains=search) |
                    Q(job_title__icontains=search)
                )
        return queryset

    def _parse_bool_param(self, name: str) -> bool:
        raw = self.request.query_params.get(name)
        if raw is None:
            return False
        return str(raw).strip().lower() in {"1", "true", "yes", "on"}

    def _get_requested_org_id(self, org_ids):
        org_param = (
            self.request.query_params.get("organization")
            or self.request.query_params.get("organization_id")
        )
        if org_param is not None:
            try:
                org_id = int(org_param)
            except (TypeError, ValueError):
                raise PermissionDenied("Invalid organization id.")
            if org_id not in org_ids:
                raise PermissionDenied("Not allowed to manage this organization.")
            return org_id
        if len(org_ids) == 1:
            return next(iter(org_ids))
        raise PermissionDenied("Specify an organization id to load members.")

    def _ensure_membership_for_org_user(self, organization, user, *, allowed_pharmacy_ids=None):
        membership_qs = Membership.objects.filter(
            user=user,
            is_active=True,
            pharmacy__organization=organization,
        )
        pharmacy_qs = Pharmacy.objects.filter(organization=organization)
        if allowed_pharmacy_ids is not None:
            allowed_pharmacy_ids = set(allowed_pharmacy_ids)
            if not allowed_pharmacy_ids:
                return None
            membership_qs = membership_qs.filter(pharmacy_id__in=allowed_pharmacy_ids)
            pharmacy_qs = pharmacy_qs.filter(id__in=allowed_pharmacy_ids)

        membership = membership_qs.select_related("pharmacy").order_by("id").first()
        if membership:
            return membership

        primary_pharmacy = pharmacy_qs.order_by("id").first()
        if not primary_pharmacy:
            return None
        membership, _ = Membership.objects.get_or_create(
            user=user,
            pharmacy=primary_pharmacy,
            defaults={
                "role": "CONTACT",
                "employment_type": "FULL_TIME",
                "is_active": True,
            },
        )
        if not membership.is_active:
            membership.is_active = True
            membership.save(update_fields=["is_active"])
        return membership

    def list(self, request, *args, **kwargs):
        include_pharmacy_members = (
            self._parse_bool_param("include_pharmacy_members")
            or self._parse_bool_param("include_pharmacy_staff")
            or self._parse_bool_param("for_hub")
        )
        org_ids = self._user_org_admin_ids(request.user)
        if not include_pharmacy_members:
            return super().list(request, *args, **kwargs)
        if not org_ids:
            return Response([])

        organization_id = self._get_requested_org_id(org_ids)
        actor_membership = next(
            (
                membership
                for membership in self._management_memberships(request.user)
                if membership.organization_id == organization_id
            ),
            None,
        )
        if actor_membership is None:
            return Response([])

        org_memberships = [
            membership
            for membership in (
                OrganizationMembership.objects.filter(organization_id=organization_id)
                .select_related("user", "organization")
                .prefetch_related("pharmacies")
            )
            if self._target_in_actor_scope(actor_membership, membership)
        ]

        actor_caps = membership_capabilities(actor_membership)
        full_access = OrgCapability.VIEW_ALL_PHARMACIES in actor_caps
        visible_pharmacy_ids = (
            None
            if full_access
            else set(membership_visible_pharmacy_ids(actor_membership))
        )
        membership_qs = Membership.objects.filter(
            pharmacy__organization_id=organization_id,
            is_active=True,
        )
        if visible_pharmacy_ids is not None:
            membership_qs = membership_qs.filter(pharmacy_id__in=visible_pharmacy_ids)
        memberships = list(
            membership_qs.select_related("user", "pharmacy").order_by("id")
        )
        membership_by_user = {}
        for membership in memberships:
            membership_by_user.setdefault(membership.user_id, []).append(membership)

        org_membership_links = {}
        for org_membership in org_memberships:
            target_scope_ids = None
            if visible_pharmacy_ids is not None:
                target_scope_ids = set(
                    org_membership.pharmacies.values_list("id", flat=True)
                ) & visible_pharmacy_ids
                if org_membership.pk == actor_membership.pk and not target_scope_ids:
                    target_scope_ids = set(visible_pharmacy_ids)

            user_memberships = list(membership_by_user.get(org_membership.user_id, []))
            if target_scope_ids is not None:
                user_memberships = [
                    membership
                    for membership in user_memberships
                    if membership.pharmacy_id in target_scope_ids
                ]

            if not user_memberships:
                ensured = self._ensure_membership_for_org_user(
                    org_membership.organization,
                    org_membership.user,
                    allowed_pharmacy_ids=target_scope_ids,
                )
                if ensured:
                    memberships.append(ensured)
                    membership_by_user.setdefault(org_membership.user_id, []).append(ensured)
                    user_memberships = [ensured]

            org_membership_links[org_membership.id] = user_memberships

        org_meta_by_membership = {}
        for org_membership in org_memberships:
            for membership in org_membership_links.get(org_membership.id, []):
                org_meta_by_membership[membership.id] = {
                    "org_membership_id": org_membership.id,
                    "org_role": org_membership.role,
                    "org_job_title": org_membership.job_title,
                }

        search_term = (request.query_params.get("search") or "").strip().lower()
        memberships_filtered = memberships

        if search_term:
            def matches_search(membership):
                user = membership.user
                full_name = " ".join(
                    part for part in [user.first_name, user.last_name] if part
                ).lower()
                email = (getattr(user, "email", "") or "").lower()
                job_title = (membership.job_title or "").lower()
                pharmacy_name = ""
                pharmacy = getattr(membership, "pharmacy", None)
                if pharmacy:
                    pharmacy_name = (pharmacy.name or "").lower()
                org_meta = org_meta_by_membership.get(membership.id, {})
                org_job_title = (org_meta.get("org_job_title") or "").lower()
                return (
                    search_term in full_name
                    or search_term in email
                    or search_term in job_title
                    or search_term in pharmacy_name
                    or (org_meta.get("org_role") and search_term in org_meta["org_role"].lower())
                    or (org_job_title and search_term in org_job_title)
                )

            memberships_filtered = [m for m in memberships if matches_search(m)]

        def serialize_membership(membership):
            user = membership.user
            user_payload = {
                "id": user.id,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "email": getattr(user, "email", None),
                "profile_photo_url": getattr(user, "profile_photo_url", None),
            }
            org_meta = org_meta_by_membership.get(membership.id, {})
            pharmacy = getattr(membership, "pharmacy", None)
            return {
                "id": membership.id,
                "membership_id": membership.id,
                "organization_membership_id": org_meta.get("org_membership_id"),
                "organization_role": org_meta.get("org_role"),
                "role": org_meta.get("org_role") or membership.role,
                "employment_type": membership.employment_type,
                "job_title": membership.job_title or org_meta.get("org_job_title"),
                "pharmacy": pharmacy.id if pharmacy else None,
                "pharmacy_name": pharmacy.name if pharmacy else None,
                "user": user_payload,
                "user_details": user_payload,
            }

        def sort_key(membership):
            name = ""
            user = membership.user
            if hasattr(user, "get_full_name"):
                name = (user.get_full_name() or user.email or "").lower()
            else:
                name = (getattr(user, "email", "") or "").lower()
            pharmacy_name = ""
            pharmacy = getattr(membership, "pharmacy", None)
            if pharmacy:
                pharmacy_name = pharmacy.name or ""
            return (name, pharmacy_name, membership.id)

        memberships_sorted = sorted(memberships_filtered, key=sort_key)
        data = [serialize_membership(membership) for membership in memberships_sorted]
        page = self.paginate_queryset(data)
        if page is not None:
            return self.get_paginated_response(page)
        return Response(data)

    def get_object(self):
        managed_org_ids = self._user_org_admin_ids(self.request.user)
        obj = get_object_or_404(
            OrganizationMembership.objects.select_related(
                'user', 'organization'
            ).prefetch_related('pharmacies'),
            pk=self.kwargs.get(self.lookup_field),
            organization_id__in=managed_org_ids,
        )
        if obj.pk not in self._visible_org_membership_ids(self.request.user):
            raise PermissionDenied("Not allowed to access this membership.")
        self.check_object_permissions(self.request, obj)
        return obj

    def perform_destroy(self, instance):
        request_user = self.request.user
        if instance.user_id == request_user.id:
            raise PermissionDenied("You cannot remove your own organization membership.")
        actor_membership = request_user.organization_memberships.filter(organization=instance.organization).first()
        if actor_membership:
            _enforce_org_delegation(
                actor_membership,
                role=instance.role,
                admin_level=instance.admin_level,
                region=instance.region,
                pharmacy_ids=instance.pharmacies.values_list('id', flat=True),
                existing=instance,
            )
        if instance.role == 'ORG_ADMIN':
            remaining = OrganizationMembership.objects.filter(
                organization=instance.organization,
                role='ORG_ADMIN'
            ).exclude(pk=instance.pk).count()
            if remaining == 0:
                raise PermissionDenied("Each organization must retain at least one Org Admin.")
        instance.delete()

    def perform_update(self, serializer):
        instance = serializer.instance
        new_role = serializer.validated_data.get('role', instance.role)
        actor_membership = self.request.user.organization_memberships.filter(organization=instance.organization).first()
        if actor_membership:
            requested_pharmacies = getattr(serializer, '_validated_pharmacy_ids', None)
            _enforce_org_delegation(
                actor_membership,
                role=new_role,
                admin_level=serializer.validated_data.get('admin_level', instance.admin_level),
                region=serializer.validated_data.get('region', instance.region),
                pharmacy_ids=requested_pharmacies if requested_pharmacies is not None else instance.pharmacies.values_list('id', flat=True),
                existing=instance,
                allow_self_promotion=True,
            )
        if instance.role == 'ORG_ADMIN' and new_role != 'ORG_ADMIN':
            remaining = OrganizationMembership.objects.filter(
                organization=instance.organization,
                role='ORG_ADMIN'
            ).exclude(pk=instance.pk).count()
            if remaining == 0:
                raise PermissionDenied("Each organization must retain at least one Org Admin.")
        serializer.save()


class OrganizationRoleDefinitionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        role_payload = []
        for definition in ROLE_DEFINITIONS.values():
            role_payload.append(
                {
                    'key': definition.key,
                    'label': definition.label,
                    'description': definition.description,
                    'default_admin_level': definition.default_admin_level,
                    'allowed_admin_levels': list(definition.allowed_admin_levels),
                    'requires_job_title': definition.requires_job_title,
                    'requires_region': definition.requires_region,
                    'requires_pharmacies': definition.requires_pharmacies,
                    'capabilities': sorted(definition.consolidated_capabilities()),
                }
            )

        admin_payload = []
        for definition in ADMIN_LEVEL_DEFINITIONS.values():
            admin_payload.append(
                {
                    'key': definition.key,
                    'label': definition.label,
                    'description': definition.description,
                    'capabilities': list(definition.pharmacy_capabilities),
                }
            )

        return Response(
            {
                'roles': role_payload,
                'admin_levels': admin_payload,
                # 'documentation': ROLE_DESCRIPTION_SUMMARY.strip(),
            }
        )
