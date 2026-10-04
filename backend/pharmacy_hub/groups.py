"""Community groups inside a pharmacy hub."""
from django.db.models import Count, Q
from rest_framework import mixins, permissions, status, viewsets
from rest_framework.exceptions import ValidationError, PermissionDenied
from rest_framework.response import Response
from memberships.models import PHARMACY_STAFF_EMPLOYMENT_TYPES
from pharmacy_hub.models import PharmacyCommunityGroup, PharmacyCommunityGroupMembership
from pharmacy_hub.serializers import HubCommunityGroupSerializer
from pharmacy_hub.access import HubScopeResolver, get_user_pharmacy_permissions
from pharmacy_hub.selectors import STAFF_GROUP_MEMBER_FILTER, staff_group_members_prefetch


class HubCommunityGroupViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    serializer_class = HubCommunityGroupSerializer
    permission_classes = [permissions.IsAuthenticated]

    def _load_permissions(self):
        if not hasattr(self, "_pharmacy_context"):
            self._pharmacy_context = get_user_pharmacy_permissions(self.request.user)
        return self._pharmacy_context

    def get_queryset(self):
        queryset = (
            PharmacyCommunityGroup.objects.all()
            .select_related("pharmacy", "pharmacy__organization")
            .prefetch_related(staff_group_members_prefetch())
            .annotate(staff_member_count=Count("memberships", filter=STAFF_GROUP_MEMBER_FILTER))
            .order_by("name")
        )
        pharmacy_id = self.request.query_params.get("pharmacy_id")
        if pharmacy_id:
            resolver = HubScopeResolver(self.request.user)
            scope = resolver.pharmacy_scope(pharmacy_id)
            self.scope_context = scope
            return queryset.filter(pharmacy=scope["pharmacy"])
        pharmacies, _, _, _ = self._load_permissions()
        member_group_ids = list(
            PharmacyCommunityGroupMembership.objects.filter(
                membership__user=self.request.user,
                membership__is_active=True,
                membership__employment_type__in=PHARMACY_STAFF_EMPLOYMENT_TYPES,
            ).values_list("group_id", flat=True)
        )
        filters = Q()
        if pharmacies:
            filters |= Q(pharmacy_id__in=list(pharmacies.keys()))
        if member_group_ids:
            filters |= Q(id__in=member_group_ids)
        if filters:
            queryset = queryset.filter(filters).distinct()
        else:
            queryset = queryset.none()
        return queryset

    def _hydrate_group_permissions(self, groups):
        if not groups:
            self.group_member_map = {}
            self.group_admin_map = {}
            return
        _, pharmacy_permissions, membership_by_pharmacy, _ = self._load_permissions()
        group_ids = [group.id for group in groups]
        membership_ids = [
            membership.id
            for membership in membership_by_pharmacy.values()
            if membership is not None
        ]
        member_links = []
        if group_ids and membership_ids:
            member_links = list(
                PharmacyCommunityGroupMembership.objects.filter(
                    group_id__in=group_ids,
                    membership_id__in=membership_ids,
                )
            )
        member_map = {link.group_id: True for link in member_links}
        admin_map = {link.group_id: True for link in member_links if link.is_admin}
        for group in groups:
            perms = pharmacy_permissions.get(group.pharmacy_id, {})
            if perms.get("has_admin_permissions"):
                admin_map[group.id] = True
        self.group_member_map = member_map
        self.group_admin_map = admin_map

    def get_serializer_context(self):
        context = super().get_serializer_context()
        pharmacies, _, _, _ = self._load_permissions()
        context.update(
            {
                "request_membership": getattr(self, "scope_context", {}).get(
                    "request_membership"
                ),
                "group_member_map": getattr(self, "group_member_map", {}),
                "group_admin_map": getattr(self, "group_admin_map", {}),
                "include_members": self.request.query_params.get("include_members")
                == "true",
                "allowed_pharmacy_ids": list(pharmacies.keys()),
            }
        )
        return context

    def list(self, request, *args, **kwargs):
        queryset = list(self.filter_queryset(self.get_queryset()))
        self._hydrate_group_permissions(queryset)
        serializer = self.get_serializer(queryset, many=True)
        return Response(serializer.data)

    def retrieve(self, request, *args, **kwargs):
        instance = self.get_object()
        self._hydrate_group_permissions([instance])
        serializer = self.get_serializer(instance)
        return Response(serializer.data)

    def create(self, request, *args, **kwargs):
        pharmacy_id = request.data.get("pharmacy_id") or request.query_params.get(
            "pharmacy_id"
        )
        if not pharmacy_id:
            raise ValidationError({"pharmacy_id": "This field is required."})
        resolver = HubScopeResolver(request.user)
        scope = resolver.pharmacy_scope(pharmacy_id)
        if not scope.get("has_admin_permissions"):
            raise PermissionDenied("You cannot create groups for this pharmacy.")
        self.scope_context = scope
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        group = serializer.save(pharmacy=scope["pharmacy"], created_by=request.user)
        self._hydrate_group_permissions([group])
        output = self.get_serializer(group)
        return Response(output.data, status=status.HTTP_201_CREATED)

    def perform_update(self, serializer):
        instance = self.get_object()
        resolver = HubScopeResolver(self.request.user)
        scope = resolver.group_scope(instance.id, group=instance)
        if not scope.get("has_group_admin_permissions"):
            raise PermissionDenied("You cannot update this group.")
        self.scope_context = scope
        serializer.save()

    def destroy(self, request, *args, **kwargs):
        instance = self.get_object()
        resolver = HubScopeResolver(request.user)
        scope = resolver.group_scope(instance.id, group=instance)
        if not scope.get("has_group_admin_permissions"):
            raise PermissionDenied("You cannot delete this group.")
        instance.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)
