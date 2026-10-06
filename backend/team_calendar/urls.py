"""URL ownership for team calendar and work-note APIs."""
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from team_calendar.views import CalendarEventViewSet, CalendarFeedView, WorkNoteViewSet


router = DefaultRouter()
router.include_root_view = False
router.register(r'calendar-events', CalendarEventViewSet, basename='calendar-event')
router.register(r'work-notes', WorkNoteViewSet, basename='work-note')
router.register(r'calendar-feed', CalendarFeedView, basename='calendar-feed')

urlpatterns = [path('', include(router.urls))]
