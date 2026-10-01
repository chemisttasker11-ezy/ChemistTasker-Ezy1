"""URL routes of the ratings app. Mounted through client_profile's router, so public paths and the `client_profile:` route names are unchanged."""
from rest_framework.routers import DefaultRouter
from ratings.views import RatingViewSet


router = DefaultRouter()
router.include_root_view = False   # the API root view is provided once, by client_profile's router
router.register(r'ratings', RatingViewSet, basename='rating')

urlpatterns = []   # routes are declared on `router`; client_profile's router adopts them
