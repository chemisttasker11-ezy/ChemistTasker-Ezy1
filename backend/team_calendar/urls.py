"""URL ownership for team calendar and work-note APIs."""
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from team_calendar.views import CalendarEventViewSet, CalendarFeedView, WorkNoteViewSet


from team_calendar.operations_views import (
    OperationContextView, OperationCatalogView, OperationTemplateViewSet,
    OperationPlanViewSet, OperationTaskViewSet,
)

router = DefaultRouter()
router.include_root_view = False
router.register(r'calendar-events', CalendarEventViewSet, basename='calendar-event')
router.register(r'work-notes', WorkNoteViewSet, basename='work-note')
router.register(r'calendar-feed', CalendarFeedView, basename='calendar-feed')

router.register(r'operation-templates', OperationTemplateViewSet, basename='operation-template')
router.register(r'operation-plans', OperationPlanViewSet, basename='operation-plan')
router.register(r'operation-items', OperationTaskViewSet, basename='operation-item')

urlpatterns = [
    path('operation-context/', OperationContextView.as_view(), name='operation-context'),
    path('operation-catalog/', OperationCatalogView.as_view(), name='operation-catalog'),
    path('', include(router.urls)),
]
