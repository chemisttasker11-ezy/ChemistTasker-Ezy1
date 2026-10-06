import logging

from django.urls import path, include
from users.views import DeleteAccountView
from drf_spectacular.views import SpectacularAPIView, SpectacularSwaggerView
from django.conf import settings
from django.conf.urls.static import static
from .sitemap import sitemap_web
from .admin_site import otp_admin_site
from two_factor.urls import urlpatterns as two_factor_urlpatterns
from .two_factor_views import AdminAwareLoginView
from django.http import JsonResponse
from django.db import connection
from worker_finance import legacy as finance_legacy
from public_hub.attachment_access import HubMediaAccess
from public_hub.media import deny_raw_media

logger = logging.getLogger(__name__)


def health_check(request):
    try:
        with connection.cursor() as cursor:
            cursor.execute("SELECT 1")
            cursor.fetchone()
        return JsonResponse({'status': 'healthy'})
    except Exception:
        logger.exception("Health check: database query failed")
        return JsonResponse({'status': 'error', 'detail': 'Database unavailable.'}, status=500)


two_factor_patterns, two_factor_app_name = two_factor_urlpatterns
two_factor_patterns = list(two_factor_patterns)
two_factor_patterns[0] = path('account/login/', AdminAwareLoginView.as_view(), name='login')

urlpatterns = [
    path('media/public_content/<path:filename>', deny_raw_media),
    path('media/pharmacy_hub/attachments/<path:filename>', HubMediaAccess.as_view()),
    path('', include((two_factor_patterns, two_factor_app_name), namespace='two_factor')),
    path(settings.ADMIN_URL, otp_admin_site.urls),
    path('sitemap.xml', sitemap_web, name='sitemap-web'),
    path('health/', health_check, name='health'),

    # Canonical versioned API. There are no unversioned /api/* application mounts.
    path('api/v1/users/', include('users.urls')),
    path('api/v1/public-hub/', include('public_hub.urls')),
    path('api/v1/marketplace/', include('marketplace.urls')),
    path('api/v1/ethical/', include('ethical_marketplace.urls')),
    path('api/v1/content/', include('public_hub.content_urls')),

    # Finance workspace and the guarded compatibility adapters intentionally
    # precede the domain include. Managed finance invoices must never fall
    # through to the legacy editor and lose revision/payment history.
    path('api/v1/finance/', include('worker_finance.urls')),
    path('api/v1/invoices/<int:pk>/', finance_legacy.detail),
    path('api/v1/invoices/<int:invoice_id>/pdf/', finance_legacy.pdf),
    path('api/v1/invoices/<int:invoice_id>/send/', finance_legacy.send),

    path('api/v1/', include(('core.api_v1_urls', 'api_v1'), namespace='api_v1')),
    path('api/v1/billing/', include('billing.urls', namespace='billing')),
    path('api/v1/account/', DeleteAccountView.as_view(), name='delete-account'),
]

if settings.DEBUG:
    urlpatterns += [
        path('api/v1/schema/', SpectacularAPIView.as_view(), name='schema'),
        path('api/v1/docs/', SpectacularSwaggerView.as_view(url_name='schema')),
    ]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
