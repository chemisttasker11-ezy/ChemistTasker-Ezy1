"""Canonical API-v1 composition.

Domain apps own their views, serializers, fixed paths and DRF router
registrations. This project module only mounts those domain URLconfs beneath
one versioned namespace; it does not rebuild or interleave their routers.
"""
from django.urls import include, path


urlpatterns = [
    path('workforce/', include('workforce.urls')),
    path('', include('dashboards.urls')),
    path('', include('onboarding.urls')),
    path('', include('organizations.urls')),
    path('', include('memberships.urls')),
    path('', include('shifts.urls')),
    path('', include('talent.urls')),
    path('', include('rewards.urls')),
    path('', include('ratings.urls')),
    path('', include('chat.urls')),
    path('', include('notifications.urls')),
    path('', include('team_calendar.urls')),
    path('', include('pharmacy_hub.urls')),
    path('', include('invoicing.urls')),
    path('', include('attendance.urls')),
    path('', include('workforce.roster.urls')),
]
