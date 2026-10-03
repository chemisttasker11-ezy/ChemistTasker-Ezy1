"""Shift description templates a pharmacy keeps for its postings."""
from rest_framework import (
    permissions,
    status,
    viewsets,
)
from organizations.models import Pharmacy
from shifts.models import (
    Shift,
    ShiftDescriptionTemplate,
)
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from organizations.access import (
    managed_pharmacies as managed_pharmacies_for,
    user_can_manage_pharmacy,
)
from shifts.serializers import ShiftDescriptionTemplateSerializer


class ShiftDescriptionTemplateViewSet(viewsets.ModelViewSet):
    serializer_class = ShiftDescriptionTemplateSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        managed = managed_pharmacies_for(self.request.user)
        qs = ShiftDescriptionTemplate.objects.filter(pharmacy__in=managed).select_related(
            'pharmacy',
            'created_by',
            'updated_by',
        )
        pharmacy_id = self.request.query_params.get('pharmacy')
        role_needed = self.request.query_params.get('role_needed') or self.request.query_params.get('roleNeeded')
        if pharmacy_id:
            qs = qs.filter(pharmacy_id=pharmacy_id)
        if role_needed:
            qs = qs.filter(role_needed=str(role_needed).upper())
        return qs.order_by('pharmacy_id', 'role_needed')

    def _get_pharmacy(self, pharmacy_id):
        pharmacy = get_object_or_404(Pharmacy, pk=pharmacy_id)
        if not user_can_manage_pharmacy(self.request.user, pharmacy):
            self.permission_denied(self.request)
        return pharmacy

    def create(self, request, *args, **kwargs):
        pharmacy_id = request.data.get('pharmacy')
        role_needed = str(request.data.get('role_needed') or request.data.get('roleNeeded') or '').upper()
        description = (request.data.get('description') or '').strip()

        if not pharmacy_id:
            return Response({'pharmacy': 'This field is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if not role_needed:
            return Response({'role_needed': 'This field is required.'}, status=status.HTTP_400_BAD_REQUEST)
        if role_needed not in dict(Shift.ROLE_CHOICES):
            return Response({'role_needed': 'Invalid shift role.'}, status=status.HTTP_400_BAD_REQUEST)

        pharmacy = self._get_pharmacy(pharmacy_id)
        template, created = ShiftDescriptionTemplate.objects.get_or_create(
            pharmacy=pharmacy,
            role_needed=role_needed,
            defaults={
                'description': description,
                'created_by': request.user,
                'updated_by': request.user,
            },
        )
        if not created:
            template.description = description
            template.updated_by = request.user
            template.save(update_fields=['description', 'updated_by', 'updated_at'])
        serializer = self.get_serializer(template)
        return Response(serializer.data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)

    def perform_update(self, serializer):
        pharmacy = serializer.validated_data.get('pharmacy', serializer.instance.pharmacy)
        if not user_can_manage_pharmacy(self.request.user, pharmacy):
            self.permission_denied(self.request)
        serializer.save(updated_by=self.request.user)
