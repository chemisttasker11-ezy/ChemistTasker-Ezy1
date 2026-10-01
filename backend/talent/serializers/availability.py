"""Serializer for users' availability slots."""
from rest_framework import serializers
from talent.models import UserAvailability


# Availability
class UserAvailabilitySerializer(serializers.ModelSerializer):
    class Meta:
        model = UserAvailability
        fields = [
            'id', 'date', 'start_time', 'end_time',
            'is_all_day', 'is_recurring', 'recurring_days',
            'recurring_end_date', 'notify_new_shifts', 'notes'
        ]
        read_only_fields = ['id']
