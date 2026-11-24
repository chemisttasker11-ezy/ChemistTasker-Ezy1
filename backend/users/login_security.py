"""Login lockout state (django-axes): attempts remaining, lock and cool-off, and the login failure
responses built from it.

Logs go to the historical "users.views" channel that operators filter on."""
import logging
from axes.utils import reset as reset_axes_attempts
from rest_framework import status
from rest_framework.response import Response
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.hashers import check_password
from django.core.cache import caches
from django.utils import timezone
from django.db.models import Max, Sum
from users.delivery import deliver_email_best_effort
from users.otp import hash_otp, otp_matches, generate_otp, registration_correction_token, valid_otp_format
from users.tasks import send_async_email

User = get_user_model()

CAPTCHA_FAILURE_THRESHOLD = 3
LOGIN_CODE_TTL = 3600
LOGIN_CODE_MAX_GUESSES = 5


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
        logging.getLogger("users.views").exception("Failed to reset login lockout state for user %s", user.id)


def _get_login_attempt_state(request, credentials):
    if not getattr(settings, "AXES_ENABLED", False):
        return None
    try:
        from axes.attempts import get_user_attempts
        from axes.handlers.proxy import AxesProxyHandler
        from axes.helpers import get_cool_off, get_failure_limit

        AxesProxyHandler.update_request(request)
        failures = 0
        latest_attempt = None
        for attempts in get_user_attempts(request, credentials):
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
            "ip_address": request.axes_ip_address,
        }
    except Exception:
        logging.getLogger("users.views").exception("Failed to calculate login attempt state")
        return None


def _login_failure_response(attempt_state):
    retry_after = attempt_state["retry_after_seconds"]
    if retry_after is None:
        wait = "try again later"
    else:
        minutes = max(1, (retry_after + 59) // 60)
        wait = f"try again in {minutes} minute{'s' if minutes != 1 else ''}"
    return Response(
        {
            "detail": f"Too many failed login attempts. Enter the code sent to your email, if available, or {wait}.",
            "code": "login_locked",
            "captcha_required": True,
            "failure_limit": attempt_state["failure_limit"],
            "attempts_remaining": 0,
            "locked_until": attempt_state["locked_until"],
            "retry_after_seconds": retry_after,
        },
        status=status.HTTP_429_TOO_MANY_REQUESTS,
    )


def _send_login_recovery_code(user):
    if not user or not user.is_active or not user.is_otp_verified:
        return
    cache = caches["security"]
    key = f"users:login-code:{user.pk}"
    try:
        if cache.get(key):
            return
        code = generate_otp()
        challenge = (hash_otp(code), user.get_session_auth_hash())
        if not cache.add(key, challenge, LOGIN_CODE_TTL):
            return
    except Exception:
        logging.getLogger("users.views").exception("Could not create login recovery code for user %s", user.pk)
        return
    deliver_email_best_effort(
        send_async_email,
        subject="Your ChemistTasker sign-in recovery code",
        recipient_list=[user.email],
        template_name="emails/login_recovery_email.html",
        text_template="emails/login_recovery_email.txt",
        context={"otp": code},
        event="login_recovery_code",
        user_id=user.pk,
    )


def _consume_login_recovery_code(user, password, code):
    if not user or not user.is_active or not user.is_otp_verified or not valid_otp_format(code):
        return False
    cache = caches["security"]
    key = f"users:login-code:{user.pk}"
    try:
        challenge = cache.get(key)
        if not challenge:
            return False
        otp_hash, password_fingerprint = challenge
        if password_fingerprint != user.get_session_auth_hash() or not check_password(password, user.password):
            return False
        # Count guesses only after password verification, so an outsider cannot exhaust the code.
        guess_key = f"{key}:guesses:{otp_hash}"
        cache.add(guess_key, 0, LOGIN_CODE_TTL)
        if cache.incr(guess_key) > LOGIN_CODE_MAX_GUESSES or not otp_matches(code, otp_hash):
            return False
        return cache.add(f"{key}:used:{otp_hash}", True, LOGIN_CODE_TTL)
    except Exception:
        logging.getLogger("users.views").exception("Could not verify login recovery code for user %s", user.pk)
        return False


def _login_invalid_credentials_response(user, attempt_state, *, password_matches=False):
    if attempt_state and attempt_state["locked"]:
        return _login_failure_response(attempt_state)

    # Do not disclose whether an email exists, an account is disabled, or a
    # password was wrong. The only actionable exception is an unverified
    # account whose password was actually correct, so that user can continue
    # to the OTP verification flow.
    if (
        user is not None
        and user.is_active
        and password_matches
        and not getattr(user, "is_otp_verified", False)
    ):
        payload = {
            "detail": "Your email address is not verified. Enter the email OTP we sent before logging in.",
            "code": "email_not_verified",
        }
        if user.accepted_terms and user.role in user.SELF_REGISTRATION_ROLES:
            payload["correction_token"] = registration_correction_token(user)
        return Response(payload, status=status.HTTP_401_UNAUTHORIZED)

    payload = {
        "detail": "Invalid email or password.",
        "code": "invalid_credentials",
    }
    if attempt_state:
        failure_limit = int(attempt_state["failure_limit"])
        failures = int(attempt_state.get("failures") or 0)
        attempts_remaining = max(failure_limit - failures, 0)
        payload.update(
            {
                "failure_limit": failure_limit,
                "attempts_remaining": attempts_remaining,
                "captcha_required": failures >= CAPTCHA_FAILURE_THRESHOLD,
            }
        )
        payload["detail"] = (
            f"Invalid email or password. {attempts_remaining} login attempt"
            f"{'s' if attempts_remaining != 1 else ''} remaining before temporary lockout."
        )
    return Response(payload, status=status.HTTP_401_UNAUTHORIZED)


def precheck_login(request, *, email, password, captcha_token, recovery_code, verify_captcha):
    credentials = {User.USERNAME_FIELD: email}
    attempt_state = _get_login_attempt_state(request, credentials)
    if attempt_state and (attempt_state["locked"] or attempt_state["failures"] >= CAPTCHA_FAILURE_THRESHOLD):
        locked = attempt_state["locked"]
        if locked and (not valid_otp_format(recovery_code) or not isinstance(password, str)):
            return attempt_state, _login_failure_response(attempt_state)
        if not isinstance(captcha_token, str) or not captcha_token or not verify_captcha(captcha_token):
            if locked:
                return attempt_state, _login_failure_response(attempt_state)
            return attempt_state, Response(
                {
                    "detail": "Complete reCAPTCHA to try again.",
                    "code": "captcha_required",
                    "captcha_required": True,
                    "failure_limit": attempt_state["failure_limit"],
                    "attempts_remaining": attempt_state["attempts_remaining"],
                },
                status=status.HTTP_400_BAD_REQUEST,
            )
        if locked:
            user = User.objects.filter(email__iexact=email).first()
            if not _consume_login_recovery_code(user, password, recovery_code):
                return attempt_state, _login_failure_response(attempt_state)
            reset_axes_attempts(ip=attempt_state["ip_address"], username=email)
    return attempt_state, None


def finish_login_attempt(request, *, email, password, attempt_state, response):
    if response is None or response.status_code >= 400:
        attempt_state = _get_login_attempt_state(request, {User.USERNAME_FIELD: email})
        user = User.objects.filter(email__iexact=email).first() if email else None
        if attempt_state and attempt_state["locked"]:
            _send_login_recovery_code(user)
            return _login_failure_response(attempt_state)
        return _login_invalid_credentials_response(
            user,
            attempt_state,
            password_matches=bool(
                user and not user.is_otp_verified and isinstance(password, str) and user.check_password(password)
            ),
        )

    if attempt_state and attempt_state["failures"] and not attempt_state["locked"]:
        reset_axes_attempts(ip=attempt_state["ip_address"], username=email)
    return response
