"""HTTP endpoints for two-factor settings and device sessions."""
from rest_framework import permissions, serializers
from rest_framework.response import Response
from rest_framework.views import APIView

from users.authentication import enforce_browser_csrf
from users.device_sessions import list_device_sessions, revoke_device_session, sign_out_everywhere
from users.sessions import clear_auth_cookies, clear_trusted_device_cookie
from users.two_factor import (
    METHODS, confirm_authenticator_two_factor, confirm_email_two_factor, disable_two_factor,
    regenerate_backup_codes, start_authenticator_two_factor, start_email_two_factor, two_factor_status,
)


def _sid(request):
    return request.auth.get("sid") if request.auth else None


class SignedInSecurityView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def initial(self, request, *args, **kwargs):
        super().initial(request, *args, **kwargs)
        if request.method == "POST":
            enforce_browser_csrf(request)


class TwoFactorStatusView(SignedInSecurityView):
    def get(self, request):
        return Response(two_factor_status(request.user))


class TwoFactorCodeSerializer(serializers.Serializer):
    code = serializers.CharField(max_length=64)


class DisableTwoFactorSerializer(TwoFactorCodeSerializer):
    method = serializers.ChoiceField(choices=METHODS)
    password = serializers.CharField(trim_whitespace=False, write_only=True)


class TwoFactorSettingsView(SignedInSecurityView):
    serializer_class = None
    clear_trusted_cookie = False

    def post(self, request):
        fields = {}
        if self.serializer_class:
            serializer = self.serializer_class(data=request.data)
            serializer.is_valid(raise_exception=True)
            fields = serializer.validated_data
        result = self.operation(request.user, _sid(request), **fields)
        if result is None:
            return Response({"detail": "Invalid or expired credentials."}, status=400)
        response = Response(result)
        if self.clear_trusted_cookie:
            clear_trusted_device_cookie(response)
        return response


class StartEmailTwoFactorView(TwoFactorSettingsView):
    operation = staticmethod(start_email_two_factor)


class ConfirmEmailTwoFactorView(TwoFactorSettingsView):
    serializer_class = TwoFactorCodeSerializer
    operation = staticmethod(confirm_email_two_factor)


class StartAuthenticatorView(TwoFactorSettingsView):
    operation = staticmethod(start_authenticator_two_factor)


class ConfirmAuthenticatorView(TwoFactorSettingsView):
    serializer_class = TwoFactorCodeSerializer
    operation = staticmethod(confirm_authenticator_two_factor)


class RegenerateBackupCodesView(TwoFactorSettingsView):
    operation = staticmethod(regenerate_backup_codes)


class DisableTwoFactorView(TwoFactorSettingsView):
    serializer_class = DisableTwoFactorSerializer
    operation = staticmethod(disable_two_factor)
    clear_trusted_cookie = True


class DeviceSessionsView(SignedInSecurityView):
    def get(self, request):
        return Response(list_device_sessions(request.user, _sid(request)))


class RevokeDeviceSessionView(SignedInSecurityView):
    def post(self, request, sid):
        revoke_device_session(request.user, sid)
        return Response(status=204)


class RevokeAllDeviceSessionsView(SignedInSecurityView):
    def post(self, request):
        sign_out_everywhere(request.user)
        response = Response(status=204)
        clear_auth_cookies(response)
        clear_trusted_device_cookie(response)
        return response
