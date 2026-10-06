import logging

from django.urls import path, include
from django.conf import settings
from django.conf.urls.static import static
from .sitemap import sitemap_web
from .admin_site import otp_admin_site
from two_factor.urls import urlpatterns as two_factor_urlpatterns
from .two_factor_views import AdminAwareLoginView
from django.http import JsonResponse
from django.db import connection
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

    # All application HTTP APIs are composed once beneath the versioned root.
    path('api/v1/', include(('core.api_v1_urls', 'api_v1'), namespace='api_v1')),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
