"""Notifications API: paginated list, mark-read and device-token registration."""
import logging

log = logging.getLogger(__name__)


from rest_framework import mixins, permissions, viewsets
from rest_framework.pagination import PageNumberPagination
from notifications.models import Notification
from django.core.exceptions import ValidationError
from rest_framework.response import Response
from rest_framework.exceptions import NotAuthenticated
from rest_framework.decorators import action
from notifications.services import mark_notifications_read
from users.models import DeviceToken
from notifications.serializers import DeviceTokenSerializer, NotificationSerializer


# -----------------------------------------------------------------------------
# Chat API
# -----------------------------------------------------------------------------
class NotificationPagination(PageNumberPagination):
    page_size = 20
    max_page_size = 100


class NotificationViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [permissions.IsAuthenticated]
    pagination_class = NotificationPagination

    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).order_by('-created_at')

    @action(detail=False, methods=['post'], url_path='mark-read')
    def mark_read(self, request):
        ids = request.data.get('ids')
        if ids is not None and not isinstance(ids, list):
            raise ValidationError({"ids": "Provide a list of notification IDs."})
        marked = mark_notifications_read(request.user, notification_ids=ids or None)
        unread = Notification.objects.filter(user=request.user, read_at__isnull=True).count()
        return Response({"marked": marked, "unread": unread})


class DeviceTokenViewSet(mixins.CreateModelMixin,
                         mixins.DestroyModelMixin,
                         viewsets.GenericViewSet):
    serializer_class = DeviceTokenSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return DeviceToken.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        user = self.request.user
        if not getattr(user, "is_authenticated", False):
            # Make the failure explicit so clients know to retry after login
            raise NotAuthenticated(detail="Login required before registering device token.")

        token = serializer.validated_data.get("token")
        platform = serializer.validated_data.get("platform")
        if not token or not platform:
            raise ValidationError({"detail": "Both token and platform are required."})

        log.info("Registering device token", extra={"user_id": getattr(user, "id", None), "platform": platform, "token_prefix": (token or "")[:8]})

        # upsert by token to avoid duplicates
        existing = DeviceToken.objects.filter(token=token).first()
        if existing:
            existing.platform = platform
            existing.user = user
            existing.active = True
            existing.save(update_fields=["platform", "user", "active", "updated_at"])
            return existing
        serializer.save(user=user, active=True)
