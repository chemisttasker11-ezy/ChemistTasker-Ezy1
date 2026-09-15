from django.conf import settings
from django.http import FileResponse, Http404
from rest_framework.permissions import AllowAny
from rest_framework.views import APIView
from rest_framework.exceptions import PermissionDenied
from .permissions import HUBS, member_hubs


class HubMediaAccess(APIView):
    """Protect legacy local-media URLs as well as new anonymous attachment URLs."""
    permission_classes = [AllowAny]

    def get(self, request, filename):
        from client_profile.models import PharmacyHubAttachment
        from django.shortcuts import get_object_or_404
        item = get_object_or_404(PharmacyHubAttachment.objects.select_related('post'), file=f'pharmacy_hub/attachments/{filename}', post__deleted_at=None)
        post = item.post
        public = (getattr(settings, 'PUBLIC_COMMUNITY_ENABLED', False) and post.platform_hub in HUBS
                  and not any([post.pharmacy_id, post.organization_id, post.community_group_id]))
        if not public:
            if not request.user.is_authenticated:
                raise Http404
            from client_profile.hub.api import HubScopeResolver
            try:
                HubScopeResolver(request.user).from_post(post)
            except PermissionDenied:
                raise Http404
        try:
            response = FileResponse(item.file.open('rb'), as_attachment=item.kind == 'file')
        except (OSError, ValueError):
            raise Http404
        response['Cache-Control'] = 'private, no-store'
        response['X-Content-Type-Options'] = 'nosniff'
        response['Content-Security-Policy'] = "default-src 'none'; sandbox"
        return response
