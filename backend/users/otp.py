"""One-time codes for e-mail and mobile verification: hashing and matching, failed-attempt lockout,
code generation, Australian mobile normalisation and the identity captured with a mobile number."""
import secrets
from django.contrib.auth.hashers import make_password, check_password, identify_hasher
from rest_framework import status
from rest_framework.response import Response
from datetime import timedelta
from django.utils import timezone
from django.contrib.auth import get_user_model

User = get_user_model()


OTP_MAX_FAILED_ATTEMPTS = 5


OTP_LOCKOUT_MINUTES = 15


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
    existing_username = _clean_identity_value(user.username)
    identity_locked = bool(getattr(user, "is_mobile_verified", False))

    if not incoming_first_name:
        errors["first_name"] = "First name is required."
    elif identity_locked and existing_first_name and incoming_first_name != existing_first_name:
        errors["first_name"] = "First name is locked and cannot be changed."

    if not incoming_last_name:
        errors["last_name"] = "Last name is required."
    elif identity_locked and existing_last_name and incoming_last_name != existing_last_name:
        errors["last_name"] = "Last name is locked and cannot be changed."

    if not incoming_username:
        errors["username"] = "Username is required."
    elif identity_locked and existing_username and incoming_username != existing_username:
        errors["username"] = "Username is locked and cannot be changed."

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
