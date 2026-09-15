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
from django_q.status import Stat

def health_check(request):
    try:
        stat = Stat.get_all()
        if stat and any(cluster.get('status') == 'running' for cluster in stat.values()):
            return JsonResponse({'status': 'healthy', 'worker': 'running'})
        else:
            return JsonResponse({'status': 'unhealthy', 'worker': 'not running'}, status=503)
    except Exception:
        return JsonResponse({'status': 'error'}, status=500)

two_factor_patterns, two_factor_app_name = two_factor_urlpatterns
two_factor_patterns = list(two_factor_patterns)
two_factor_patterns[0] = path('account/login/', AdminAwareLoginView.as_view(), name='login')

urlpatterns = [
    path('', include((two_factor_patterns, two_factor_app_name), namespace='two_factor')),
    path(settings.ADMIN_URL, otp_admin_site.urls),
    path('sitemap.xml', sitemap_web, name='sitemap-web'),
    path('health/', health_check, name='health'),
    path('api/users/', include('users.urls')),
    path('api/public-hub/', include('public_hub.urls')),
    path('api/client-profile/', include(('client_profile.urls', 'client_profile'), namespace='client_profile')),
    path('api/billing/', include('billing.urls', namespace='billing')),
    path('api/account/', DeleteAccountView.as_view(), name='delete-account'),
]

# append this in DEBUG mode so Django serves your uploads
if settings.DEBUG:
    urlpatterns += [
        path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
        path('api/docs/', SpectacularSwaggerView.as_view(url_name='schema')),
    ]
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
