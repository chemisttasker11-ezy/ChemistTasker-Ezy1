from django.conf import settings
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from rest_framework.views import APIView


class Sitemap(APIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def get(self, request):
        from core.sitemap import _build_content_urls, _build_marketplace_urls, _build_shift_urls, _build_static_urls
        base = settings.FRONTEND_BASE_URL
        return Response([{'loc': loc} for loc in _build_static_urls(base)] + _build_shift_urls(base) + _build_content_urls(base) + _build_marketplace_urls(base))
