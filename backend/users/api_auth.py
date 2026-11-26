"""Authentication API: registration, login, token refresh, logout, the current user, the mobile app
configuration, the admin user list and WebSocket tickets.

Logs go to the historical "users.views" channel that operators filter on."""
import secrets
import logging
from rest_framework import serializers
from rest_framework_simplejwt.views import TokenViewBase
from rest_framework import viewsets, permissions, filters, generics, status
from rest_framework.response import Response
from django.conf import settings
from rest_framework.views import APIView
from users.tasks import send_async_email
from users.delivery import deliver_email_best_effort
from rest_framework.exceptions import ValidationError, AuthenticationFailed
from users.serializers import (
    UserRegistrationSerializer,
    CustomTokenObtainPairSerializer,
    UserProfileSerializer,
)
from users.models import WebSocketTicket
from users.recaptcha import verify_recaptcha
from users.authentication import enforce_browser_csrf
from users.device_sessions import logout_device_session, refresh_device_session
from users.sessions import (
    TRUSTED_DEVICE_COOKIE, build_authenticated_user_payload, clear_auth_cookies, is_web_client,
    set_auth_cookies, set_trusted_device_cookie,
)
from users.sign_in import complete_two_factor_login, send_two_factor_login_code, sign_in
from users.two_factor import METHODS, TRUSTED_DEVICE_TTL
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
        deliver_email_best_effort(
            send_async_email,
            subject=otp_subject,
            recipient_list=[user.email],
            template_name="emails/otp_email.html",
            context=otp_context,
            text_template="emails/otp_email.txt",
            event="registration_otp",
            user_id=user.id,
        )


def _login_response(response, web):
    if response.status_code < 400:
        set_auth_cookies(response, access_token=response.data["access"], refresh_token=response.data["refresh"])
        if web:
            response.data.pop("refresh")
            if token := response.data.pop("trusted_device_token", None):
                set_trusted_device_cookie(response, token, TRUSTED_DEVICE_TTL)
    return response


class CustomLoginView(TokenViewBase):
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        enforce_browser_csrf(request)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        fields = dict(serializer.validated_data)
        web = is_web_client(request)
        native_token = fields.pop("trusted_device_token", None)
        response = sign_in(
            request, client_kind="web" if web else "native",
            trusted_token=request.COOKIES.get(TRUSTED_DEVICE_COOKIE) if web else native_token,
            captcha_token=request.data.get("captcha_token"), recovery_code=request.data.get("recovery_code"),
            verify_captcha=verify_recaptcha, **fields,
        )
        return _login_response(response, web)


class LoginChallengeSerializer(serializers.Serializer):
    challenge_token = serializers.CharField(max_length=2048)


class CompleteTwoFactorLoginSerializer(LoginChallengeSerializer):
    method = serializers.ChoiceField(choices=METHODS)
    code = serializers.CharField(max_length=64)
    remember_device = serializers.BooleanField(required=False)


class CompleteTwoFactorLoginView(TokenViewBase):
    serializer_class = CompleteTwoFactorLoginSerializer

    def post(self, request, *args, **kwargs):
        enforce_browser_csrf(request)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        web = is_web_client(request)
        response = complete_two_factor_login(
            request, client_kind="web" if web else "native", **serializer.validated_data,
        )
        return _login_response(response, web)


class SendTwoFactorLoginCodeView(TokenViewBase):
    serializer_class = LoginChallengeSerializer

    def post(self, request, *args, **kwargs):
        enforce_browser_csrf(request)
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        return send_two_factor_login_code(
            request, client_kind="web" if is_web_client(request) else "native", **serializer.validated_data,
        )


class RefreshInputSerializer(serializers.Serializer):
    refresh = serializers.CharField()


class CustomTokenRefreshView(TokenViewBase):
    serializer_class = RefreshInputSerializer

    def post(self, request, *args, **kwargs):
        enforce_browser_csrf(request)
        raw_refresh = request.data.get("refresh") or request.COOKIES.get(settings.JWT_REFRESH_COOKIE)
        serializer = self.get_serializer(data={"refresh": raw_refresh})
        try:
            serializer.is_valid(raise_exception=True)
            payload = refresh_device_session(request, serializer.validated_data["refresh"])
        except (ValidationError, AuthenticationFailed):
            payload = None
        except Exception:
            logging.getLogger("users.views").exception("Unexpected refresh failure")
            payload = None

        if payload is None:
            response = Response({"detail": "Token is invalid or expired."}, status=status.HTTP_401_UNAUTHORIZED)
            clear_auth_cookies(response)
            return response

        response = Response(payload)
        if refresh := payload.get("refresh"):
            set_auth_cookies(response, access_token=payload["access"], refresh_token=refresh)
        if is_web_client(request):
            response.data.pop("refresh", None)
        return response


class LogoutView(APIView):
    authentication_classes = []  # Expired access cookies must not prevent logout.
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
        enforce_browser_csrf(request)
        token = request.COOKIES.get(settings.JWT_REFRESH_COOKIE) or request.data.get("refresh")
        logout_device_session(token, request.data.get("device_token"))
        response = Response({"detail": "Logged out successfully."})
        clear_auth_cookies(response)
        return response


class CurrentUserView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, *args, **kwargs):
        return Response(build_authenticated_user_payload(request.user, current_user=True), status=200)


class UserViewSet(viewsets.ReadOnlyModelViewSet):
    """
    GET  /api/v1/users/       → list all users (with ?search= support)
    GET  /api/v1/users/{id}/  → retrieve one user
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
        from datetime import datetime, timezone as dt_timezone
        
        # Save it to the database
        WebSocketTicket.objects.create(
            user=request.user,
            ticket=ticket_str,
            session_id=request.auth.get('sid', '') if request.auth else '',
            access_expires_at=datetime.fromtimestamp(request.auth['exp'], tz=dt_timezone.utc) if request.auth else None,
        )
        
        return Response({'ticket': ticket_str})
