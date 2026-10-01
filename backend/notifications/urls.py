"""URL routes of the notifications app. Mounted inside client_profile.urls, so public paths and the `client_profile:` route names are unchanged."""
from rest_framework.routers import DefaultRouter
from notifications.views import DeviceTokenViewSet, NotificationViewSet


router = DefaultRouter()
router.include_root_view = False   # the API root view is provided once, by client_profile's router
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'device-tokens', DeviceTokenViewSet, basename='device-token')

urlpatterns = []   # routes are declared on `router`; client_profile's router adopts them
