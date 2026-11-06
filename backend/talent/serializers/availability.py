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

    def validate(self, attrs):
        scheduling_fields = (
            'date', 'start_time', 'end_time', 'is_all_day',
            'is_recurring', 'recurring_days', 'recurring_end_date',
        )
        # Metadata PATCHes must keep supported legacy open-ended schedules editable.
        if self.partial and self.instance is not None and not any(
            field in attrs and attrs[field] != getattr(self.instance, field) for field in scheduling_fields
        ):
            return attrs

        start_time = attrs.get('start_time', getattr(self.instance, 'start_time', None))
        end_time = attrs.get('end_time', getattr(self.instance, 'end_time', None))
        if start_time is not None and end_time is not None and end_time <= start_time:
            raise serializers.ValidationError({'end_time': 'End time must be after start time.'})

        is_recurring = attrs.get('is_recurring', getattr(self.instance, 'is_recurring', False))
        recurring_days = attrs.get('recurring_days', getattr(self.instance, 'recurring_days', None))
        recurring_end_date = attrs.get('recurring_end_date', getattr(self.instance, 'recurring_end_date', None))
        if is_recurring:
            if not recurring_days or not isinstance(recurring_days, list):
                raise serializers.ValidationError({'recurring_days': 'Recurring availability requires at least one weekday.'})
            if not recurring_end_date:
                raise serializers.ValidationError({'recurring_end_date': 'Recurring availability requires an end date.'})

        if recurring_days is not None:
            if not isinstance(recurring_days, list) or any(
                isinstance(d, bool) or not isinstance(d, int) or d < 0 or d > 6 for d in recurring_days
            ):
                raise serializers.ValidationError({'recurring_days': 'Recurring days must be integers 0..6.'})

        date = attrs.get('date', getattr(self.instance, 'date', None))
        if recurring_end_date is not None and date is not None and recurring_end_date < date:
            raise serializers.ValidationError({'recurring_end_date': 'Recurring end date must be on or after start date.'})

        return attrs
