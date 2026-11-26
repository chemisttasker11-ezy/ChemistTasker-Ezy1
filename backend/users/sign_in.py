"""Password and second-factor sign-in share session issuance and lockout state."""
from django.contrib.auth import authenticate
from django.db import transaction
from rest_framework.response import Response
from rest_framework_simplejwt.settings import api_settings

from users.device_sessions import record_device_session
from users.login_security import (
    finish_login_attempt, precheck_login, two_factor_attempt_state, record_two_factor_failure,
)
from users.models import User
from users.sessions import build_authenticated_user_payload, issue_session_tokens
from users.tokens import RefreshToken
from users.two_factor import (
    issue_trusted_device, lock_login_challenge, login_challenge, send_login_two_factor_email,
    verify_two_factor_code,
)


def _issue_login(request, user, remember_me, device_name):
    tokens = issue_session_tokens(request, RefreshToken.for_user(user), remember_me=remember_me)
    record_device_session(request, user, tokens["refresh"], device_name=device_name)
    return Response({**tokens, "user": build_authenticated_user_payload(user)})


@transaction.atomic
def sign_in(request, *, client_kind, trusted_token, captcha_token, recovery_code, verify_captcha,
            email, password, remember_me=False, device_name=""):
    email = email.lower()
    # Serialize issuance with changes to the account's password, factors and sessions.
    User.objects.select_for_update().filter(email__iexact=email).first()
    attempt_state, refusal = precheck_login(
        request, email=email, password=password, captcha_token=captcha_token,
        recovery_code=recovery_code, verify_captcha=verify_captcha,
    )
    if refusal is not None:
        return refusal

    user = authenticate(request=request, email=email, password=password)
    response = None
    if api_settings.USER_AUTHENTICATION_RULE(user) and user.is_otp_verified and not user.deleted_at:
        challenge = login_challenge(user, client_kind, trusted_token, remember_me, device_name[:60])
        if challenge:
            return Response(challenge, status=401)
        response = _issue_login(request, user, remember_me, device_name)

    return finish_login_attempt(
        request, email=email, password=password, attempt_state=attempt_state, response=response,
    )


@transaction.atomic
def complete_two_factor_login(request, *, client_kind, challenge_token, method, code, remember_device=False):
    user, state, claims = lock_login_challenge(challenge_token, client_kind)
    attempt_state, refusal = two_factor_attempt_state(request, user)
    if refusal is not None:
        return refusal
    if not verify_two_factor_code(user, state, method, code):
        return record_two_factor_failure(request, user)

    response = _issue_login(request, user, claims["remember_me"], claims["device_name"])
    if remember_device:
        response.data["trusted_device_token"] = issue_trusted_device(user, state, client_kind)
    return finish_login_attempt(
        request, email=user.email.lower(), password=None, attempt_state=attempt_state, response=response,
    )


@transaction.atomic
def send_two_factor_login_code(request, *, client_kind, challenge_token):
    user, state, _ = lock_login_challenge(challenge_token, client_kind)
    _, refusal = two_factor_attempt_state(request, user)
    return refusal if refusal is not None else Response(send_login_two_factor_email(user, state))
