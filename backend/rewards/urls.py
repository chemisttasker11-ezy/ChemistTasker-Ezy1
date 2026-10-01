"""URL routes of the rewards app. Mounted inside client_profile.urls, so the public paths
(/api/client-profile/pill-rewards/...) and the `client_profile:` route names are unchanged."""
from rest_framework.routers import DefaultRouter

from .views import PillRewardsViewSet

router = DefaultRouter()
router.include_root_view = False   # the API root view is provided once, by client_profile's router
router.register(r'pill-rewards', PillRewardsViewSet, basename='pill-rewards')

urlpatterns = router.urls
