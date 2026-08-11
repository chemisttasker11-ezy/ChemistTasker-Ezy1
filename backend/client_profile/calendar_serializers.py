"""
Calendar and Work Notes serializers.
"""
from rest_framework import serializers
from django.utils import timezone

from .models import (
    CalendarEvent,
    Membership,
    WorkNote,
    WorkNoteAssignee,
)


MEMBERSHIP_ROLE_LABELS = dict(Membership.ROLE_CHOICES)
MEMBERSHIP_EMPLOYMENT_TYPE_LABELS = dict(Membership.EMPLOYMENT_TYPE_CHOICES)


def format_membership_display_name(membership):
    user = getattr(membership, 'user', None)
    invited_name = (getattr(membership, 'invited_name', '') or '').strip()
    user_name = user.get_full_name() if user else ''
    base_name = invited_name or user_name or (user.email if user else None)

    role = MEMBERSHIP_ROLE_LABELS.get(getattr(membership, 'role', None), getattr(membership, 'role', '') or '')
    job_title = (getattr(membership, 'job_title', '') or '').strip()
    employment_type = MEMBERSHIP_EMPLOYMENT_TYPE_LABELS.get(
        getattr(membership, 'employment_type', None),
        getattr(membership, 'employment_type', '') or '',
    )

    parts = [base_name, role, job_title, employment_type]
    return ' | '.join(str(part).strip() for part in parts if part)


class WorkNoteAssigneeSerializer(serializers.ModelSerializer):
    """Serializer for work note assignees."""
    membership_id = serializers.IntegerField(source='membership.id', read_only=True)
    user_id = serializers.IntegerField(source='membership.user_id', read_only=True)
    user_name = serializers.SerializerMethodField()
    
    class Meta:
        model = WorkNoteAssignee
        fields = ['id', 'membership_id', 'user_id', 'user_name', 'notified_at', 'created_at']
        read_only_fields = ['id', 'notified_at', 'created_at']
    
    def get_user_name(self, obj):
        return format_membership_display_name(obj.membership) or None


class WorkNoteSerializer(serializers.ModelSerializer):
    """Serializer for work notes."""
    assignees = WorkNoteAssigneeSerializer(many=True, read_only=True)
    assignee_membership_ids = serializers.ListField(
        child=serializers.IntegerField(),
        write_only=True,
        required=False,
        help_text="List of membership IDs to assign this note to"
    )
    created_by_name = serializers.SerializerMethodField()
    
    class Meta:
        model = WorkNote
        fields = [
            'id', 'pharmacy', 'date', 'title', 'body', 'status',
            'notify_on_shift_start', 'is_general', 'recurrence',
            'assignees', 'assignee_membership_ids',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at']
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.email
        return None
    
    def validate_assignee_membership_ids(self, value):
        """Validate that all membership IDs are valid and belong to the pharmacy."""
        if not value:
            return value
        
        pharmacy_id = self.initial_data.get('pharmacy') or (
            self.instance.pharmacy_id if self.instance else None
        )
        if not pharmacy_id:
            raise serializers.ValidationError("Pharmacy is required to validate assignees")
        
        # Check that all memberships exist and belong to the pharmacy
        valid_ids = set(
            Membership.objects.filter(
                id__in=value,
                pharmacy_id=pharmacy_id,
                is_active=True,
            ).values_list('id', flat=True)
        )
        
        invalid_ids = set(value) - valid_ids
        if invalid_ids:
            raise serializers.ValidationError(
                f"Invalid or inactive membership IDs for this pharmacy: {list(invalid_ids)}"
            )
        
        return value
    
    def create(self, validated_data):
        assignee_ids = validated_data.pop('assignee_membership_ids', [])
        validated_data['created_by'] = self.context['request'].user
        
        work_note = super().create(validated_data)
        
        # Create assignee records
        if assignee_ids:
            WorkNoteAssignee.objects.bulk_create([
                WorkNoteAssignee(work_note=work_note, membership_id=mid)
                for mid in assignee_ids
            ])
        
        return work_note
    
    def update(self, instance, validated_data):
        assignee_ids = validated_data.pop('assignee_membership_ids', None)
        
        instance = super().update(instance, validated_data)
        
        # Update assignees if provided
        if assignee_ids is not None:
            # Remove old, add new
            instance.assignees.exclude(membership_id__in=assignee_ids).delete()
            existing_ids = set(instance.assignees.values_list('membership_id', flat=True))
            new_ids = set(assignee_ids) - existing_ids
            if new_ids:
                WorkNoteAssignee.objects.bulk_create([
                    WorkNoteAssignee(work_note=instance, membership_id=mid)
                    for mid in new_ids
                ])
        
        return instance


class CalendarEventSerializer(serializers.ModelSerializer):
    """Serializer for calendar events."""
    created_by_name = serializers.SerializerMethodField()
    source_display = serializers.CharField(source='get_source_display', read_only=True)
    is_read_only = serializers.SerializerMethodField()
    
    class Meta:
        model = CalendarEvent
        fields = [
            'id', 'pharmacy', 'organization', 'title', 'description',
            'date', 'start_time', 'end_time', 'all_day', 'recurrence',
            'source', 'source_display', 'source_membership',
            'is_read_only',
            'created_by', 'created_by_name', 'created_at', 'updated_at',
        ]
        read_only_fields = ['id', 'created_by', 'created_at', 'updated_at', 'source_membership']
    
    def get_created_by_name(self, obj):
        if obj.created_by:
            return obj.created_by.get_full_name() or obj.created_by.email
        return None
    
    def get_is_read_only(self, obj):
        """
        Events are read-only if:
        - They are auto-generated (birthday, shift, org_event)
        - Or if the user doesn't have edit permissions (handled in viewset)
        """
        return obj.source in [
            CalendarEvent.Source.BIRTHDAY,
            CalendarEvent.Source.SHIFT,
            CalendarEvent.Source.ORG_EVENT,
        ]
    
    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        # Manual events only
        validated_data['source'] = CalendarEvent.Source.MANUAL
        return super().create(validated_data)


class CalendarFeedSerializer(serializers.Serializer):
    """
    Aggregated calendar feed combining events, work notes, and birthdays.
    """
    events = CalendarEventSerializer(many=True)
    work_notes = WorkNoteSerializer(many=True)
    
    # Metadata
    date_from = serializers.DateField()
    date_to = serializers.DateField()
    pharmacy_id = serializers.IntegerField(allow_null=True)
    organization_id = serializers.IntegerField(allow_null=True)
