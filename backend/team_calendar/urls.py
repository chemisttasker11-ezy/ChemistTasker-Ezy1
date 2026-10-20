"""URL ownership for team calendar and work-note APIs."""
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from team_calendar.views import CalendarEventViewSet, CalendarFeedView, WorkNoteViewSet
from team_calendar.operations_views import OperationContextView, SavedTaskViewSet, CopyTasksView, RosterFillView

router = DefaultRouter()
router.include_root_view = False
router.register(r'calendar-events', CalendarEventViewSet, basename='calendar-event')
router.register(r'work-notes', WorkNoteViewSet, basename='work-note')
router.register(r'calendar-feed', CalendarFeedView, basename='calendar-feed')
router.register(r'saved-tasks', SavedTaskViewSet, basename='saved-task')

urlpatterns = [
    path('operation-context/', OperationContextView.as_view(), name='operation-context'),
    path('planner-copy/', CopyTasksView.as_view(), name='planner-copy'),
    path('planner-roster-fill/', RosterFillView.as_view(), name='planner-roster-fill'),
    path('', include(router.urls)),
]
