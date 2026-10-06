"""Canonical API-v1 composition.

Domain apps own their views, serializers, fixed paths and DRF router
registrations. This project module only mounts those domain URLconfs beneath
one versioned namespace; it does not rebuild or interleave their routers.
"""
from django.conf import settings
from django.urls import include, path
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView

from users.views import DeleteAccountView
from worker_finance import legacy as finance_legacy


urlpatterns = [
    path('users/', include('users.urls')),
    path('public-hub/', include('public_hub.urls')),
    path('marketplace/', include('marketplace.urls')),
    path('ethical/', include('ethical_marketplace.urls')),
    path('content/', include('public_hub.content_urls')),

    # Keep finance workspace and managed-invoice guards ahead of the generic
    # invoice domain so managed snapshots cannot fall through to legacy editing.
    path('finance/', include('worker_finance.urls')),
    path('invoices/<int:pk>/', finance_legacy.detail),
    path('invoices/<int:invoice_id>/pdf/', finance_legacy.pdf),
    path('invoices/<int:invoice_id>/send/', finance_legacy.send),

    path('billing/', include('billing.urls', namespace='billing')),
    path('account/', DeleteAccountView.as_view(), name='delete-account'),

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

if settings.DEBUG:
    urlpatterns += [
        path('schema/', SpectacularAPIView.as_view(), name='schema'),
        path('docs/', SpectacularSwaggerView.as_view(url_name='api_v1:schema'), name='docs'),
    ]
