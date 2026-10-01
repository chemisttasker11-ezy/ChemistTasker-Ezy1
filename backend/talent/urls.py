"""URL routes of the talent app. Mounted inside client_profile.urls, so public paths and the `client_profile:` route names are unchanged."""
from rest_framework.routers import DefaultRouter
from talent.views.availability import UserAvailabilityViewSet
from talent.views.explorer import ExplorerPostViewSet


router = DefaultRouter()
router.include_root_view = False   # the API root view is provided once, by client_profile's router
router.register(r'user-availability', UserAvailabilityViewSet, basename='user-availability')
router.register(r'explorer-posts', ExplorerPostViewSet, basename='explorer-post')

urlpatterns = []   # routes are declared on `router`; client_profile's router adopts them
