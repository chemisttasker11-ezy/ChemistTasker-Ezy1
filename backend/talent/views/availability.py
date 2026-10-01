"""Users' own availability slots API."""
from rest_framework import permissions, viewsets
from talent.models import UserAvailability
from talent.serializers.availability import UserAvailabilitySerializer


# Availability
class UserAvailabilityViewSet(viewsets.ModelViewSet):
    """API for users to manage their own availability slots."""
    serializer_class = UserAvailabilitySerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return UserAvailability.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)
