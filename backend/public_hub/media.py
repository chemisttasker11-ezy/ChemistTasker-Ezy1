from django.conf import settings
from django.http import FileResponse, Http404
from django.shortcuts import get_object_or_404
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from .models import ContentMedia, ContentRevision
from .permissions import HUBS, member_hubs
from urllib.parse import urlsplit


def references(payload, pk):
    def matches(url):
        return isinstance(url, str) and urlsplit(url).path.rstrip('/') == f'/api/hub/media/{pk}'
    if matches(payload.get('cover_url')):
        return True
    def walk(node):
        if not isinstance(node, dict):
            return False
        return (node.get('type') == 'image' and matches(node.get('attrs', {}).get('src'))) or any(walk(child) for child in node.get('content', []))
    return walk(payload.get('body_document', {}))


def deny_raw_media(request, filename):
    # Media must pass the publication/access check at its stable UUID endpoint.
    raise Http404


class MediaFile(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        asset = get_object_or_404(ContentMedia, pk=pk)
        allowed = request.user.is_authenticated and asset.uploaded_by_id == request.user.pk
        uses = ContentRevision.objects.filter(payload__icontains=str(pk))
        if not allowed and request.user.is_authenticated:
            from .content_views import accessible
            allowed = any(references(p, pk) for p in uses.filter(document__in=accessible(request.user)).values_list('payload', flat=True))
        if not allowed:
            public_areas = ['blog', 'news']
            if getattr(settings, 'PUBLIC_COMMUNITY_ENABLED', False):
                public_areas += [f'hub:{hub}' for hub in HUBS]
            public_areas += [f'hub:{hub}' for hub in member_hubs(request.user)]
            allowed = any(references(p, pk) for p in uses.filter(status='published', document__archived=False, document__area__in=public_areas).values_list('payload', flat=True))
        if not allowed:
            raise Http404
        try:
            response = FileResponse(asset.file.open('rb'))
        except (OSError, ValueError):
            raise Http404
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        response['Content-Security-Policy'] = "default-src 'none'; sandbox"
        return response
