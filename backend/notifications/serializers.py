"""Serializers for the notifications and device-token APIs."""
from rest_framework import serializers
from notifications.models import Notification
from users.models import DeviceToken


# === Notifications / Devices ===
class DeviceTokenSerializer(serializers.ModelSerializer):
    class Meta:
        model = DeviceToken
        fields = ["id", "platform", "token", "active", "created_at", "updated_at"]
        read_only_fields = ["id", "created_at", "updated_at"]
        # Allow upsert-by-token logic in the view without the unique validator blocking the request
        extra_kwargs = {
            "token": {"validators": []},
        }


class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = [
            "id",
            "type",
            "title",
            "body",
            "payload",
            "action_url",
            "created_at",
            "read_at",
        ]
        read_only_fields = fields
