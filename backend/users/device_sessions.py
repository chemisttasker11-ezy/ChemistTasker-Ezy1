"""Device session inventory and immediate JWT revocation."""
from datetime import timedelta

from django.db import transaction
from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import NotFound, ValidationError
from rest_framework_simplejwt.exceptions import TokenBackendError, TokenError
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from rest_framework_simplejwt.settings import api_settings
from rest_framework_simplejwt.state import token_backend
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import UntypedToken
from rest_framework_simplejwt.utils import datetime_from_epoch, get_md5_hash_password

from users.models import DeviceToken, RevokedSession, User, UserSession, UserTwoFactor, WebSocketTicket
from users.sessions import build_authenticated_user_payload, refresh_session_policy
from users.tokens import RefreshToken, notify_auth_changed


def _device_label(request, client_kind, device_name):
    if client_kind == "native" and device_name.strip():
        return device_name.strip()[:60]
    agent = request.headers.get("User-Agent", "").lower()
    systems = (
        ("iphone", "iPhone"), ("ipad", "iPad"), ("android", "Android"), ("windows", "Windows"),
        ("macintosh", "Mac"), ("cros", "ChromeOS"), ("linux", "Linux"),
    )
    system = next((label for marker, label in systems if marker in agent), "")
    if client_kind == "native":
        return f"{system} app" if system else "Native app"
    browsers = (
        ("edg", "Edge"), ("opr/", "Opera"), ("firefox", "Firefox"), ("fxios", "Firefox"),
        ("chrome", "Chrome"), ("crios", "Chrome"), ("safari", "Safari"),
    )
    browser = next((label for marker, label in browsers if marker in agent), "Browser")
    return f"{browser} on {system}" if system else browser


def record_device_session(request, user, refresh, *, device_name=""):
    token = token_backend.decode(refresh, verify=False)
    UserSession.objects.create(
        user=user,
        sid=token["sid"],
        device_label=_device_label(request, token["session_kind"], device_name),
        client_kind=token["session_kind"],
        expires_at=datetime_from_epoch(token["exp"]),
    )


class RotatingRefreshSerializer(TokenRefreshSerializer):
    token_class = RefreshToken


@transaction.atomic
def refresh_device_session(request, raw_refresh):
    try:
        token = RefreshToken(raw_refresh)
        user = User.objects.select_for_update().get(pk=token["user_id"])
        policy = refresh_session_policy(request, token)
    except (TokenError, KeyError, User.DoesNotExist):
        raise ValidationError("Token is invalid or expired.")

    sid = token["sid"]
    fingerprint = get_md5_hash_password(user.password)
    if (
        not user.is_active or user.deleted_at
        or RevokedSession.objects.filter(session_id=sid).exists()
        or token.payload.setdefault(api_settings.REVOKE_TOKEN_CLAIM, fingerprint) != fingerprint
    ):
        raise ValidationError("Token is invalid or expired.")
    # Rotation rechecks the blacklist after acquiring the user lock.
    try:
        data = RotatingRefreshSerializer().validate({"refresh": str(token)})
    except TokenError:
        raise ValidationError("Token is invalid or expired.")
    if data.get("refresh"):
        data.update(RefreshToken(data["refresh"]).session_pair(**policy))
        expires_at = datetime_from_epoch(token_backend.decode(data["refresh"], verify=False)["exp"])
    else:
        expires_at = datetime_from_epoch(token["exp"])
    now = timezone.now()
    session, created = UserSession.objects.get_or_create(
        user=user,
        sid=sid,
        defaults={
            "device_label": _device_label(request, policy["session_kind"], ""),
            "client_kind": policy["session_kind"],
            "expires_at": expires_at,
        },
    )
    if not created:
        sessions = UserSession.objects.filter(pk=session.pk)
        if session.last_seen_at <= now - timedelta(minutes=5):
            sessions.update(last_seen_at=now, expires_at=expires_at)
        else:
            sessions.exclude(expires_at=expires_at).update(expires_at=expires_at)
    data["remember_me"] = policy["remember_me"]
    try:
        data["user"] = build_authenticated_user_payload(user)
    except Exception:
        # Preserve refresh if ancillary user data cannot be loaded.
        pass
    return data


def _active_sessions(user):
    return UserSession.objects.filter(user=user, revoked_at__isnull=True, expires_at__gt=timezone.now())


def list_device_sessions(user, current_sid):
    return [
        {**session, "current": session["sid"] == current_sid}
        for session in _active_sessions(user).order_by("-created_at", "-id").values(
            "sid", "device_label", "client_kind", "created_at", "last_seen_at",
        )
    ]


def _revoke_tokens(user_id, *, sid=None, keep_sid=None):
    sessions = UserSession.objects.filter(user_id=user_id, revoked_at__isnull=True)
    if sid is not None:
        sessions = sessions.filter(sid=sid)
    if keep_sid is not None:
        sessions = sessions.exclude(sid=keep_sid)
    revoked_sids = set(sessions.values_list("sid", flat=True))
    if sid is not None:
        revoked_sids.add(sid)

    # Outstanding JWTs also cover sessions created before the inventory existed.
    for token in OutstandingToken.objects.filter(user_id=user_id, expires_at__gt=timezone.now()).iterator():
        try:
            token_sid = token_backend.decode(token.token, verify=False).get("sid", token.jti)
        except TokenBackendError:
            token_sid = token.jti
        if token_sid == keep_sid or (sid is not None and token_sid != sid):
            continue
        BlacklistedToken.objects.get_or_create(token=token)
        revoked_sids.add(token_sid)

    RevokedSession.objects.bulk_create(
        [RevokedSession(session_id=value) for value in revoked_sids], ignore_conflicts=True,
    )
    sessions.update(revoked_at=timezone.now())
    tickets = WebSocketTicket.objects.filter(user_id=user_id)
    if sid is not None:
        tickets = tickets.filter(session_id=sid)
    if keep_sid is not None:
        tickets = tickets.exclude(session_id=keep_sid)
    tickets.delete()
    if keep_sid is None:
        transaction.on_commit(lambda: notify_auth_changed(user_id, sid))
    else:
        for value in revoked_sids:
            transaction.on_commit(lambda value=value: notify_auth_changed(user_id, value))


def revoke_user_tokens(user, *, keep_sid=None):
    """Revoke JWT sessions under the caller's user lock, including any trusted devices on revoke-all."""
    if keep_sid is None:
        UserTwoFactor.objects.filter(user=user).update(
            trusted_device_version=F("trusted_device_version") + 1, email_code_hash="",
        )
    _revoke_tokens(user.pk, keep_sid=keep_sid)


@transaction.atomic
def sign_out_everywhere(user):
    user = User.objects.select_for_update().get(pk=user.pk)
    revoke_user_tokens(user)


@transaction.atomic
def revoke_device_session(user, sid):
    user = User.objects.select_for_update().get(pk=user.pk)
    if not UserSession.objects.filter(user=user, sid=sid).exists():
        raise NotFound()
    _revoke_tokens(user.pk, sid=sid)


@transaction.atomic
def logout_device_session(raw_token, device_token):
    if not isinstance(raw_token, str):
        return
    try:
        refresh = UntypedToken(raw_token)
        if refresh.get("token_type") != "refresh":
            return
        user = User.objects.select_for_update().get(pk=refresh["user_id"])
    except (TokenError, KeyError, User.DoesNotExist):
        return
    # A rotated-away refresh token can still sign out its original session.
    _revoke_tokens(user.pk, sid=refresh.get("sid", refresh["jti"]))
    if isinstance(device_token, str) and device_token:
        DeviceToken.objects.filter(user=user, token=device_token).delete()
