"""Bounded inputs for saved tasks, roster fill and planner copies."""
from rest_framework import serializers

from memberships.models import Membership
from team_calendar.operations_models import SavedTask
from team_calendar.operations_rules import validate_times


class SavedTaskSerializer(serializers.ModelSerializer):
    class Meta:
        model = SavedTask
        fields = ['id', 'pharmacy', 'title', 'details', 'start_time', 'end_time', 'is_clinical']
        read_only_fields = ['id']

    def validate(self, attrs):
        if self.instance and attrs.get('pharmacy', self.instance.pharmacy) != self.instance.pharmacy:
            raise serializers.ValidationError({'pharmacy': 'Saved tasks cannot move between pharmacies.'})
        validate_times(attrs.get('start_time', getattr(self.instance, 'start_time', None)),
                       attrs.get('end_time', getattr(self.instance, 'end_time', None)))
        return attrs


class CopyTasksSerializer(serializers.Serializer):
    pharmacy = serializers.IntegerField(min_value=1)
    source_from = serializers.DateField()
    source_to = serializers.DateField()
    task_id = serializers.IntegerField(min_value=1, required=False, allow_null=True, default=None)
    day_offset = serializers.IntegerField(min_value=-3652058, max_value=3652058)
    request_key = serializers.CharField(max_length=128)

    def validate(self, attrs):
        if attrs['source_to'] < attrs['source_from']:
            raise serializers.ValidationError({'source_to': 'End must be on or after start.'})
        if attrs['task_id'] and attrs['source_from'] != attrs['source_to']:
            raise serializers.ValidationError({'source_to': 'Task duplication requires a single occurrence date.'})
        return attrs


class RosterFillSerializer(serializers.Serializer):
    pharmacy = serializers.IntegerField(min_value=1)
    date = serializers.DateField()
    start_time = serializers.TimeField(required=False, allow_null=True)
    end_time = serializers.TimeField(required=False, allow_null=True)
    is_clinical = serializers.BooleanField(default=False)
    role = serializers.ChoiceField(choices=Membership.ROLE_CHOICES, required=False)

    def validate(self, attrs):
        validate_times(attrs.get('start_time'), attrs.get('end_time'))
        return attrs


class SavedTaskQuerySerializer(serializers.Serializer):
    pharmacy_id = serializers.IntegerField(required=False)

    def to_internal_value(self, data):
        # An empty scope has always meant all of the manager's pharmacies.
        return super().to_internal_value({key: value for key, value in data.items() if value != ''})
