"""Apply the account freeze even to DRF views with their own permission classes."""
from django.http import JsonResponse
from django.utils.deprecation import MiddlewareMixin
from rest_framework.exceptions import APIException

from onboarding.verification.state import ahpra_profile, ahpra_state


class AhpraFreezeMiddleware(MiddlewareMixin):
    def process_view(self, request, view_func, view_args, view_kwargs):
        if not request.path.startswith('/api/'):
            return None
        view_class = getattr(view_func, 'cls', None)
        user = request.user
        if view_class is not None:
            view = view_class(**getattr(view_func, 'initkwargs', {}))
            view.action_map = getattr(view_func, 'actions', {})
            try:
                user = view.initialize_request(request, *view_args, **view_kwargs).user
            except APIException:
                return None  # The view returns the normal authentication/CSRF error.
        if not user or not user.is_authenticated or user.is_staff:
            return None
        match = request.resolver_match
        name = match.url_name if match else ''
        if name in {
            'browser-csrf', 'custom_token_obtain_pair', 'token_refresh', 'logout', 'me', 'mobile-app-config',
            'owner-onboarding-me', 'pharmacist-onboarding-me', 'otherstaff-onboarding-me',
            'explorer-onboarding-me', 'ahpra-recheck',
        }:
            return None
        if name in ('notification-list', 'notification-detail') and request.method in ('GET', 'HEAD', 'OPTIONS'):
            return None
        if name == 'notification-mark-read' and request.method == 'POST':
            return None
        state = ahpra_state(ahpra_profile(user))
        if state['state'] == 'suspended':
            return JsonResponse({'code': 'ahpra_suspended', 'detail': state['note']}, status=403)
        return None
