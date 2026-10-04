"""The hub context endpoint and the pharmacy / organization hub profiles."""
from rest_framework import permissions
from rest_framework.exceptions import PermissionDenied
from rest_framework.parsers import MultiPartParser, FormParser, JSONParser
from rest_framework.response import Response
from rest_framework.views import APIView
from pharmacy_hub.serializers import (
    HubOrganizationProfileSerializer,
    HubOrganizationSerializer,
    HubPharmacyProfileSerializer,
    HubPharmacySerializer,
)
from pharmacy_hub.access import HubScopeResolver, get_user_pharmacy_permissions
from pharmacy_hub.context import HubContextBuilder


class HubContextView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        builder = HubContextBuilder(request.user)
        payload = builder.build(request)
        return Response(payload)


class HubPharmacyProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def patch(self, request, pharmacy_pk: int):
        resolver = HubScopeResolver(request.user)
        scope = resolver.pharmacy_scope(pharmacy_pk)
        if not scope.get("has_admin_permissions"):
            raise PermissionDenied("You cannot update this pharmacy profile.")
        serializer = HubPharmacyProfileSerializer(
            scope["pharmacy"], data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        _, permissions, _, _ = get_user_pharmacy_permissions(request.user)
        data = HubPharmacySerializer(
            [scope["pharmacy"]],
            many=True,
            context={
                "request": request,
                "pharmacy_permissions": permissions,
            },
        ).data[0]
        return Response(data)


class HubOrganizationProfileView(APIView):
    permission_classes = [permissions.IsAuthenticated]
    parser_classes = [MultiPartParser, FormParser, JSONParser]

    def patch(self, request, organization_pk: int):
        resolver = HubScopeResolver(request.user)
        scope = resolver.organization_scope(organization_pk)
        if not scope.get("has_admin_permissions"):
            raise PermissionDenied("You cannot update this organization profile.")
        serializer = HubOrganizationProfileSerializer(
            scope["organization"], data=request.data, partial=True
        )
        serializer.is_valid(raise_exception=True)
        serializer.save()
        data = HubOrganizationSerializer(
            [scope["organization"]],
            many=True,
            context={
                "request": request,
                "organization_permissions": {
                    scope["organization"].id: {"can_manage_profile": True}
                },
            },
        ).data[0]
        return Response(data)
