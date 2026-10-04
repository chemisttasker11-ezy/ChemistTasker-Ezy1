"""Login lockout state (django-axes): attempts remaining, lock and cool-off, and the login failure
responses built from it.

Logs go to the historical "users.views" channel that operators filter on."""
import logging
from rest_framework import status
from rest_framework.response import Response
from django.conf import settings
from django.utils import timezone
from django.db.models import Max, Sum


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
        failures = getattr(request, "axes_failures_since_start", None)
        latest_attempt = None
        if failures is None:
            attempts_list = get_user_attempts(request, credentials)
            failures = 0
            for attempts in attempts_list:
                aggregate = attempts.aggregate(
                    failures=Sum("failures_since_start"),
                    latest=Max("attempt_time"),
                )
                failures = max(failures, int(aggregate["failures"] or 0))
                latest = aggregate["latest"]
                if latest and (latest_attempt is None or latest > latest_attempt):
                    latest_attempt = latest
        failures = int(failures or 0)

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
        logging.getLogger("users.views").exception("Failed to calculate login attempt state")
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
        return Response(
            {
                "detail": "Your email address is not verified. Enter the email OTP we sent before logging in.",
                "code": "email_not_verified",
            },
            status=status.HTTP_401_UNAUTHORIZED,
        )

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
            }
        )
        payload["detail"] = (
            f"Invalid email or password. {attempts_remaining} login attempt"
            f"{'s' if attempts_remaining != 1 else ''} remaining before temporary lockout."
        )
    return Response(payload, status=status.HTTP_401_UNAUTHORIZED)
