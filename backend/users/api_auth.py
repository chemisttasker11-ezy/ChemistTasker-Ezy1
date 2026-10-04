"""Authentication API: registration, login, token refresh, logout, the current user, the mobile app
configuration, the admin user list and WebSocket tickets.

Logs go to the historical "users.views" channel that operators filter on."""
import secrets
import logging
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework import viewsets, permissions, filters, generics, status
from rest_framework.response import Response
from django.conf import settings
from rest_framework.views import APIView
from users.tasks import send_async_email
from rest_framework.exceptions import ValidationError, AuthenticationFailed
from users.serializers import (
    UserRegistrationSerializer,
    CustomTokenObtainPairSerializer,
    UserProfileSerializer,
    CustomTokenRefreshSerializer,
)
from users.models import WebSocketTicket
from users.login_security import _get_login_attempt_state, _login_failure_response, _login_invalid_credentials_response
from users.recaptcha import verify_recaptcha
from users.sessions import _build_authenticated_user_payload, _clear_auth_cookies, _is_web_client, _set_auth_cookies
from django.contrib.auth import get_user_model

User = get_user_model()


class MobileAppConfigView(APIView):
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        payload = {
            "latest_version": (getattr(settings, "MOBILE_LATEST_VERSION", "") or "").strip(),
            "minimum_supported_version": (getattr(settings, "MOBILE_MINIMUM_SUPPORTED_VERSION", "") or "").strip(),
            "android_store_url": (getattr(settings, "MOBILE_ANDROID_STORE_URL", "") or "").strip(),
            "ios_store_url": (getattr(settings, "MOBILE_IOS_STORE_URL", "") or "").strip(),
        }
        return Response(payload)


class RegisterView(generics.CreateAPIView):
    serializer_class = UserRegistrationSerializer
    permission_classes = [permissions.AllowAny]
    
    def create(self, request, *args, **kwargs):
        captcha_token = request.data.get('captcha_token')
        if not captcha_token or not verify_recaptcha(captcha_token):
            return Response(
                {'captcha': ['reCAPTCHA validation failed. Please try again.']},
                status=status.HTTP_400_BAD_REQUEST
            )
        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        user = serializer.save()
        otp_subject = "Your ChemistTasker Verification Code"
        otp_context = {"otp": getattr(user, "_plain_email_otp", "")}
        send_async_email(
            subject=otp_subject,
            recipient_list=[user.email],
            template_name="emails/otp_email.html",
            context=otp_context,
            text_template="emails/otp_email.txt"
        )


class CustomLoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        from .authentication import enforce_browser_csrf
        enforce_browser_csrf(request)
        email = (request.data.get("email") or "").strip().lower()
        remember_me = request.data.get("remember_me")
        remember_me = remember_me if isinstance(remember_me, bool) else None
        credentials = {"username": email}
        attempt_state = _get_login_attempt_state(request, credentials)
        if attempt_state and attempt_state["locked"]:
            return _login_failure_response(attempt_state)

        user = User.objects.filter(email__iexact=email).first() if email else None
        supplied_password = request.data.get("password") or ""
        password_matches = bool(user and user.check_password(supplied_password))
        try:
            response = super().post(request, *args, **kwargs)
        except AuthenticationFailed:
            attempt_state = _get_login_attempt_state(request, credentials)
            return _login_invalid_credentials_response(
                user,
                attempt_state,
                password_matches=password_matches,
            )

        if response.status_code >= 400:
            attempt_state = _get_login_attempt_state(request, credentials)
            return _login_invalid_credentials_response(
                user,
                attempt_state,
                password_matches=password_matches,
            )
        access = response.data.get("access")
        refresh = response.data.get("refresh")
        if access and refresh:
            _set_auth_cookies(response, access_token=access, refresh_token=refresh, remember_me=remember_me)
        if _is_web_client(request):
            response.data.pop("refresh", None)
        return response


class CustomTokenRefreshView(TokenRefreshView):
    serializer_class = CustomTokenRefreshSerializer

    def post(self, request, *args, **kwargs):
        from .authentication import enforce_browser_csrf
        enforce_browser_csrf(request)
        mutable_data = request.data.copy()
        if not mutable_data.get("refresh"):
            cookie_refresh = request.COOKIES.get(getattr(settings, "JWT_REFRESH_COOKIE", "ct_refresh"))
            if cookie_refresh:
                mutable_data["refresh"] = cookie_refresh
        if not mutable_data.get("refresh"):
            response = Response({"detail": "Token is invalid or expired."}, status=status.HTTP_401_UNAUTHORIZED)
            _clear_auth_cookies(response)
            return response

        serializer = self.get_serializer(data=mutable_data)
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError:
            response = Response({"detail": "Token is invalid or expired."}, status=status.HTTP_401_UNAUTHORIZED)
            _clear_auth_cookies(response)
            return response
        except Exception:
            logging.getLogger("users.views").exception("Unexpected refresh failure")
            response = Response({"detail": "Token is invalid or expired."}, status=status.HTTP_401_UNAUTHORIZED)
            _clear_auth_cookies(response)
            return response

        response = Response(serializer.validated_data, status=status.HTTP_200_OK)

        access = serializer.validated_data.get("access")
        refresh = serializer.validated_data.get("refresh")
        if access and refresh:
            _set_auth_cookies(response, access_token=access, refresh_token=refresh, remember_me=serializer.validated_data.get('remember_me'))
        if _is_web_client(request):
            response.data.pop("refresh", None)
        return response


class LogoutView(APIView):
    authentication_classes = []  # Expired access cookies must not prevent logout.
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        from .authentication import enforce_browser_csrf
        enforce_browser_csrf(request)
        from rest_framework_simplejwt.tokens import RefreshToken
        from rest_framework_simplejwt.exceptions import TokenError
        token = request.COOKIES.get(getattr(settings, 'JWT_REFRESH_COOKIE', 'ct_refresh')) or request.data.get('refresh')
        if token:
            try:
                RefreshToken(token).blacklist()
            except TokenError:
                pass
        response = Response({"detail": "Logged out successfully."}, status=200)
        _clear_auth_cookies(response)
        return response


class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        return Response(_build_authenticated_user_payload(request.user), status=200)


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET  /api/users/       → list all users (with ?search= support)
    GET  /api/users/{id}/  → retrieve one user
    """
    queryset = User.objects.all()
    serializer_class = UserProfileSerializer
    permission_classes = [permissions.IsAdminUser]
    filter_backends = [filters.SearchFilter]
    search_fields = ['email', 'username']


class WsTicketView(APIView):
    """
    Generates a short-lived, single-use ticket for WebSocket authentication.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        # Generate a secure 64-character token
        ticket_str = secrets.token_urlsafe(48)[:64]
        
        # Save it to the database
        WebSocketTicket.objects.create(
            user=request.user,
            ticket=ticket_str
        )
        
        return Response({'ticket': ticket_str})
