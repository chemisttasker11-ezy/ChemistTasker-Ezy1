from django.http import JsonResponse
from django.middleware.csrf import get_token
from django.views.decorators.http import require_GET
from django.views.decorators.csrf import ensure_csrf_cookie


@require_GET
@ensure_csrf_cookie
def csrf_token(request):
    response = JsonResponse({'csrfToken': get_token(request)})
    response['Cache-Control'] = 'private, no-store'
    return response
