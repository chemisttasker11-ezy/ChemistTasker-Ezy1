"""URL ownership for notification and device-token APIs."""
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from notifications.views import DeviceTokenViewSet, NotificationViewSet


router = DefaultRouter()
router.include_root_view = False
router.register(r'notifications', NotificationViewSet, basename='notification')
router.register(r'device-tokens', DeviceTokenViewSet, basename='device-token')

urlpatterns = [path('', include(router.urls))]
