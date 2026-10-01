"""Moved verbatim from client_profile/views.py (Stage 2 domain split). Behaviour is unchanged; client_profile/views.py re-exports these names."""
from rest_framework import permissions, viewsets
from client_profile.models import UserAvailability
from client_profile.domains.availability.serializers import UserAvailabilitySerializer


# Availability
class UserAvailabilityViewSet(viewsets.ModelViewSet):
    """API for users to manage their own availability slots."""
    serializer_class = UserAvailabilitySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return UserAvailability.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
