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


class NotificationPushPreferenceSerializer(serializers.ModelSerializer):
    SUPPORTED_ZONES = {
        'Australia/Brisbane', 'Australia/Sydney', 'Australia/Melbourne',
        'Australia/Hobart', 'Australia/Adelaide', 'Australia/Perth',
        'Australia/Darwin',
    }

    class Meta:
        model = __import__('notifications.models', fromlist=['NotificationPushPreference']).NotificationPushPreference
        fields = (
            'push_messages', 'push_tasks', 'push_work_notes', 'push_alerts',
            'quiet_hours_enabled', 'quiet_start', 'quiet_end', 'time_zone',
        )

    def validate_time_zone(self, value):
        if value not in self.SUPPORTED_ZONES:
            raise serializers.ValidationError("Select a supported Australian time zone.")
        return value

    def validate(self, attrs):
        start = attrs.get('quiet_start', getattr(self.instance, 'quiet_start', None))
        end = attrs.get('quiet_end', getattr(self.instance, 'quiet_end', None))
        enabled = attrs.get('quiet_hours_enabled', getattr(self.instance, 'quiet_hours_enabled', False))
        if enabled and start == end:
            raise serializers.ValidationError({'quiet_end': 'Quiet hours must have a non-zero duration.'})
        return attrs
