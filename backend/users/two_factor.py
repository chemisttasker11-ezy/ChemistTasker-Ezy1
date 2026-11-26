"""API two-factor setup, verification, sign-in challenges and trusted devices."""
import secrets
from datetime import timedelta

from django.conf import settings
from django.core import signing
from django.db import transaction
from django.utils import timezone
from django.utils.crypto import constant_time_compare, salted_hmac
from django_otp.plugins.otp_static.models import StaticDevice, StaticToken
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.exceptions import APIException, AuthenticationFailed, PermissionDenied, Throttled, ValidationError

from users.device_sessions import revoke_user_tokens
from users.models import OrganizationMembership, RevokedSession, User, UserTwoFactor
from users.otp import OTP_MAX_FAILED_ATTEMPTS, deliver_two_factor_email, generate_otp, hash_otp, otp_matches, valid_otp_format

METHODS = ("email", "authenticator", "backup")
CHALLENGE_TTL = 10 * 60
TRUSTED_DEVICE_TTL = 30 * 24 * 60 * 60
EMAIL_RESEND_SECONDS = 60
API_TOTP_NAME = "api-authenticator"
API_STATIC_NAME = "api-backup"
API_DEVICE_NAMES = frozenset({API_TOTP_NAME, API_STATIC_NAME})
CHALLENGE_SALT = "users.two-factor-challenge"
TRUSTED_DEVICE_SALT = "users.trusted-device"


def _can_set_up(user):
    return user.role == "OWNER" or user.organization_memberships.filter(
        role__in=[role for role, _ in OrganizationMembership.ROLE_CHOICES],
    ).exists()


def _totp_devices(user):
    return TOTPDevice.objects.filter(user=user, name=API_TOTP_NAME)


def _backup_devices(user):
    return StaticDevice.objects.filter(user=user, name=API_STATIC_NAME)


def _configured_methods(user, state):
    methods = []
    if state and state.email_confirmed:
        methods.append("email")
    if state and state.authenticator_confirmed:
        methods.append("authenticator")
    if methods and _backup_devices(user).filter(token_set__isnull=False).exists():
        methods.append("backup")
    return methods


def two_factor_status(user):
    state = UserTwoFactor.objects.filter(user=user).first()
    methods = _configured_methods(user, state)
    return {
        "eligible": settings.APP_TWO_FACTOR_ENROLLMENT_ENABLED and _can_set_up(user),
        "enabled": bool(methods), "methods": methods,
    }


def _lock_settings_user(user, sid, *, setup=False, enroll=False):
    locked = User.objects.select_for_update().get(pk=user.pk)
    if (
        not locked.is_active or locked.deleted_at or locked.password != user.password
        or (sid and RevokedSession.objects.filter(session_id=sid).exists())
    ):
        raise AuthenticationFailed("Session is no longer valid.")
    if enroll and not settings.APP_TWO_FACTOR_ENROLLMENT_ENABLED:
        raise PermissionDenied("Two-factor setup is not available yet.")
    if (setup or enroll) and not _can_set_up(locked):
        raise PermissionDenied("Two-factor setup is available to owners and organisation admins.")
    return locked


class EmailDeliveryUnavailable(APIException):
    status_code = 503
    default_detail = "The code could not be sent. Try again shortly."


def _send_email_code(user, state):
    now = timezone.now()
    if state.email_code_sent_at:
        elapsed = (now - state.email_code_sent_at).total_seconds()
        if elapsed < EMAIL_RESEND_SECONDS:
            raise Throttled(wait=EMAIL_RESEND_SECONDS - elapsed)
    code = generate_otp()
    state.email_code_hash = hash_otp(code)
    state.email_code_sent_at = now
    state.email_code_guesses = 0
    state.save(update_fields=["email_code_hash", "email_code_sent_at", "email_code_guesses"])
    if not deliver_two_factor_email(user, code):
        raise EmailDeliveryUnavailable()
    return {"resend_after_seconds": EMAIL_RESEND_SECONDS}


def _verify_email_code(state, code):
    if (
        not state.email_code_hash or not state.email_code_sent_at
        or timezone.now() >= state.email_code_sent_at + timedelta(seconds=CHALLENGE_TTL)
        or state.email_code_guesses >= OTP_MAX_FAILED_ATTEMPTS
    ):
        return False
    state.email_code_guesses += 1
    valid = valid_otp_format(code) and otp_matches(code, state.email_code_hash)
    if valid:
        state.email_code_hash = ""
    state.save(update_fields=["email_code_guesses", "email_code_hash"])
    return valid


@transaction.atomic
def start_email_two_factor(user, sid):
    user = _lock_settings_user(user, sid, enroll=True)
    state, _ = UserTwoFactor.objects.get_or_create(user=user)
    return _send_email_code(user, state)


@transaction.atomic
def confirm_email_two_factor(user, sid, code):
    user = _lock_settings_user(user, sid, enroll=True)
    state = UserTwoFactor.objects.filter(user=user, email_confirmed=False).first()
    if not state or not _verify_email_code(state, code):
        return None
    state.email_confirmed = True
    state.save(update_fields=["email_confirmed"])
    revoke_user_tokens(user, keep_sid=sid or "")
    return two_factor_status(user)


@transaction.atomic
def start_authenticator_two_factor(user, sid):
    user = _lock_settings_user(user, sid, enroll=True)
    state, _ = UserTwoFactor.objects.get_or_create(user=user)
    if state.authenticator_confirmed:
        raise ValidationError("Authenticator is already configured.")
    # Keep API devices out of django-otp's confirmed-device discovery for admin.
    device, _ = TOTPDevice.objects.get_or_create(user=user, name=API_TOTP_NAME, confirmed=False)
    return {"otpauth_uri": device.config_url}


@transaction.atomic
def confirm_authenticator_two_factor(user, sid, code):
    user = _lock_settings_user(user, sid, enroll=True)
    state = UserTwoFactor.objects.filter(user=user, authenticator_confirmed=False).first()
    device = _totp_devices(user).first()
    if not state or not device or not _verify_totp(device, code):
        return None
    state.authenticator_confirmed = True
    state.save(update_fields=["authenticator_confirmed"])
    revoke_user_tokens(user, keep_sid=sid or "")
    return two_factor_status(user)


def _backup_digest(user, code):
    return salted_hmac("users.two-factor-backup", f"{user.pk}:{code.lower()}", algorithm="sha256").hexdigest()[:16]


@transaction.atomic
def regenerate_backup_codes(user, sid):
    user = _lock_settings_user(user, sid, setup=True)
    if not two_factor_status(user)["enabled"]:
        raise ValidationError("Confirm email or authenticator before generating backup codes.")
    device, _ = StaticDevice.objects.get_or_create(user=user, name=API_STATIC_NAME, confirmed=False)
    device.token_set.all().delete()
    device.throttle_reset()
    codes = [secrets.token_hex(8) for _ in range(10)]
    StaticToken.objects.bulk_create([StaticToken(device=device, token=_backup_digest(user, code)) for code in codes])
    return {"backup_codes": codes}


def _verify_totp(device, code):
    # Submit invalid formats as a failed guess too, without accepting shorter numeric strings.
    return device.verify_token(code if valid_otp_format(code) else -1)


def verify_two_factor_code(user, state, method, code):
    if method == "email":
        return state.email_confirmed and _verify_email_code(state, code)
    if method == "authenticator":
        device = _totp_devices(user).first() if state.authenticator_confirmed else None
        return bool(device and _verify_totp(device, code))
    if method == "backup":
        device = _backup_devices(user).first()
        return bool(device and device.verify_token(_backup_digest(user, code)))
    return False


@transaction.atomic
def disable_two_factor(user, sid, password, method, code):
    user = _lock_settings_user(user, sid)
    state = UserTwoFactor.objects.filter(user=user).first()
    if not state or not user.check_password(password) or not verify_two_factor_code(user, state, method, code):
        return None
    _totp_devices(user).delete()
    _backup_devices(user).delete()
    state.email_confirmed = False
    state.authenticator_confirmed = False
    state.email_code_hash = ""
    state.trusted_device_version += 1
    state.save(update_fields=["email_confirmed", "authenticator_confirmed", "email_code_hash", "trusted_device_version"])
    revoke_user_tokens(user, keep_sid=sid or "")
    return two_factor_status(user)


def _token_claims(user, state, client_kind):
    return {
        "uid": user.pk,
        "fingerprint": user.get_session_auth_hash(),
        "version": state.trusted_device_version,
        "kind": client_kind,
    }


def _load_token(raw_token, salt, max_age):
    try:
        return signing.loads(raw_token, salt=salt, max_age=max_age)
    except signing.BadSignature:
        return None


def _matches_claims(claims, user, state, client_kind):
    expected = _token_claims(user, state, client_kind)
    return all(claims.get(key) == expected[key] for key in ("uid", "version", "kind")) and constant_time_compare(
        claims.get("fingerprint", ""), expected["fingerprint"],
    )


def login_challenge(user, client_kind, trusted_token, remember_me, device_name):
    state = UserTwoFactor.objects.filter(user=user).first()
    if not state:
        return None
    methods = _configured_methods(user, state)
    if not methods:
        return None
    trusted = _load_token(trusted_token, TRUSTED_DEVICE_SALT, TRUSTED_DEVICE_TTL) if trusted_token else None
    if trusted and _matches_claims(trusted, user, state, client_kind):
        return None
    claims = {**_token_claims(user, state, client_kind), "remember_me": remember_me, "device_name": device_name}
    return {
        "code": "two_factor_required",
        "methods": methods,
        "challenge_token": signing.dumps(claims, salt=CHALLENGE_SALT),
    }


def lock_login_challenge(challenge_token, client_kind):
    claims = _load_token(challenge_token, CHALLENGE_SALT, CHALLENGE_TTL)
    if claims:
        user = User.objects.select_for_update().filter(pk=claims["uid"], is_active=True, deleted_at__isnull=True).first()
        if user and user.is_otp_verified:
            state = UserTwoFactor.objects.filter(user=user).first()
            if state and _matches_claims(claims, user, state, client_kind) and _configured_methods(user, state):
                return user, state, claims
    raise AuthenticationFailed({"code": "invalid_two_factor_challenge", "detail": "Sign-in challenge is invalid or expired."})


def issue_trusted_device(user, state, client_kind):
    return signing.dumps(_token_claims(user, state, client_kind), salt=TRUSTED_DEVICE_SALT)


def send_login_two_factor_email(user, state):
    if not state.email_confirmed:
        raise ValidationError("Email two-factor is unavailable.")
    return _send_email_code(user, state)
