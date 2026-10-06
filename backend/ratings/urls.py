"""URL ownership for the ratings API."""
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from ratings.views import RatingViewSet


router = DefaultRouter()
router.include_root_view = False
router.register(r'ratings', RatingViewSet, basename='rating')

urlpatterns = [path('', include(router.urls))]
