"""Input contract for in-place edits of existing roster slots.

This is deliberately separate from the marketplace ShiftSerializer's replace-all
slot payload. Omitted roster slots and omitted slot fields are never deletions.
"""
from collections.abc import Mapping

from rest_framework import serializers

from shifts.models import Shift


class StrictInputSerializer(serializers.Serializer):
    def to_internal_value(self, data):
        if isinstance(data, Mapping):
            unknown = set(data) - set(self.fields)
            if unknown:
                raise serializers.ValidationError({
                    key: "This field is not writable through the roster slot editor."
                    for key in sorted(unknown)
                })
        return super().to_internal_value(data)


class RosterSlotEditInput(StrictInputSerializer):
    id = serializers.IntegerField(min_value=1)
    date = serializers.DateField(required=False)
    start_time = serializers.TimeField(required=False)
    end_time = serializers.TimeField(required=False)
    planned_break_minutes = serializers.IntegerField(required=False, min_value=0, max_value=1440)
    rate = serializers.DecimalField(required=False, allow_null=True, max_digits=7, decimal_places=2, min_value=0)


class RosterSlotEditCommand(StrictInputSerializer):
    slots = RosterSlotEditInput(many=True, allow_empty=False)
    role_needed = serializers.ChoiceField(choices=Shift._meta.get_field("role_needed").choices, required=False)
    user_id = serializers.IntegerField(required=False, allow_null=True, min_value=1)

    def validate_slots(self, value):
        if len(value) > 100:
            raise serializers.ValidationError("Edit at most 100 identified slots in one request.")
        ids = [slot["id"] for slot in value]
        if len(ids) != len(set(ids)):
            raise serializers.ValidationError("Each slot id must occur exactly once.")
        return value
