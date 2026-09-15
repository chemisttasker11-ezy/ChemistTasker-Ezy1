# users/authentication.py

from django.contrib.auth.backends import ModelBackend
from django.contrib.auth import get_user_model
from django.conf import settings
from rest_framework_simplejwt.authentication import JWTAuthentication
from rest_framework.authentication import SessionAuthentication


def enforce_browser_csrf(request):
    """Bearer clients retain their contract; browser cookie operations require CSRF."""
    if not request.headers.get('Authorization') and (request.headers.get('Origin') or request.COOKIES):
        SessionAuthentication().enforce_csrf(request)


class CookieJWTAuthentication(JWTAuthentication):
    def authenticate(self, request):
        if self.get_header(request) is not None:
            return super().authenticate(request)
        token = request.COOKIES.get(getattr(settings, 'JWT_AUTH_COOKIE', 'ct_access'))
        if not token:
            return None
        SessionAuthentication().enforce_csrf(request)
        validated = self.get_validated_token(token)
        return self.get_user(validated), validated

User = get_user_model()

class EmailBackend(ModelBackend):
    """
    Authenticate using email (case‑insensitive) instead of username.
    Falls back to ModelBackend for admin/site‑wide lookups.
    """
    def authenticate(self, request, username=None, password=None, **kwargs):
        # here `username` is actually the email address
        if username is None or password is None:
            return None
        try:
            user = User.objects.get(email__iexact=username)
        except User.DoesNotExist:
            return None
        return user if user.check_password(password) and self.user_can_authenticate(user) else None
