from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView  
from rest_framework_simplejwt.tokens import RefreshToken
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import make_password, check_password, identify_hasher
from django.contrib.auth.password_validation import validate_password
from rest_framework import viewsets, permissions, filters, generics, status, mixins
from django.contrib.auth.tokens import default_token_generator
from django.utils.http import urlsafe_base64_encode, urlsafe_base64_decode
from django.utils.encoding import force_bytes, force_str
from django.utils.crypto import get_random_string
from rest_framework.response import Response
from rest_framework.exceptions import PermissionDenied
from rest_framework.throttling import ScopedRateThrottle
from .models import OrganizationMembership, ContactMessage
from client_profile.admin_helpers import admin_assignments_for
from client_profile.models import Membership, Pharmacy
from .serializers import InviteOrgUserSerializer, ContactMessageCreateSerializer
from .permissions import OrganizationRolePermission
from .org_roles import (
    ADMIN_LEVEL_DEFINITIONS,
    ROLE_DEFINITIONS,
    # ROLE_DESCRIPTION_SUMMARY,
    OrgCapability,
    membership_capabilities,
)
from django.conf import settings
from django_q.tasks import async_task
from rest_framework.views import APIView
from users.tasks import send_async_email
from users.utils import get_frontend_onboarding_url, get_frontend_owner_pharmacies_url, build_org_invite_context
from datetime import timedelta
from django.utils import timezone
import secrets
import logging
from rest_framework.exceptions import ValidationError
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.db.models import Max, Sum
from django.contrib.sessions.models import Session
from rest_framework_simplejwt.token_blacklist.models import OutstandingToken, BlacklistedToken
from .serializers import (
    UserRegistrationSerializer,
    CustomTokenObtainPairSerializer,
    UserProfileSerializer,
    CustomTokenRefreshSerializer,
    OrganizationMembershipDetailSerializer,
)
User = get_user_model()
import requests
from requests.auth import HTTPBasicAuth
from django.db.models import Q

OTP_MAX_FAILED_ATTEMPTS = 5
OTP_LOCKOUT_MINUTES = 15


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


def _hash_otp(raw_otp: str) -> str:
    return make_password(raw_otp)


def _otp_matches(raw_otp: str, stored_value: str | None) -> bool:
    if not raw_otp or not stored_value:
        return False
    try:
        identify_hasher(stored_value)
    except Exception:
        # Backward compatibility for OTPs issued before hashing was introduced.
        return stored_value == raw_otp
    return check_password(raw_otp, stored_value)


def _get_lockout_response(locked_until):
    remaining = int(max((locked_until - timezone.now()).total_seconds(), 0))
    return Response(
        {
            "detail": "Too many failed attempts. Try again later.",
            "locked_until": locked_until,
            "retry_after_seconds": remaining,
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )


def _register_email_otp_failure(user):
    user.otp_failed_attempts = int(user.otp_failed_attempts or 0) + 1
    if user.otp_failed_attempts >= OTP_MAX_FAILED_ATTEMPTS:
        user.otp_locked_until = timezone.now() + timedelta(minutes=OTP_LOCKOUT_MINUTES)
        user.save(update_fields=["otp_failed_attempts", "otp_locked_until"])
        return True
    user.save(update_fields=["otp_failed_attempts"])
    return False


def _reset_email_otp_security_state(user):
    user.otp_failed_attempts = 0
    user.otp_locked_until = None


def _register_mobile_otp_failure(user):
    user.mobile_otp_failed_attempts = int(user.mobile_otp_failed_attempts or 0) + 1
    if user.mobile_otp_failed_attempts >= OTP_MAX_FAILED_ATTEMPTS:
        user.mobile_otp_locked_until = timezone.now() + timedelta(minutes=OTP_LOCKOUT_MINUTES)
        user.save(update_fields=["mobile_otp_failed_attempts", "mobile_otp_locked_until"])
        return True
    user.save(update_fields=["mobile_otp_failed_attempts"])
    return False


def _reset_mobile_otp_security_state(user):
    user.mobile_otp_failed_attempts = 0
    user.mobile_otp_locked_until = None


def _reset_login_lockout_state(user):
    if not getattr(settings, "AXES_ENABLED", False):
        return
    email = (getattr(user, "email", "") or "").strip()
    if not email:
        return
    try:
        from axes.utils import reset as reset_axes_attempts

        reset_axes_attempts(username=email)
    except Exception:
        logging.getLogger(__name__).exception("Failed to reset login lockout state for user %s", user.id)


def _get_login_attempt_state(request, credentials):
    if not getattr(settings, "AXES_ENABLED", False):
        return None
    try:
        from axes.attempts import get_user_attempts
        from axes.handlers.proxy import AxesProxyHandler
        from axes.helpers import get_cool_off, get_failure_limit

        AxesProxyHandler.update_request(request)
        attempts_list = get_user_attempts(request, credentials)
        failures = 0
        latest_attempt = None
        for attempts in attempts_list:
            aggregate = attempts.aggregate(
                failures=Sum("failures_since_start"),
                latest=Max("attempt_time"),
            )
            failures = max(failures, int(aggregate["failures"] or 0))
            latest = aggregate["latest"]
            if latest and (latest_attempt is None or latest > latest_attempt):
                latest_attempt = latest

        failure_limit = int(get_failure_limit(request, credentials))
        remaining = max(failure_limit - failures, 0)
        locked = bool(getattr(settings, "AXES_LOCK_OUT_AT_FAILURE", True) and failures >= failure_limit)
        retry_after_seconds = None
        locked_until = None

        cool_off = get_cool_off(request)
        if locked and cool_off and latest_attempt:
            locked_until = latest_attempt + cool_off
            retry_after_seconds = int(max((locked_until - timezone.now()).total_seconds(), 0))

        return {
            "failure_limit": failure_limit,
            "failures": failures,
            "attempts_remaining": remaining,
            "locked": locked,
            "locked_until": locked_until,
            "retry_after_seconds": retry_after_seconds,
        }
    except Exception:
        logging.getLogger(__name__).exception("Failed to calculate login attempt state")
        return None


def _login_failure_response(attempt_state):
    if not attempt_state:
        return Response({"detail": "Invalid email or password."}, status=status.HTTP_401_UNAUTHORIZED)

    if attempt_state["locked"]:
        retry_after = attempt_state.get("retry_after_seconds")
        if retry_after is not None:
            minutes = max(1, (retry_after + 59) // 60)
            detail = f"Too many failed login attempts. Try again in {minutes} minute{'s' if minutes != 1 else ''}, or reset your password."
        else:
            detail = "Too many failed login attempts. Try again later, or reset your password."
        return Response(
            {
                "detail": detail,
                "code": "login_locked",
                "failure_limit": attempt_state["failure_limit"],
                "attempts_remaining": 0,
                "locked_until": attempt_state["locked_until"],
                "retry_after_seconds": retry_after,
            },
            status=status.HTTP_429_TOO_MANY_REQUESTS,
        )

    attempts_remaining = attempt_state["attempts_remaining"]
    detail = (
        f"Invalid email or password. {attempts_remaining} attempt"
        f"{'s' if attempts_remaining != 1 else ''} remaining before temporary lockout."
    )
    return Response(
        {
            "detail": detail,
            "code": "invalid_credentials",
            "failure_limit": attempt_state["failure_limit"],
            "attempts_remaining": attempts_remaining,
        },
        status=status.HTTP_401_UNAUTHORIZED,
    )


def _cookie_kwargs():
    return {
        "httponly": True,
        "secure": bool(getattr(settings, "JWT_COOKIE_SECURE", not settings.DEBUG)),
        "samesite": getattr(settings, "JWT_COOKIE_SAMESITE", "None" if not settings.DEBUG else "Lax"),
        "path": getattr(settings, "JWT_COOKIE_PATH", "/"),
    }


def _set_auth_cookies(response, *, access_token, refresh_token):
    response.set_cookie(
        getattr(settings, "JWT_AUTH_COOKIE", "ct_access"),
        access_token,
        max_age=int(settings.SIMPLE_JWT["ACCESS_TOKEN_LIFETIME"].total_seconds()),
        **_cookie_kwargs(),
    )
    response.set_cookie(
        getattr(settings, "JWT_REFRESH_COOKIE", "ct_refresh"),
        refresh_token,
        max_age=int(settings.SIMPLE_JWT["REFRESH_TOKEN_LIFETIME"].total_seconds()),
        **_cookie_kwargs(),
    )


def _clear_auth_cookies(response):
    cookie_kwargs = _cookie_kwargs()
    cookie_kwargs.pop("max_age", None)
    response.delete_cookie(getattr(settings, "JWT_AUTH_COOKIE", "ct_access"), path=cookie_kwargs["path"])
    response.delete_cookie(getattr(settings, "JWT_REFRESH_COOKIE", "ct_refresh"), path=cookie_kwargs["path"])


def _build_authenticated_user_payload(user):
    org_memberships = OrganizationMembership.objects.filter(user=user)
    org_payload = [
        {
            "organization_id": membership.organization_id,
            "organization_name": membership.organization.name,
            "role": membership.role,
            "region": membership.region,
            "pharmacies": [{"id": p.id, "name": p.name} for p in membership.pharmacies.all()],
            "capabilities": sorted(list(membership_capabilities(membership))),
        }
        for membership in org_memberships
    ]

    pharm_memberships = Membership.objects.filter(
        user=user,
        is_active=True,
    ).select_related("pharmacy")
    pharm_payload = [
        {
            "pharmacy_id": pm.pharmacy_id,
            "pharmacy_name": pm.pharmacy.name if pm.pharmacy else None,
            "role": pm.role,
        }
        for pm in pharm_memberships
    ]
    owned_pharmacies = Pharmacy.objects.filter(owner__user=user)
    for pharmacy in owned_pharmacies:
        pharm_payload.append(
            {
                "pharmacy_id": pharmacy.id,
                "pharmacy_name": pharmacy.name,
                "role": "OWNER",
            }
        )
    deduped_pharmacy_memberships = list(
        {entry["pharmacy_id"]: entry for entry in pharm_payload}.values()
    )

    admin_assignments = admin_assignments_for(user).select_related("pharmacy")
    admin_payload = [
        {
            "id": assignment.id,
            "pharmacy_id": assignment.pharmacy_id,
            "pharmacy_name": assignment.pharmacy.name if assignment.pharmacy else None,
            "admin_level": assignment.admin_level,
            "capabilities": sorted(list(assignment.capabilities)),
            "staff_role": assignment.staff_role,
            "job_title": assignment.job_title,
            "is_active": assignment.is_active,
        }
        for assignment in admin_assignments
    ]

    from billing.utils import is_billing_active, is_in_free_trial

    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "role": user.role,
        "memberships": org_payload + deduped_pharmacy_memberships,
        "admin_assignments": admin_payload,
        "is_pharmacy_admin": bool(admin_payload),
        "is_mobile_verified": bool(getattr(user, "is_mobile_verified", False)),
        "billing_active": is_billing_active(),
        "in_free_trial": is_in_free_trial(user),
    }


def verify_recaptcha(token):
    from django.conf import settings
    secret_key = settings.RECAPTCHA_SECRET_KEY
    url = 'https://www.google.com/recaptcha/api/siteverify'
    data = {'secret': secret_key, 'response': token}

    try:
        response = requests.post(url, data=data, timeout=5)
        response.raise_for_status()
    except requests.RequestException as exc:
        logging.getLogger(__name__).warning("reCAPTCHA verification failed: %s", exc)
        return False

    try:
        result = response.json()
    except ValueError:
        logging.getLogger(__name__).warning("reCAPTCHA response was not valid JSON")
        return False
    return result.get('success', False)

def _delete_verification_docs_for_user(user):
    from client_profile.models import PharmacistOnboarding, OtherStaffOnboarding, ExplorerOnboarding

    onboarding_configs = [
        (PharmacistOnboarding, ["government_id", "identity_secondary_file"]),
        (OtherStaffOnboarding, ["government_id", "identity_secondary_file"]),
        (ExplorerOnboarding, ["government_id", "identity_secondary_file"]),
    ]

    for model, file_fields in onboarding_configs:
        instance = model.objects.filter(user=user).first()
        if not instance:
            continue
        updated_fields = []
        for field_name in file_fields:
            file_field = getattr(instance, field_name, None)
            if file_field:
                try:
                    file_field.delete(save=False)
                except Exception:
                    logging.getLogger(__name__).exception(
                        "Failed deleting verification file %s for user %s", field_name, user.id
                    )
                setattr(instance, field_name, None)
                updated_fields.append(field_name)

        if hasattr(instance, "government_id_type"):
            instance.government_id_type = None
            updated_fields.append("government_id_type")
        if hasattr(instance, "identity_meta"):
            instance.identity_meta = {}
            updated_fields.append("identity_meta")

        if updated_fields:
            instance.save(update_fields=sorted(set(updated_fields)))

def _revoke_user_sessions(user):
    try:
        active_sessions = Session.objects.filter(expire_date__gte=timezone.now())
        for session in active_sessions:
            data = session.get_decoded()
            if str(data.get("_auth_user_id")) == str(user.id):
                session.delete()
    except Exception:
        logging.getLogger(__name__).exception("Failed to revoke Django sessions for user %s", user.id)

def _revoke_user_tokens(user):
    try:
        for token in OutstandingToken.objects.filter(user=user):
            BlacklistedToken.objects.get_or_create(token=token)
    except Exception:
        logging.getLogger(__name__).exception("Failed to revoke JWT tokens for user %s", user.id)

def _anonymize_user(user):
    original_email = (user.email or "").strip()
    update_fields = ["is_active", "deleted_at"]

    user.is_active = False
    user.deleted_at = timezone.now()
    user.set_unusable_password()
    update_fields.append("password")

    if original_email:
        user.email = f"deleted+{user.id}@chemisttasker.invalid"
        update_fields.append("email")

    user.username = None
    user.first_name = ""
    user.last_name = ""
    update_fields.extend(["username", "first_name", "last_name"])

    user.mobile_number = None
    user.mobile_otp_code = None
    user.mobile_otp_created_at = None
    user.is_mobile_verified = False
    update_fields.extend(
        ["mobile_number", "mobile_otp_code", "mobile_otp_created_at", "is_mobile_verified"]
    )

    user.save(update_fields=sorted(set(update_fields)))
    return original_email

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
        otp_context = {"otp": getattr(user, "_plain_email_otp", ""), "user": user}
        send_async_email(
            subject=otp_subject,
            recipient_list=[user.email],
            template_name="emails/otp_email.html",
            context=otp_context,
            text_template="emails/otp_email.txt"
        )

class VerifyOTPView(APIView):
    OTP_EXPIRY_MINUTES = 10
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp_verify"

    def post(self, request):
        email = request.data.get("email", "").strip().lower()
        otp = request.data.get("otp")
        user = User.objects.filter(email__iexact=email).first()

        if not user or not otp:
            return Response({"detail": "Invalid credentials."}, status=400)

        if not user.is_active:
            return Response({"detail": "Invalid credentials."}, status=400)

        if user.otp_locked_until and timezone.now() < user.otp_locked_until:
            return _get_lockout_response(user.otp_locked_until)

        # --- Check if OTP is expired ---
        if not user.otp_created_at or (timezone.now() - user.otp_created_at > timedelta(minutes=self.OTP_EXPIRY_MINUTES)):
            return Response({"detail": "OTP has expired. Please request a new code."}, status=400)

        # --- Check if OTP matches ---
        if not _otp_matches(otp, user.otp_code):
            just_locked = _register_email_otp_failure(user)
            if just_locked:
                return _get_lockout_response(user.otp_locked_until)
            return Response({"detail": "Incorrect OTP."}, status=400)

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

        # --- Also return tokens + user payload so frontend can call mobile-verify authenticated ---
        refresh = RefreshToken.for_user(user)

        # Build memberships payload exactly like your serializers
        from .models import OrganizationMembership
        from client_profile.models import Membership as PharmacyMembership

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

            context = {"otp": otp, "user": user}
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

# --- views.py (excerpt): mobile OTP flow ---

from datetime import timedelta
from django.utils import timezone
from django.conf import settings

import requests
from requests.auth import HTTPBasicAuth

from rest_framework import status, permissions
from rest_framework.views import APIView
from rest_framework.response import Response


# Helpers
def generate_otp() -> str:
    """Return a 6-digit OTP as a string."""
    return f"{secrets.randbelow(900000) + 100000}"


def normalize_au_mobile(raw: str) -> str:
    """
    Normalize Australian numbers to 61XXXXXXXXX format.
    Accepts: 0412..., +61412..., 61412..., with spaces/dashes.
    """
    if not raw:
        return ""
    n = raw.replace(" ", "").replace("-", "")
    if n.startswith("+"):
        n = n[1:]
    if n.startswith("0") and len(n) >= 2:
        n = "61" + n[1:]
    return n


def valid_otp_format(otp: str) -> bool:
    """OTP must be exactly 6 digits."""
    return bool(otp and otp.isdigit() and len(otp) == 6)


def _clean_identity_value(value):
    if value is None:
        return ""
    return str(value).strip()


def _capture_mobile_identity(user, payload):
    errors = {}

    incoming_first_name = _clean_identity_value(payload.get("first_name"))
    incoming_last_name = _clean_identity_value(payload.get("last_name"))
    incoming_username = _clean_identity_value(payload.get("username"))

    existing_first_name = _clean_identity_value(user.first_name)
    existing_last_name = _clean_identity_value(user.last_name)

    if not incoming_first_name:
        errors["first_name"] = "First name is required."
    elif existing_first_name and incoming_first_name != existing_first_name:
        errors["first_name"] = "First name is locked and cannot be changed."

    if not incoming_last_name:
        errors["last_name"] = "Last name is required."
    elif existing_last_name and incoming_last_name != existing_last_name:
        errors["last_name"] = "Last name is locked and cannot be changed."

    if not incoming_username:
        errors["username"] = "Username is required."

    if errors:
        return None, Response(errors, status=status.HTTP_400_BAD_REQUEST)

    changed_fields = []
    if user.first_name != incoming_first_name:
        user.first_name = incoming_first_name
        changed_fields.append("first_name")
    if user.last_name != incoming_last_name:
        user.last_name = incoming_last_name
        changed_fields.append("last_name")
    if user.username != incoming_username:
        user.username = incoming_username
        changed_fields.append("username")

    return changed_fields, None


def _resolve_mobile_otp_user(request):
    if request.user and request.user.is_authenticated:
        return request.user, None

    email = (request.data.get("email") or "").strip().lower()
    if not email:
        return None, Response(
            {"error": "Email is required."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    user = User.objects.filter(email__iexact=email).first()
    if not user:
        return None, Response(
            {"error": "No account found for this email."},
            status=status.HTTP_404_NOT_FOUND,
        )

    if not user.is_otp_verified:
        return None, Response(
            {"error": "Please verify your email before verifying your mobile number."},
            status=status.HTTP_400_BAD_REQUEST,
        )

    return user, None


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

        # 60-second cooldown to prevent spamming
        if user.mobile_otp_created_at and timezone.now() - user.mobile_otp_created_at < timedelta(seconds=60):
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
            debug_message = (
                f"[DEBUG] Mobile OTP for user={user.id} mobile={normalized}: {otp_code}"
            )
            print(debug_message)
            logging.getLogger(__name__).info(debug_message)
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
            logging.getLogger(__name__).warning(
                "Mobile OTP send failed for user %s with provider status %s: %s",
                user.id,
                resp.status_code,
                resp.text,
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

        return Response({"detail": "Mobile number verified successfully"}, status=status.HTTP_200_OK)


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
            debug_message = (
                f"[DEBUG] Mobile OTP resend for user={user.id} mobile={user.mobile_number}: {otp_code}"
            )
            print(debug_message)
            logging.getLogger(__name__).info(debug_message)
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
            logging.getLogger(__name__).warning(
                "Mobile OTP resend failed for user %s with provider status %s: %s",
                user.id,
                resp.status_code,
                resp.text,
            )
            return Response(
                {"error": "Unable to send verification code right now. Please try again later."},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        return Response({"detail": "OTP resent successfully"}, status=status.HTTP_200_OK)


class CustomLoginView(TokenObtainPairView):
    serializer_class = CustomTokenObtainPairSerializer

    def post(self, request, *args, **kwargs):
        credentials = {"username": (request.data.get("email") or "").strip().lower()}
        attempt_state = _get_login_attempt_state(request, credentials)
        if attempt_state and attempt_state["locked"]:
            return _login_failure_response(attempt_state)

        response = super().post(request, *args, **kwargs)
        if response.status_code >= 400:
            attempt_state = _get_login_attempt_state(request, credentials)
            return _login_failure_response(attempt_state)
        access = response.data.get("access")
        refresh = response.data.get("refresh")
        if access and refresh:
            _set_auth_cookies(response, access_token=access, refresh_token=refresh)
        return response

class CustomTokenRefreshView(TokenRefreshView):
    serializer_class = CustomTokenRefreshSerializer

    def post(self, request, *args, **kwargs):
        mutable_data = request.data.copy()
        if not mutable_data.get("refresh"):
            cookie_refresh = request.COOKIES.get(getattr(settings, "JWT_REFRESH_COOKIE", "ct_refresh"))
            if cookie_refresh:
                mutable_data["refresh"] = cookie_refresh
        if not mutable_data.get("refresh"):
            return Response({"detail": "Token is invalid or expired."}, status=status.HTTP_401_UNAUTHORIZED)

        serializer = self.get_serializer(data=mutable_data)
        try:
            serializer.is_valid(raise_exception=True)
        except ValidationError:
            return Response({"detail": "Token is invalid or expired."}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception:
            logging.getLogger(__name__).exception("Unexpected refresh failure")
            return Response({"detail": "Token is invalid or expired."}, status=status.HTTP_401_UNAUTHORIZED)

        response = Response(serializer.validated_data, status=status.HTTP_200_OK)

        access = serializer.validated_data.get("access")
        refresh = serializer.validated_data.get("refresh")
        if access and refresh:
            _set_auth_cookies(response, access_token=access, refresh_token=refresh)
        return response


class LogoutView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request, *args, **kwargs):
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

class PasswordResetConfirmAPIView(APIView):
    """
    Accepts JSON: { uid, token, new_password1, new_password2 }
    """
    permission_classes = []  # allow any

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
    permission_classes = []
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
                context={'reset_url': reset_url, 'user': user},
                text_template="emails/password_reset_email.txt",
            )
        # Always succeed (do not reveal which emails are registered)
        return Response({'detail': 'If this email exists, a reset link has been sent.'})


import secrets
from django.utils import timezone
from datetime import timedelta
from .models import WebSocketTicket

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


class ContactMessageCreateView(generics.CreateAPIView):
    serializer_class = ContactMessageCreateSerializer
    permission_classes = [permissions.AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "contact_form"
    queryset = ContactMessage.objects.all()

    def create(self, request, *args, **kwargs):
        user = request.user if request.user and request.user.is_authenticated else None
        captcha_token = request.data.get('captcha_token')

        if user is None and (not captcha_token or not verify_recaptcha(captcha_token)):
            raise ValidationError({
                'captcha': ['reCAPTCHA validation failed. Please try again.']
            })

        return super().create(request, *args, **kwargs)

    def perform_create(self, serializer):
        user = self.request.user if self.request.user and self.request.user.is_authenticated else None
        contact = serializer.save(user=user)

        support_email = getattr(settings, 'SUPPORT_EMAIL', settings.DEFAULT_FROM_EMAIL)
        context = {
            'name': contact.name,
            'email': contact.email,
            'phone': contact.phone,
            'subject': contact.subject,
            'message': contact.message,
            'source': contact.source,
            'page_url': contact.page_url,
            'app_version': contact.app_version,
            'submitted_at': contact.created_at,
        }

        send_async_email(
            subject=f"Contact Us: {contact.subject}",
            recipient_list=[support_email],
            template_name="emails/contact_us.html",
            context=context,
            text_template="emails/contact_us.txt",
        )

class InviteOrgUserView(generics.CreateAPIView):
    """
    Only ORG_ADMIN may invite into this organization.
    """
    serializer_class   = InviteOrgUserSerializer

    # Allow role-based access; capability checks enforce fine-grained control.
    required_roles     = ['ORG_ADMIN', 'CHIEF_ADMIN', 'REGION_ADMIN']
    permission_classes = [permissions.IsAuthenticated, OrganizationRolePermission]

    def perform_create(self, serializer):
        data = serializer.validated_data
        organization = data['organization']

        actor_membership = self.request.user.organization_memberships.filter(
            organization=organization
        ).first()
        if not actor_membership or OrgCapability.INVITE_STAFF not in membership_capabilities(actor_membership):
            raise PermissionDenied("You do not have permission to invite staff for this organization.")

        # 1) Find or create the User
        try:
            user = User.objects.get(email=data['email'])
            temp_password = None
        except User.DoesNotExist:
            temp_password = None
            user = User.objects.create_user(
                email    = data['email'],
                password = None,
                role     = 'ORG_STAFF'
            )
            user.set_unusable_password()
            user.save(update_fields=['password'])

        # 2) Find or create the membership; update if it already exists
        invitee_membership, created = OrganizationMembership.objects.get_or_create(
            user         = user,
            organization = organization,
            defaults     = {
                'role':        data['role'],
                'region':      data.get('region', ''),
                'job_title':   data.get('job_title', ''),
                'admin_level': data['admin_level'],
            }
        )
        update_fields = {'role', 'region', 'job_title', 'admin_level'}
        invitee_membership.role = data['role']
        invitee_membership.region = data.get('region', '')
        invitee_membership.job_title = data.get('job_title', '')
        invitee_membership.admin_level = data['admin_level']
        invitee_membership.save(update_fields=sorted(update_fields))

        pharmacies = data.get('pharmacies') or []
        if pharmacies:
            invitee_membership.pharmacies.set(pharmacies)
        else:
            invitee_membership.pharmacies.clear()

        # 3) Build the front-end reset link
        uid   = urlsafe_base64_encode(force_bytes(user.pk))
        token = default_token_generator.make_token(user)
        frontend_url = settings.FRONTEND_BASE_URL
        front_end_link = f"{frontend_url}/reset-password/{uid}/{token}/"

        invitee_membership = OrganizationMembership.objects.select_related(
            "organization"
        ).prefetch_related("pharmacies").get(pk=invitee_membership.pk)

        # 4) Prepare async email context and send
        context = build_org_invite_context(
            membership=invitee_membership,
            inviter=self.request.user,
            magic_link=front_end_link,
            dashboard_link=f"{frontend_url}/dashboard/organization/overview",
            temp_password=temp_password,
        )
        recipient_list = [user.email]

        async_task(
            'users.tasks.send_async_email',
            subject=f"You've been invited to join {organization.name} on ChemistTasker",
            recipient_list=recipient_list,
            template_name="emails/org_invite_new_user.html",
            context=context,
            text_template="emails/org_invite_new_user.txt",
        )

        # 5) Return success
        return Response({'detail': 'Invitation sent.'}, status=status.HTTP_201_CREATED)


class OrganizationMembershipViewSet(mixins.ListModelMixin,
                                    mixins.RetrieveModelMixin,
                                    mixins.UpdateModelMixin,
                                    mixins.DestroyModelMixin,
                                    viewsets.GenericViewSet):
    serializer_class = OrganizationMembershipDetailSerializer
    permission_classes = [permissions.IsAuthenticated]

    def _user_org_admin_ids(self, user):
        org_ids = set()
        memberships = user.organization_memberships.select_related('organization').prefetch_related('pharmacies')
        for membership in memberships:
            caps = membership_capabilities(membership)
            if OrgCapability.MANAGE_ADMINS in caps or OrgCapability.MANAGE_STAFF in caps:
                org_ids.add(membership.organization_id)
        return org_ids

    def get_queryset(self):
        user = self.request.user
        org_ids = self._user_org_admin_ids(user)
        if not org_ids:
            return OrganizationMembership.objects.none()
        queryset = OrganizationMembership.objects.filter(
            organization_id__in=org_ids
        ).select_related('user', 'organization').prefetch_related('pharmacies')

        organization_param = (
            self.request.query_params.get('organization')
            or self.request.query_params.get('organization_id')
        )
        if organization_param:
            try:
                organization_id = int(organization_param)
            except (TypeError, ValueError):
                raise PermissionDenied("Invalid organization id.")
            if organization_id not in org_ids:
                raise PermissionDenied("Not allowed to manage this organization.")
            queryset = queryset.filter(organization_id=organization_id)

        search = self.request.query_params.get('search')
        if search:
            search = search.strip()
            if search:
                queryset = queryset.filter(
                    Q(user__first_name__icontains=search) |
                    Q(user__last_name__icontains=search) |
                    Q(user__email__icontains=search) |
                    Q(job_title__icontains=search)
                )
        return queryset

    def _parse_bool_param(self, name: str) -> bool:
        raw = self.request.query_params.get(name)
        if raw is None:
            return False
        return str(raw).strip().lower() in {"1", "true", "yes", "on"}

    def _get_requested_org_id(self, org_ids):
        org_param = (
            self.request.query_params.get("organization")
            or self.request.query_params.get("organization_id")
        )
        if org_param is not None:
            try:
                org_id = int(org_param)
            except (TypeError, ValueError):
                raise PermissionDenied("Invalid organization id.")
            if org_id not in org_ids:
                raise PermissionDenied("Not allowed to manage this organization.")
            return org_id
        if len(org_ids) == 1:
            return next(iter(org_ids))
        raise PermissionDenied("Specify an organization id to load members.")

    def _ensure_membership_for_org_user(self, organization, user):
        membership = (
            Membership.objects.filter(
                user=user,
                is_active=True,
                pharmacy__organization=organization,
            )
            .select_related("pharmacy")
            .order_by("id")
            .first()
        )
        if membership:
            return membership
        primary_pharmacy = (
            Pharmacy.objects.filter(organization=organization).order_by("id").first()
        )
        if not primary_pharmacy:
            return None
        membership, _ = Membership.objects.get_or_create(
            user=user,
            pharmacy=primary_pharmacy,
            defaults={
                "role": "CONTACT",
                "employment_type": "FULL_TIME",
                "is_active": True,
            },
        )
        if not membership.is_active:
            membership.is_active = True
            membership.save(update_fields=["is_active"])
        return membership

    def list(self, request, *args, **kwargs):
        include_pharmacy_members = (
            self._parse_bool_param("include_pharmacy_members")
            or self._parse_bool_param("include_pharmacy_staff")
            or self._parse_bool_param("for_hub")
        )
        org_ids = self._user_org_admin_ids(request.user)
        if not include_pharmacy_members:
            return super().list(request, *args, **kwargs)
        if not org_ids:
            return Response([])

        organization_id = self._get_requested_org_id(org_ids)
        org_memberships = list(
            OrganizationMembership.objects.filter(
                organization_id=organization_id
            )
            .select_related("user", "organization")
            .prefetch_related("pharmacies")
        )
        memberships = list(
            Membership.objects.filter(
                pharmacy__organization_id=organization_id, is_active=True
            )
            .select_related("user", "pharmacy")
            .order_by("id")
        )
        membership_by_user = {}
        for membership in memberships:
            membership_by_user.setdefault(membership.user_id, []).append(membership)

        for org_membership in org_memberships:
            user_memberships = membership_by_user.get(org_membership.user_id, [])
            if user_memberships:
                continue
            ensured = self._ensure_membership_for_org_user(
                org_membership.organization, org_membership.user
            )
            if ensured:
                memberships.append(ensured)
                membership_by_user.setdefault(org_membership.user_id, []).append(ensured)

        org_meta_by_membership = {}
        for org_membership in org_memberships:
            linked_memberships = membership_by_user.get(org_membership.user_id, [])
            for membership in linked_memberships:
                org_meta_by_membership[membership.id] = {
                    "org_membership_id": org_membership.id,
                    "org_role": org_membership.role,
                    "org_job_title": org_membership.job_title,
                }

        search_term = (request.query_params.get("search") or "").strip().lower()
        memberships_filtered = memberships

        if search_term:
            def matches_search(membership):
                user = membership.user
                full_name = " ".join(
                    part for part in [user.first_name, user.last_name] if part
                ).lower()
                email = (getattr(user, "email", "") or "").lower()
                job_title = (membership.job_title or "").lower()
                pharmacy_name = ""
                pharmacy = getattr(membership, "pharmacy", None)
                if pharmacy:
                    pharmacy_name = (pharmacy.name or "").lower()
                org_meta = org_meta_by_membership.get(membership.id, {})
                org_job_title = (org_meta.get("org_job_title") or "").lower()
                return (
                    search_term in full_name
                    or search_term in email
                    or search_term in job_title
                    or search_term in pharmacy_name
                    or (org_meta.get("org_role") and search_term in org_meta["org_role"].lower())
                    or (org_job_title and search_term in org_job_title)
                )

            memberships_filtered = [m for m in memberships if matches_search(m)]

        def serialize_membership(membership):
            user = membership.user
            user_payload = {
                "id": user.id,
                "first_name": user.first_name,
                "last_name": user.last_name,
                "email": getattr(user, "email", None),
                "profile_photo_url": getattr(user, "profile_photo_url", None),
            }
            org_meta = org_meta_by_membership.get(membership.id, {})
            pharmacy = getattr(membership, "pharmacy", None)
            return {
                "id": membership.id,
                "membership_id": membership.id,
                "organization_membership_id": org_meta.get("org_membership_id"),
                "organization_role": org_meta.get("org_role"),
                "role": org_meta.get("org_role") or membership.role,
                "employment_type": membership.employment_type,
                "job_title": membership.job_title or org_meta.get("org_job_title"),
                "pharmacy": pharmacy.id if pharmacy else None,
                "pharmacy_name": pharmacy.name if pharmacy else None,
                "user": user_payload,
                "user_details": user_payload,
            }

        def sort_key(membership):
            name = ""
            user = membership.user
            if hasattr(user, "get_full_name"):
                name = (user.get_full_name() or user.email or "").lower()
            else:
                name = (getattr(user, "email", "") or "").lower()
            pharmacy_name = ""
            pharmacy = getattr(membership, "pharmacy", None)
            if pharmacy:
                pharmacy_name = pharmacy.name or ""
            return (name, pharmacy_name, membership.id)

        memberships_sorted = sorted(memberships_filtered, key=sort_key)
        data = [serialize_membership(membership) for membership in memberships_sorted]
        page = self.paginate_queryset(data)
        if page is not None:
            return self.get_paginated_response(page)
        return Response(data)

    def get_object(self):
        obj = super().get_object()
        if obj.organization_id not in self._user_org_admin_ids(self.request.user):
            raise PermissionDenied("Not allowed to access this membership.")
        return obj

    def perform_destroy(self, instance):
        request_user = self.request.user
        if instance.user_id == request_user.id:
            raise PermissionDenied("You cannot remove your own organization membership.")
        if instance.role == 'ORG_ADMIN':
            remaining = OrganizationMembership.objects.filter(
                organization=instance.organization,
                role='ORG_ADMIN'
            ).exclude(pk=instance.pk).count()
            if remaining == 0:
                raise PermissionDenied("Each organization must retain at least one Org Admin.")
        instance.delete()

    def perform_update(self, serializer):
        instance = serializer.instance
        new_role = serializer.validated_data.get('role', instance.role)
        if instance.role == 'ORG_ADMIN' and new_role != 'ORG_ADMIN':
            remaining = OrganizationMembership.objects.filter(
                organization=instance.organization,
                role='ORG_ADMIN'
            ).exclude(pk=instance.pk).count()
            if remaining == 0:
                raise PermissionDenied("Each organization must retain at least one Org Admin.")
        serializer.save()


class OrganizationRoleDefinitionView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        role_payload = []
        for definition in ROLE_DEFINITIONS.values():
            role_payload.append(
                {
                    'key': definition.key,
                    'label': definition.label,
                    'description': definition.description,
                    'default_admin_level': definition.default_admin_level,
                    'allowed_admin_levels': list(definition.allowed_admin_levels),
                    'requires_job_title': definition.requires_job_title,
                    'requires_region': definition.requires_region,
                    'requires_pharmacies': definition.requires_pharmacies,
                    'capabilities': sorted(definition.consolidated_capabilities()),
                }
            )

        admin_payload = []
        for definition in ADMIN_LEVEL_DEFINITIONS.values():
            admin_payload.append(
                {
                    'key': definition.key,
                    'label': definition.label,
                    'description': definition.description,
                    'capabilities': list(definition.pharmacy_capabilities),
                }
            )

        return Response(
            {
                'roles': role_payload,
                'admin_levels': admin_payload,
                # 'documentation': ROLE_DESCRIPTION_SUMMARY.strip(),
            }
        )

class DeleteAccountView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def delete(self, request):
        user = request.user
        if getattr(user, "deleted_at", None):
            return Response({"success": True}, status=status.HTTP_200_OK)

        original_email = (user.email or "").strip()
        original_name = user.get_full_name() or original_email or "there"

        with transaction.atomic():
            _anonymize_user(user)
            user.device_tokens.all().delete()
            _revoke_user_sessions(user)
            _revoke_user_tokens(user)
            _delete_verification_docs_for_user(user)

        if original_email:
            async_task(
                'users.tasks.send_async_email',
                subject="Your ChemistTasker account deletion",
                recipient_list=[original_email],
                template_name="emails/account_deleted.html",
                context={
                    "name": original_name,
                    "support_email": "info@chemisttasker.com",
                },
                text_template="emails/account_deleted.txt",
            )

        return Response({"success": True}, status=status.HTTP_200_OK)
