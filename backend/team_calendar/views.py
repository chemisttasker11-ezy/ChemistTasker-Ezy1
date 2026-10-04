"""
Calendar and Work Notes API views.
Reuses existing scoping helpers (HubScopeResolver, org_roles, admin_helpers).
"""
from datetime import date, timedelta

from django.db.models import Q
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_date

from rest_framework import mixins, permissions, status, viewsets
from rest_framework.decorators import action
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response

from users.org_roles import (
    membership_capabilities,
    membership_visible_pharmacies,
    OrgCapability,
)
from users.models import OrganizationMembership

from organizations.access import is_admin_of, pharmacies_user_admins
from pharmacy_hub.access import HubScopeResolver
from memberships.models import Membership
from onboarding.models import OtherStaffOnboarding, PharmacistOnboarding
from organizations.models import Pharmacy
from team_calendar.models import CalendarEvent, WorkNote, WorkNoteAssignee, WorkNoteCompletion
from team_calendar.serializers import CalendarEventSerializer, CalendarFeedSerializer, WorkNoteSerializer
from team_calendar.recurrence import expand_recurrence_dates


def _query_id(request, name):
    """Query parameter `name` as an integer id; None when absent or empty. A malformed value is a 400."""
    value = request.query_params.get(name)
    if not value:
        return None
    try:
        return int(value)
    except ValueError:
        raise ValidationError({name: "A valid integer is required."})


def _query_date(request, name):
    """Query parameter `name` as a date; None when absent or empty. A malformed value is a 400.

    Accepts what the views accepted before: ISO 8601 dates (date.fromisoformat) and the forms the ORM parses for a
    DateField (django.utils.dateparse.parse_date, e.g. 2026-3-1)."""
    value = request.query_params.get(name)
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        pass
    try:
        parsed = parse_date(value)
    except ValueError:   # well formed but impossible, e.g. 2026-02-30
        parsed = None
    if parsed is None:
        raise ValidationError({name: "Invalid date format. Use YYYY-MM-DD."})
    return parsed


class CalendarScopeMixin:
    """
    Mixin providing calendar-specific scoping using existing helpers.
    """
    
    def get_accessible_pharmacy_ids(self, user):
        """
        Get all pharmacy IDs the user can access for calendar purposes.
        Includes:
        - Pharmacies where user is a member
        - Pharmacies where user is an admin
        - Pharmacies visible via org membership (REGION_ADMIN, etc.)
        """
        pharmacy_ids = set()
        
        # Direct memberships
        pharmacy_ids.update(
            Membership.objects.filter(user=user, is_active=True)
            .values_list('pharmacy_id', flat=True)
        )
        
        # Admin assignments
        pharmacy_ids.update(
            pharmacies_user_admins(user).values_list('id', flat=True)
        )

        # Pharmacy owners
        pharmacy_ids.update(
            Pharmacy.objects.filter(owner__user=user).values_list('id', flat=True)
        )
        
        # Organization memberships with pharmacy visibility
        org_memberships = user.organization_memberships.select_related('organization').prefetch_related('pharmacies')
        for membership in org_memberships:
            visible = membership_visible_pharmacies(membership)
            pharmacy_ids.update(visible.values_list('id', flat=True))
        
        return pharmacy_ids
    
    def get_accessible_organization_ids(self, user):
        """
        Get organization IDs the user can access for org-level calendar events.
        """
        org_ids = set()
        
        # Via staff memberships at pharmacies within orgs
        org_ids.update(
            Membership.objects.filter(user=user, is_active=True)
            .exclude(pharmacy__organization__isnull=True)
            .values_list('pharmacy__organization_id', flat=True)
        )
        
        # Via direct org membership
        org_ids.update(
            OrganizationMembership.objects.filter(user=user)
            .values_list('organization_id', flat=True)
        )
        
        return org_ids
    
    def can_manage_calendar(self, user, pharmacy_id):
        """
        Check if user can create/edit calendar events for a pharmacy.
        Requires admin permissions or MANAGE_ROSTER capability.
        """
        if is_admin_of(user, pharmacy_id):
            return True
        
        # Check org-level permissions
        pharmacy = Pharmacy.objects.filter(id=pharmacy_id).select_related('organization', 'owner').first()
        if pharmacy and pharmacy.organization_id:
            org_membership = OrganizationMembership.objects.filter(
                user=user,
                organization_id=pharmacy.organization_id,
            ).first()
            if org_membership:
                caps = membership_capabilities(org_membership)
                if OrgCapability.MANAGE_ROSTER in caps or OrgCapability.MANAGE_ADMINS in caps:
                    return True

        if pharmacy and pharmacy.owner_id:
            owner_user_id = getattr(pharmacy.owner, "user_id", None)
            if owner_user_id == user.id:
                return True
        
        return False
    
    def can_create_work_notes(self, user, pharmacy_id):
        """
        Check if user can create/edit work notes for a pharmacy.
        Any active member of the pharmacy can create work notes.
        """
        # Admins can always create
        if self.can_manage_calendar(user, pharmacy_id):
            return True
        
        # Any active member of this pharmacy can create work notes
        return Membership.objects.filter(
            user=user,
            pharmacy_id=pharmacy_id,
            is_active=True,
        ).exists()
    
    def can_view_birthdays(self, user, pharmacy_id):
        """
        Check if user can view staff birthdays.
        Requires admin permissions.
        """
        return self.can_manage_calendar(user, pharmacy_id)


class CalendarEventViewSet(
    CalendarScopeMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    ViewSet for calendar events.
    Supports pharmacy-scoped and organization-scoped events.
    """
    serializer_class = CalendarEventSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        pharmacy_id = _query_id(self.request, 'pharmacy_id')
        organization_id = _query_id(self.request, 'organization_id')
        date_from = _query_date(self.request, 'date_from')
        date_to = _query_date(self.request, 'date_to')
        source = self.request.query_params.get('source')
        
        queryset = CalendarEvent.objects.select_related(
            'pharmacy', 'organization', 'created_by', 'source_membership'
        )
        
        # Scope by pharmacy or organization
        if pharmacy_id is not None:
            accessible = self.get_accessible_pharmacy_ids(user)
            if pharmacy_id not in accessible:
                return CalendarEvent.objects.none()
            queryset = queryset.filter(pharmacy_id=pharmacy_id)
            
            # Filter out birthdays if user can't view them
            if not self.can_view_birthdays(user, pharmacy_id):
                queryset = queryset.exclude(source=CalendarEvent.Source.BIRTHDAY)
        elif organization_id is not None:
            accessible = self.get_accessible_organization_ids(user)
            if organization_id not in accessible:
                return CalendarEvent.objects.none()
            queryset = queryset.filter(organization_id=organization_id)
        else:
            # Return events for all accessible pharmacies/orgs
            pharmacy_ids = self.get_accessible_pharmacy_ids(user)
            org_ids = self.get_accessible_organization_ids(user)
            queryset = queryset.filter(
                Q(pharmacy_id__in=pharmacy_ids) | Q(organization_id__in=org_ids)
            )
        
        # Date range filter
        if date_from:
            queryset = queryset.filter(date__gte=date_from)
        if date_to:
            queryset = queryset.filter(date__lte=date_to)
        
        # Source filter
        if source:
            queryset = queryset.filter(source=source)
        
        return queryset.order_by('date', 'start_time')
    
    def perform_create(self, serializer):
        pharmacy_id = self.request.data.get('pharmacy')
        organization_id = self.request.data.get('organization')
        
        if pharmacy_id:
            if not self.can_manage_calendar(self.request.user, int(pharmacy_id)):
                raise PermissionDenied("You don't have permission to create events for this pharmacy.")
        elif organization_id:
            # Check org admin permissions
            accessible = self.get_accessible_organization_ids(self.request.user)
            if int(organization_id) not in accessible:
                raise PermissionDenied("You don't have access to this organization.")
            # Only org admins can create org-level events
            is_org_admin = OrganizationMembership.objects.filter(
                user=self.request.user,
                organization_id=organization_id,
                role='ORG_ADMIN',
            ).exists()
            if not is_org_admin:
                raise PermissionDenied("Only organization admins can create organization-level events.")
        else:
            raise ValidationError({"pharmacy": "Either pharmacy or organization is required."})
        
        serializer.save()
    
    def perform_update(self, serializer):
        event = self.get_object()
        
        # Can't edit auto-generated events
        if event.source != CalendarEvent.Source.MANUAL:
            raise PermissionDenied("Cannot edit auto-generated events.")
        
        if event.pharmacy_id:
            if not self.can_manage_calendar(self.request.user, event.pharmacy_id):
                raise PermissionDenied("You don't have permission to edit this event.")
        elif event.organization_id:
            is_org_admin = OrganizationMembership.objects.filter(
                user=self.request.user,
                organization_id=event.organization_id,
                role='ORG_ADMIN',
            ).exists()
            if not is_org_admin:
                raise PermissionDenied("Only organization admins can edit organization-level events.")
        
        serializer.save()
    
    def perform_destroy(self, instance):
        if instance.source != CalendarEvent.Source.MANUAL:
            raise PermissionDenied("Cannot delete auto-generated events.")
        
        if instance.pharmacy_id:
            if not self.can_manage_calendar(self.request.user, instance.pharmacy_id):
                raise PermissionDenied("You don't have permission to delete this event.")
        elif instance.organization_id:
            is_org_admin = OrganizationMembership.objects.filter(
                user=self.request.user,
                organization_id=instance.organization_id,
                role='ORG_ADMIN',
            ).exists()
            if not is_org_admin:
                raise PermissionDenied("Only organization admins can delete organization-level events.")
        
        instance.delete()


class WorkNoteViewSet(
    CalendarScopeMixin,
    mixins.ListModelMixin,
    mixins.CreateModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,
):
    """
    ViewSet for work notes.
    Scoped to pharmacy level.
    """
    serializer_class = WorkNoteSerializer
    permission_classes = [permissions.IsAuthenticated]
    
    def get_queryset(self):
        user = self.request.user
        pharmacy_id = _query_id(self.request, 'pharmacy_id')
        date_from = _query_date(self.request, 'date_from')
        date_to = _query_date(self.request, 'date_to')
        status_filter = self.request.query_params.get('status')
        assigned_to_me = self.request.query_params.get('assigned_to_me')
        
        queryset = WorkNote.objects.select_related(
            'pharmacy', 'created_by'
        ).prefetch_related('assignees__membership__user')
        
        # Scope by pharmacy or user's accessible pharmacies
        if pharmacy_id is not None:
            accessible = self.get_accessible_pharmacy_ids(user)
            if pharmacy_id not in accessible:
                return WorkNote.objects.none()
            queryset = queryset.filter(pharmacy_id=pharmacy_id)
        else:
            pharmacy_ids = self.get_accessible_pharmacy_ids(user)
            queryset = queryset.filter(pharmacy_id__in=pharmacy_ids)
        
        # Date range filter
        if date_from:
            queryset = queryset.filter(date__gte=date_from)
        if date_to:
            queryset = queryset.filter(date__lte=date_to)
        
        # Status filter
        if status_filter:
            queryset = queryset.filter(status=status_filter)
        
        # Filter to notes assigned to current user or general notes
        if assigned_to_me == 'true':
            my_membership_ids = list(
                Membership.objects.filter(user=user, is_active=True)
                .values_list('id', flat=True)
            )
            queryset = queryset.filter(
                Q(assignees__membership_id__in=my_membership_ids) | Q(is_general=True)
            ).distinct()
        
        return queryset.order_by('-date', '-created_at')
    
    def perform_create(self, serializer):
        pharmacy_id = self.request.data.get('pharmacy')
        
        if not pharmacy_id:
            raise ValidationError({"pharmacy": "This field is required."})
        
        if not self.can_create_work_notes(self.request.user, int(pharmacy_id)):
            raise PermissionDenied("You don't have permission to create work notes for this pharmacy.")
        
        serializer.save()
    
    def perform_update(self, serializer):
        note = self.get_object()
        
        if not self.can_create_work_notes(self.request.user, note.pharmacy_id):
            raise PermissionDenied("You don't have permission to edit this work note.")
        
        serializer.save()
    
    def perform_destroy(self, instance):
        if not self.can_create_work_notes(self.request.user, instance.pharmacy_id):
            raise PermissionDenied("You don't have permission to delete this work note.")
        
        instance.delete()

    def _get_occurrence_date(self, request, note):
        date_str = request.data.get("occurrence_date") or request.query_params.get("occurrence_date")
        if date_str:
            try:
                return date.fromisoformat(date_str)
            except ValueError:
                raise ValidationError({"occurrence_date": "Invalid date format. Use YYYY-MM-DD."})
        return note.date

    def _get_user_membership(self, user, pharmacy_id):
        return Membership.objects.filter(
            user=user,
            pharmacy_id=pharmacy_id,
            is_active=True,
        ).first()
    
    @action(detail=True, methods=['post'])
    def mark_done(self, request, pk=None):
        """Mark a work note as done."""
        note = self.get_object()
        membership = self._get_user_membership(request.user, note.pharmacy_id)
        if not membership:
            raise PermissionDenied("You don't have an active membership for this pharmacy.")

        if not note.is_general and not WorkNoteAssignee.objects.filter(
            work_note=note,
            membership=membership,
        ).exists() and not self.can_manage_calendar(request.user, note.pharmacy_id):
            raise PermissionDenied("You can only mark notes assigned to you as done.")

        occurrence_date = self._get_occurrence_date(request, note)
        WorkNoteCompletion.objects.update_or_create(
            work_note=note,
            membership=membership,
            occurrence_date=occurrence_date,
            defaults={
                "completed_at": timezone.now(),
                "completed_by": request.user,
            },
        )
        return Response(self.get_serializer(note).data)
    
    @action(detail=True, methods=['post'])
    def mark_open(self, request, pk=None):
        """Mark a work note as open."""
        note = self.get_object()
        membership = self._get_user_membership(request.user, note.pharmacy_id)
        if not membership:
            raise PermissionDenied("You don't have an active membership for this pharmacy.")

        occurrence_date = self._get_occurrence_date(request, note)
        WorkNoteCompletion.objects.filter(
            work_note=note,
            membership=membership,
            occurrence_date=occurrence_date,
        ).delete()
        return Response(self.get_serializer(note).data)


class CalendarFeedView(CalendarScopeMixin, viewsets.ViewSet):
    """
    Aggregated calendar feed combining events and work notes.
    Provides a single endpoint for the calendar UI.
    """
    permission_classes = [permissions.IsAuthenticated]
    
    def list(self, request):
        user = request.user
        pharmacy_id = _query_id(request, 'pharmacy_id')
        organization_id = _query_id(request, 'organization_id')
        
        # Default to current month
        today = timezone.now().date()
        date_from = _query_date(request, 'date_from') or today.replace(day=1)
        date_to = _query_date(request, 'date_to')
        if date_to is None:
            # End of month
            next_month = date_from.replace(day=28) + timedelta(days=4)
            date_to = next_month - timedelta(days=next_month.day)
        
        # Get accessible IDs
        accessible_pharmacy_ids = self.get_accessible_pharmacy_ids(user)
        accessible_org_ids = self.get_accessible_organization_ids(user)
        
        # Build event query
        event_query = CalendarEvent.objects.select_related(
            'pharmacy', 'organization', 'created_by'
        )
        
        # Build work note query
        work_note_query = WorkNote.objects.select_related(
            'pharmacy', 'created_by'
        ).prefetch_related('assignees__membership__user')
        
        if pharmacy_id is not None:
            if pharmacy_id not in accessible_pharmacy_ids:
                return Response({"error": "Access denied"}, status=status.HTTP_403_FORBIDDEN)
            event_query = event_query.filter(pharmacy_id=pharmacy_id)
            work_note_query = work_note_query.filter(pharmacy_id=pharmacy_id)
            
            # Filter birthdays based on permissions
            if not self.can_view_birthdays(user, pharmacy_id):
                event_query = event_query.exclude(source=CalendarEvent.Source.BIRTHDAY)
        elif organization_id is not None:
            if organization_id not in accessible_org_ids:
                return Response({"error": "Access denied"}, status=status.HTTP_403_FORBIDDEN)
            event_query = event_query.filter(organization_id=organization_id)
            # Work notes are pharmacy-scoped, so get org's pharmacies
            org_pharmacy_ids = list(
                Pharmacy.objects.filter(organization_id=organization_id)
                .values_list('id', flat=True)
            )
            work_note_query = work_note_query.filter(pharmacy_id__in=org_pharmacy_ids)
        else:
            event_query = event_query.filter(
                Q(pharmacy_id__in=accessible_pharmacy_ids) | 
                Q(organization_id__in=accessible_org_ids)
            )
            work_note_query = work_note_query.filter(pharmacy_id__in=accessible_pharmacy_ids)
        
        date_from_iso = date_from.isoformat()
        recurring_event_q = (
            Q(recurrence__isnull=False)
            & ~Q(recurrence={})
            & Q(date__lte=date_to)
            & (
                Q(recurrence__until_date__isnull=True)
                | Q(recurrence__until_date="")
                | Q(recurrence__until_date__gte=date_from_iso)
            )
        )
        event_query = event_query.filter(
            Q(recurrence__isnull=True, date__gte=date_from, date__lte=date_to)
            | recurring_event_q
        )

        recurring_note_q = (
            Q(recurrence__isnull=False)
            & ~Q(recurrence={})
            & Q(date__lte=date_to)
            & (
                Q(recurrence__until_date__isnull=True)
                | Q(recurrence__until_date="")
                | Q(recurrence__until_date__gte=date_from_iso)
            )
        )
        work_note_query = work_note_query.filter(
            Q(recurrence__isnull=True, date__gte=date_from, date__lte=date_to)
            | recurring_note_q
        )

        events = list(event_query.order_by('date', 'start_time'))
        work_notes = list(work_note_query.order_by('date'))

        note_pharmacy_ids = {note.pharmacy_id for note in work_notes}
        membership_map = {}
        if note_pharmacy_ids:
            membership_map = {
                m.pharmacy_id: m.id
                for m in Membership.objects.filter(
                    user=user,
                    is_active=True,
                    pharmacy_id__in=note_pharmacy_ids,
                )
            }

        admin_pharmacy_ids = {
            pharmacy_id
            for pharmacy_id in note_pharmacy_ids
            if self.can_manage_calendar(user, pharmacy_id)
        }

        completion_set = set()
        if work_notes and membership_map:
            completion_set = set(
                WorkNoteCompletion.objects.filter(
                    work_note_id__in=[note.id for note in work_notes],
                    membership_id__in=membership_map.values(),
                    occurrence_date__gte=date_from,
                    occurrence_date__lte=date_to,
                ).values_list("work_note_id", "membership_id", "occurrence_date")
            )

        completion_by_map = {}
        if work_notes and admin_pharmacy_ids:
            completion_rows = (
                WorkNoteCompletion.objects.filter(
                    work_note_id__in=[note.id for note in work_notes],
                    work_note__pharmacy_id__in=admin_pharmacy_ids,
                    occurrence_date__gte=date_from,
                    occurrence_date__lte=date_to,
                )
                .select_related("membership__user")
            )
            for completion in completion_rows:
                key = (completion.work_note_id, completion.occurrence_date)
                user_obj = completion.membership.user
                name = (
                    user_obj.get_full_name()
                    or user_obj.email
                    or f"User {user_obj.id}"
                )
                completion_by_map.setdefault(key, []).append(name)

        serialized_events = []
        for evt in events:
            base_data = CalendarEventSerializer(evt, many=False, context={'request': request}).data
            rec_dates = expand_recurrence_dates(evt.date, evt.recurrence, date_from, date_to)
            if not rec_dates:
                base_data['is_occurrence'] = False
                serialized_events.append(base_data)
            else:
                for occurrence in rec_dates:
                    occurrence_data = dict(base_data)
                    occurrence_data['occurrence_date'] = occurrence.isoformat()
                    occurrence_data['series_id'] = base_data['id']
                    occurrence_data['is_occurrence'] = True
                    occurrence_data['id'] = f"{base_data['id']}-{occurrence.isoformat()}"
                    occurrence_data['date'] = occurrence.isoformat()
                    serialized_events.append(occurrence_data)

        serialized_notes = []
        for note in work_notes:
            base_data = WorkNoteSerializer(note, many=False, context={'request': request}).data
            membership_id = membership_map.get(note.pharmacy_id)
            rec_dates = expand_recurrence_dates(note.date, note.recurrence, date_from, date_to)
            if not rec_dates:
                if membership_id:
                    base_data['status'] = (
                        WorkNote.Status.DONE
                        if (note.id, membership_id, note.date) in completion_set
                        else WorkNote.Status.OPEN
                    )
                if note.pharmacy_id in admin_pharmacy_ids:
                    base_data['completed_by'] = completion_by_map.get(
                        (note.id, note.date),
                        [],
                    )
                base_data['is_occurrence'] = False
                serialized_notes.append(base_data)
            else:
                for occurrence in rec_dates:
                    occurrence_data = dict(base_data)
                    if membership_id:
                        occurrence_data['status'] = (
                            WorkNote.Status.DONE
                            if (note.id, membership_id, occurrence) in completion_set
                            else WorkNote.Status.OPEN
                        )
                    if note.pharmacy_id in admin_pharmacy_ids:
                        occurrence_data['completed_by'] = completion_by_map.get(
                            (note.id, occurrence),
                            [],
                        )
                    occurrence_data['occurrence_date'] = occurrence.isoformat()
                    occurrence_data['series_id'] = base_data['id']
                    occurrence_data['is_occurrence'] = True
                    occurrence_data['id'] = f"{base_data['id']}-{occurrence.isoformat()}"
                    occurrence_data['date'] = occurrence.isoformat()
                    serialized_notes.append(occurrence_data)

        data = {
            'events': serialized_events,
            'work_notes': serialized_notes,
            'date_from': date_from.isoformat(),
            'date_to': date_to.isoformat(),
            'pharmacy_id': pharmacy_id,
            'organization_id': organization_id,
        }
        
        return Response(data)
