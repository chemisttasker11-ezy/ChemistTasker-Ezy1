"""URL routes of the talent app. Mounted inside client_profile.urls, so public paths and the `client_profile:` route names are unchanged."""
from rest_framework.routers import DefaultRouter
from talent.views.availability import UserAvailabilityViewSet
from talent.views.explorer import ExplorerPostViewSet


availability_router = DefaultRouter()
availability_router.include_root_view = False
availability_router.register(r'user-availability', UserAvailabilityViewSet, basename='user-availability')

explorer_router = DefaultRouter()
explorer_router.include_root_view = False
explorer_router.register(r'explorer-posts', ExplorerPostViewSet, basename='explorer-post')

# Combined router remains available for app-local consumers; client_profile mounts the
# two registries separately to preserve the legacy API-root ordering exactly.
router = DefaultRouter()
router.include_root_view = False
router.registry.extend(availability_router.registry)
router.registry.extend(explorer_router.registry)

urlpatterns = []   # routes are declared on the routers; client_profile adopts them
