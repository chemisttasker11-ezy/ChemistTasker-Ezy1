"""Pharmacy-scoped saved tasks and explicit planner copy/roster actions."""
from rest_framework import permissions, viewsets
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView

from organizations.access import planner_pharmacies
from team_calendar.models import WorkNote
from team_calendar.operations_models import SavedTask
from team_calendar.operations_rules import copy_tasks, eligible_memberships
from team_calendar.operations_serializers import SavedTaskSerializer, CopyTasksSerializer, RosterFillSerializer


def require_manager(user, pharmacy_id):
    if not planner_pharmacies(user).filter(pk=pharmacy_id).exists():
        raise PermissionDenied("You cannot manage planner tasks for this pharmacy.")


class OperationContextView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        return Response({'pharmacies': list(planner_pharmacies(request.user).order_by('id').values(
            'id', 'name', 'organization_id',
        ))})


class SavedTaskViewSet(viewsets.ModelViewSet):
    permission_classes = [permissions.IsAuthenticated]
    serializer_class = SavedTaskSerializer

    def get_queryset(self):
        from team_calendar.views import _query_id
        qs = SavedTask.objects.filter(pharmacy__in=planner_pharmacies(self.request.user))
        pharmacy_id = _query_id(self.request, 'pharmacy_id')
        return qs.filter(pharmacy_id=pharmacy_id) if pharmacy_id is not None else qs

    def perform_create(self, serializer):
        require_manager(self.request.user, serializer.validated_data['pharmacy'].pk)
        serializer.save()


class CopyTasksView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = CopyTasksSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        pharmacy_id = data.pop('pharmacy')
        require_manager(request.user, pharmacy_id)
        return Response(copy_tasks(pharmacy_id=pharmacy_id, actor=request.user, **data))


class RosterFillView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        serializer = RosterFillSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        require_manager(request.user, data['pharmacy'])
        role = data.pop('role', None)
        note = WorkNote(pharmacy_id=data.pop('pharmacy'), **data)
        return Response({'assignee_membership_ids': list(eligible_memberships(
            note, from_roster=True, role=role,
        ).order_by('pk').values_list('pk', flat=True))})
