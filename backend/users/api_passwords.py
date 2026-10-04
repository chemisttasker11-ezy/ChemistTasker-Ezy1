"""Password reset API: requesting a reset link and confirming a new password."""
from django.contrib.auth.password_validation import validate_password
from rest_framework import permissions
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from django.conf import settings
from rest_framework.views import APIView
from users.tasks import send_async_email
from django.core.exceptions import ValidationError as DjangoValidationError
from users.login_security import _reset_login_lockout_state
from django.contrib.auth import get_user_model

User = get_user_model()


class PasswordResetConfirmAPIView(APIView):
    """
    Accepts JSON: { uid, token, new_password1, new_password2 }
    """
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        uid    = request.data.get('uid')
        token  = request.data.get('token')
        pw1    = request.data.get('new_password1')
        pw2    = request.data.get('new_password2')

        if not all([uid, token, pw1, pw2]):
            return Response({'detail':'Missing fields.'}, status=400)
        if pw1 != pw2:
            return Response({'detail':'Passwords do not match.'}, status=400)

        try:
            user_pk = force_str(urlsafe_base64_decode(uid))
            user = User.objects.get(pk=user_pk)
        except (TypeError, ValueError, User.DoesNotExist):
            return Response({'detail':'Invalid link.'}, status=400)

        if not default_token_generator.check_token(user, token):
            return Response({'detail':'Invalid or expired token.'}, status=400)

        # all good—set the password
        try:
            validate_password(pw1, user=user)
        except DjangoValidationError as exc:
            return Response({'new_password1': list(exc.messages)}, status=400)

        user.set_password(pw1)
        user.is_otp_verified = True
        user.save()
        _reset_login_lockout_state(user)
        return Response({'detail':'Password has been reset.'})


class PasswordResetRequestAPIView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "password_reset"

    def post(self, request):
        email = request.data.get('email', '').strip().lower()
        user = User.objects.filter(email__iexact=email).first()
        if user:
            uid = urlsafe_base64_encode(force_bytes(user.pk))
            token = default_token_generator.make_token(user)
            reset_url = f"{settings.FRONTEND_BASE_URL}/reset-password/{uid}/{token}/"
            # send email
            send_async_email(
                subject="Reset your password",
                recipient_list=[user.email],
                template_name="emails/password_reset_email.html",
                context={
                    'reset_url': reset_url,
                    'first_name': user.first_name,
                },
                text_template="emails/password_reset_email.txt",
            )
        # Always succeed (do not reveal which emails are registered)
        return Response({'detail': 'If this email exists, a reset link has been sent.'})
