"""URL ownership for talent availability and explorer APIs."""
from django.urls import include, path
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

urlpatterns = [path('', include(router.urls))]
