"""Verification API: e-mail OTP verify/resend and mobile OTP request/verify/resend.

Logs go to the historical "users.views" channel that operators filter on."""
import secrets
import logging
import requests
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework import permissions, status
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from organizations.access import admin_assignments_for
from django.conf import settings
from core.task_queue import async_task
from rest_framework.views import APIView
from users.tasks import send_async_email
from users.utils import get_frontend_onboarding_url, get_frontend_owner_pharmacies_url
from datetime import timedelta
from django.utils import timezone
from requests.auth import HTTPBasicAuth
from users.otp import _capture_mobile_identity, _clean_identity_value, _get_lockout_response, _hash_otp, _otp_matches, _register_email_otp_failure, _register_mobile_otp_failure, _reset_email_otp_security_state, _reset_mobile_otp_security_state, generate_otp, normalize_au_mobile, valid_otp_format
from users.sessions import _build_authenticated_user_payload, _is_web_client, _set_auth_cookies
from django.contrib.auth import get_user_model

User = get_user_model()


class VerifyOTPView(APIView):
    OTP_EXPIRY_MINUTES = 10
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_verify"

    def post(self, request):
        from .authentication import enforce_browser_csrf
        enforce_browser_csrf(request)
        email = request.data.get("email", "").strip().lower()
        otp = request.data.get("otp")
        user = User.objects.filter(email__iexact=email).first()
        invalid_response = lambda: Response(
            {"detail": "Invalid or expired verification code."},
            status=status.HTTP_400_BAD_REQUEST,
        )

        if not user or not otp:
            return invalid_response()

        if not user.is_active:
            return invalid_response()

        if user.otp_locked_until and timezone.now() < user.otp_locked_until:
            return invalid_response()

        # --- Check if OTP is expired ---
        if not user.otp_created_at or (timezone.now() - user.otp_created_at > timedelta(minutes=self.OTP_EXPIRY_MINUTES)):
            return invalid_response()

        # --- Check if OTP matches ---
        if not _otp_matches(otp, user.otp_code):
            just_locked = _register_email_otp_failure(user)
            return invalid_response()

        # --- Success: verify user and clear OTP ---
        user.is_otp_verified = True
        user.otp_code = None
        user.otp_created_at = None
        _reset_email_otp_security_state(user)
        user.save()

        # --- Send welcome email (kept exactly as you have) ---
        onboarding_link = get_frontend_onboarding_url(user)
        ctx = {
            "first_name": user.first_name,
            "email": user.email,
            "role": user.role,
            "onboarding_link": onboarding_link,
            "owner_pharmacies_link": get_frontend_owner_pharmacies_url() if user.role == "OWNER" else "",
        }
        async_task(
            'users.tasks.send_async_email',
            subject="🎉 Welcome to ChemistTasker! Let’s Get You Started 🌟",
            recipient_list=[user.email],
            template_name="emails/welcome_email.html",
            context=ctx,
            text_template="emails/welcome_email.txt"
        )

        # Web verifies email only, then follows the existing UI flow back to login.
        # Mobile/API clients still receive tokens so they can continue to mobile verification.
        if _is_web_client(request):
            return Response({"detail": "Email verified successfully."}, status=status.HTTP_200_OK)

        # --- Also return tokens + user payload so mobile can call mobile-verify authenticated ---
        refresh = RefreshToken.for_user(user)

        # Build memberships payload exactly like your serializers
        from .models import OrganizationMembership
        from memberships.models import Membership as PharmacyMembership

        org_memberships = OrganizationMembership.objects.filter(user=user)
        org_payload = [
            {
                'organization_id':   m.organization_id,
                'organization_name': m.organization.name,
                'role':              m.role,
                'region':            m.region,
            }
            for m in org_memberships
        ]

        pharm_memberships = PharmacyMembership.objects.filter(
            user=user,
            is_active=True,
            status=PharmacyMembership.Status.ACCEPTED,
        ).select_related('pharmacy')

        pharm_payload = [
            {
                'pharmacy_id':   pm.pharmacy_id,
                'pharmacy_name': pm.pharmacy.name if pm.pharmacy else None,
                'role':          pm.role,
            }
              for pm in pharm_memberships
          ]

        admin_assignments = (
            admin_assignments_for(user)
            .select_related("pharmacy")
        )
        admin_payload = [
            {
                "pharmacy_id": assignment.pharmacy_id,
                "pharmacy_name": assignment.pharmacy.name if assignment.pharmacy else None,
                "admin_level": assignment.admin_level,
                "capabilities": sorted(list(assignment.capabilities)),
                "staff_role": assignment.staff_role,
                "job_title": assignment.job_title,
            }
            for assignment in admin_assignments
        ]

        response = Response({
            "refresh": str(refresh),
            "access": str(refresh.access_token),
            "user": {
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "role": user.role,
                "memberships": org_payload + pharm_payload,
                "admin_assignments": admin_payload,
                "is_pharmacy_admin": bool(admin_payload),
                # helpful flags for frontend:
                "is_otp_verified": True,
                "is_mobile_verified": bool(getattr(user, "is_mobile_verified", False)),
            }
        }, status=200)
        _set_auth_cookies(response, access_token=str(refresh.access_token), refresh_token=str(refresh))
        return response


class ResendOTPView(APIView):
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_resend"

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        user = User.objects.filter(email__iexact=email).first()
        if user and not user.is_otp_verified:
            otp = str(secrets.randbelow(900000) + 100000)
            user.otp_code = _hash_otp(otp)
            user.otp_created_at = timezone.now()
            _reset_email_otp_security_state(user)
            user.save()

            context = {"otp": otp}
            send_async_email(
                subject="Your ChemistTasker Verification Code",
                recipient_list=[user.email],
                template_name="emails/otp_email.html",
                context=context,
                text_template="emails/otp_email.txt",
            )

        return Response(
            {"detail": "If this email is eligible, a verification code has been sent."},
            status=200,
        )


class RequestMobileOTPView(APIView):
    """
    Step 1: User submits mobile number; system generates and sends OTP via SMS.
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "mobile_otp_request"

    def post(self, request):
        user = request.user
        mobile_number = request.data.get("mobile_number")

        if not mobile_number:
            return Response({"error": "Mobile number is required"}, status=status.HTTP_400_BAD_REQUEST)

        normalized = normalize_au_mobile(mobile_number)
        if not normalized or not normalized.startswith("61"):
            return Response({"error": "Invalid Australian mobile number format"}, status=status.HTTP_400_BAD_REQUEST)

        changed_identity_fields, identity_error = _capture_mobile_identity(user, request.data)
        if identity_error is not None:
            return identity_error

        existing_mobile = _clean_identity_value(user.mobile_number) or None
        if user.is_mobile_verified and existing_mobile and normalized != existing_mobile:
            return Response(
                {"mobile_number": "Verified mobile number is locked and cannot be changed."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 60-second cooldown to prevent spamming the same pending number.
        # Allow immediate correction when the pending number has not been verified yet.
        same_pending_mobile = existing_mobile == normalized
        if (
            same_pending_mobile
            and user.mobile_otp_created_at
            and timezone.now() - user.mobile_otp_created_at < timedelta(seconds=60)
        ):
            return Response(
                {"error": "Please wait 60 seconds before requesting a new OTP."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        # Persist to user
        otp_code = generate_otp()
        user.mobile_number = normalized
        user.mobile_otp_code = _hash_otp(otp_code)
        user.mobile_otp_created_at = timezone.now()
        user.is_mobile_verified = False
        _reset_mobile_otp_security_state(user)
        update_fields = [
            "mobile_number",
            "mobile_otp_code",
            "mobile_otp_created_at",
            "is_mobile_verified",
            "mobile_otp_failed_attempts",
            "mobile_otp_locked_until",
        ]
        if changed_identity_fields:
            update_fields.extend(changed_identity_fields)
        user.save(update_fields=sorted(set(update_fields)))

        if settings.DEBUG:
            # Keep the explicit DEBUG response contract for local development, but
            # never duplicate the OTP or mobile number into process logs/stdout.
            return Response(
                {
                    "detail": "OTP generated successfully (DEBUG mode).",
                    "debug_otp": otp_code,
                },
                status=status.HTTP_200_OK,
            )

        # Send SMS
        sms_payload = {
            "enable_unicode": False,
            "messages": [
                {
                    "to": normalized,
                    "message": f"Your ChemistTasker verification code is {otp_code}",
                    "sender": settings.MOBILEMESSAGE_SENDER,
                }
            ]
        }

        resp = requests.post(
            "https://api.mobilemessage.com.au/v1/messages",
            json=sms_payload,
            auth=HTTPBasicAuth(settings.MOBILEMESSAGE_USERNAME, settings.MOBILEMESSAGE_PASSWORD),
            timeout=20,
        )

        if resp.status_code != 200:
            # The provider's body can echo the message (with the code) and the number: log the status only.
            logging.getLogger("users.views").warning(
                "Mobile OTP send failed for user %s with provider status %s",
                user.id,
                resp.status_code,
            )
            return Response(
                {"error": "Unable to send verification code right now. Please try again later."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response({"detail": "OTP sent successfully"}, status=status.HTTP_200_OK)


class VerifyMobileOTPView(APIView):
    """
    Step 2: User submits OTP to verify mobile.
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "mobile_otp_verify"

    def post(self, request):
        user = request.user
        otp = request.data.get("otp")

        if not user.is_active:
            return Response({"detail": "Account is disabled."}, status=status.HTTP_403_FORBIDDEN)

        if user.mobile_otp_locked_until and timezone.now() < user.mobile_otp_locked_until:
            return _get_lockout_response(user.mobile_otp_locked_until)

        if not valid_otp_format(otp):
            return Response({"error": "Invalid OTP format"}, status=status.HTTP_400_BAD_REQUEST)

        # Enforce 10-minute expiry
        if not user.mobile_otp_created_at or (timezone.now() - user.mobile_otp_created_at) > timedelta(minutes=10):
            return Response({"error": "OTP has expired, please request a new one."},
                            status=status.HTTP_400_BAD_REQUEST)

        if not _otp_matches(otp, user.mobile_otp_code):
            just_locked = _register_mobile_otp_failure(user)
            if just_locked:
                return _get_lockout_response(user.mobile_otp_locked_until)
            return Response({"error": "Invalid OTP"}, status=status.HTTP_400_BAD_REQUEST)

        # Success: mark verified, clear code & (optionally) timestamp
        user.is_mobile_verified = True
        user.mobile_otp_code = None
        user.mobile_otp_created_at = None
        _reset_mobile_otp_security_state(user)
        user.save()

        from rest_framework_simplejwt.tokens import RefreshToken
        refresh = RefreshToken.for_user(user)
        access = str(refresh.access_token)

        response = Response(
            {
                "detail": "Mobile number verified successfully",
                "user": _build_authenticated_user_payload(user),
                "access": access,
                "refresh": str(refresh),
            },
            status=status.HTTP_200_OK,
        )
        _set_auth_cookies(response, access_token=access, refresh_token=str(refresh))
        if _is_web_client(request):
            response.data.pop("refresh", None)
        return response


class ResendMobileOTPView(APIView):
    """
    Step 3: User requests a resend of mobile OTP.
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "mobile_otp_resend"

    def post(self, request):
        user = request.user

        if not user.mobile_number:
            return Response(
                {"error": "No mobile number associated with this account."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # 60-second cooldown
        if user.mobile_otp_created_at and timezone.now() - user.mobile_otp_created_at < timedelta(seconds=60):
            return Response(
                {"error": "Please wait 60 seconds before resending OTP."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        # Generate new OTP, invalidate old one
        otp_code = generate_otp()
        user.mobile_otp_code = _hash_otp(otp_code)
        user.mobile_otp_created_at = timezone.now()
        user.is_mobile_verified = False
        _reset_mobile_otp_security_state(user)
        user.save(update_fields=[
            "mobile_otp_code",
            "mobile_otp_created_at",
            "is_mobile_verified",
            "mobile_otp_failed_attempts",
            "mobile_otp_locked_until",
        ])

        if settings.DEBUG:
            # The caller explicitly receives the development-only OTP below; do
            # not persist that secret or the mobile number in logs/stdout.
            return Response(
                {
                    "detail": "OTP regenerated successfully (DEBUG mode).",
                    "debug_otp": otp_code,
                },
                status=status.HTTP_200_OK,
            )

        # Send SMS
        sms_payload = {
            "enable_unicode": False,
            "messages": [
                {
                    "to": user.mobile_number,
                    "message": f"Your ChemistTasker verification code is {otp_code}",
                    "sender": settings.MOBILEMESSAGE_SENDER,
                }
            ]
        }

        resp = requests.post(
            "https://api.mobilemessage.com.au/v1/messages",
            json=sms_payload,
            auth=HTTPBasicAuth(settings.MOBILEMESSAGE_USERNAME, settings.MOBILEMESSAGE_PASSWORD),
            timeout=20,
        )

        if resp.status_code != 200:
            # The provider's body can echo the message (with the code) and the number: log the status only.
            logging.getLogger("users.views").warning(
                "Mobile OTP resend failed for user %s with provider status %s",
                user.id,
                resp.status_code,
            )
            return Response(
                {"error": "Unable to send verification code right now. Please try again later."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response({"detail": "OTP resent successfully"}, status=status.HTTP_200_OK)
