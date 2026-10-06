"""URL ownership for the rewards API."""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from .views import PillRewardsViewSet

router = DefaultRouter()
router.include_root_view = False
router.register(r'pill-rewards', PillRewardsViewSet, basename='pill-rewards')

urlpatterns = [path('', include(router.urls))]
