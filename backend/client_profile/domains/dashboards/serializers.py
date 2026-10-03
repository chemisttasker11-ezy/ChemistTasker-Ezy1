"""Response serializers of the role dashboards."""
from rest_framework import serializers
from users.serializers import UserProfileSerializer


# === Dashboards ===
class ShiftSummarySerializer(serializers.Serializer):
    id = serializers.IntegerField()
    pharmacy_name = serializers.CharField()
    date = serializers.DateField()


class OwnerDashboardResponseSerializer(serializers.Serializer):
    user = UserProfileSerializer()
    message = serializers.CharField()
    upcoming_shifts_count = serializers.IntegerField()
    confirmed_shifts_count = serializers.IntegerField()
    shifts = ShiftSummarySerializer(many=True)
    bills_summary = serializers.DictField()


class PharmacistDashboardResponseSerializer(serializers.Serializer):
    user = UserProfileSerializer()
    message = serializers.CharField()
    upcoming_shifts_count = serializers.IntegerField()
    confirmed_shifts_count = serializers.IntegerField()
    community_shifts_count = serializers.IntegerField()
    shifts = ShiftSummarySerializer(many=True)
    community_shifts = ShiftSummarySerializer(many=True)
    bills_summary = serializers.DictField()


class OtherStaffDashboardResponseSerializer(serializers.Serializer):
    user = UserProfileSerializer()
    message = serializers.CharField()
    upcoming_shifts_count = serializers.IntegerField()
    confirmed_shifts_count = serializers.IntegerField()
    community_shifts_count = serializers.IntegerField()
    shifts = ShiftSummarySerializer(many=True)
    community_shifts = ShiftSummarySerializer(many=True)
    bills_summary = serializers.DictField()


class ExplorerDashboardResponseSerializer(serializers.Serializer):
    user = UserProfileSerializer()
    message = serializers.CharField()
