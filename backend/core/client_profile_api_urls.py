"""Project-level composition for the legacy /api/client-profile/ surface.

Each Django app owns its views, models and local URL declarations. This module
owns only composition and preserves the established public route ordering and
the `client_profile:` namespace used by all ChemistTasker clients.
"""
from django.urls import include, path
from rest_framework.routers import DefaultRouter

from client_profile.urls import router as client_profile_router
from rewards.urls import router as rewards_router
from ratings.urls import router as ratings_router
from talent.urls import availability_router as talent_availability_router, explorer_router as talent_explorer_router
from team_calendar.urls import router as team_calendar_router
from notifications.urls import router as notifications_router
from chat.urls import messages_router as chat_messages_router, rooms_router as chat_rooms_router
from workforce.roster.urls import router as workforce_roster_router
from shifts.urls import (
    discovery_router as shift_discovery_router,
    engagement_router as shift_engagement_router,
    lifecycle_router as shift_lifecycle_router,
)
from memberships.urls import (
    intake_router as membership_intake_router,
    membership_router,
    self_router as membership_self_router,
)


router = DefaultRouter()

# Preserve the exact historical DRF API-root registration order.
kernel = {prefix: (viewset, basename) for prefix, viewset, basename in client_profile_router.registry}

for prefix in [
    'organizations',
    'chains',
    'pharmacies',
    'pharmacy-claims',
]:
    viewset, basename = kernel[prefix]
    router.register(prefix, viewset, basename=basename)

router.registry.extend(membership_router.registry)

viewset, basename = kernel['pharmacy-admins']
router.register('pharmacy-admins', viewset, basename=basename)

router.registry.extend(membership_intake_router.registry)

router.registry.extend(shift_discovery_router.registry)
router.registry.extend(talent_availability_router.registry)
router.registry.extend(rewards_router.registry)

router.registry.extend(shift_lifecycle_router.registry)

router.registry.extend(workforce_roster_router.registry)

router.registry.extend(shift_engagement_router.registry)

router.registry.extend(ratings_router.registry)
router.registry.extend(chat_rooms_router.registry)

router.registry.extend(membership_self_router.registry)

router.registry.extend(chat_messages_router.registry)
router.registry.extend(notifications_router.registry)
router.registry.extend(talent_explorer_router.registry)
router.registry.extend(team_calendar_router.registry)


urlpatterns = [
    path('workforce/', include('workforce.urls')),
    path('', include('client_profile.urls')),
    path('', include('memberships.urls')),
    path('', include('shifts.urls')),
    path('', include('chat.urls')),
    path('', include('pharmacy_hub.urls')),
    path('', include('invoicing.urls')),
    path('', include('attendance.urls')),
    path('', include('workforce.roster.urls')),
    path('', include(router.urls)),
]
