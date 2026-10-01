"""URL routes of the team_calendar app. Mounted inside client_profile.urls, so public paths and the `client_profile:` route names are unchanged."""
from rest_framework.routers import DefaultRouter
from team_calendar.views import CalendarEventViewSet, CalendarFeedView, WorkNoteViewSet


router = DefaultRouter()
router.include_root_view = False   # the API root view is provided once, by client_profile's router
router.register(r'calendar-events', CalendarEventViewSet, basename='calendar-event')
router.register(r'work-notes', WorkNoteViewSet, basename='work-note')
router.register(r'calendar-feed', CalendarFeedView, basename='calendar-feed')

urlpatterns = []   # routes are declared on `router`; client_profile's router adopts them
