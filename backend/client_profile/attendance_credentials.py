"""Kiosk device activation, signed rotating QR, and personal code (WorkerPIN) services.

Provides the secure credential and physical-presence verification layer:
1. Kiosk Activation & Revocation:
   - Owner/manager-authorized activation issuing restricted `ctk_kiosk_...` tokens.
   - Protected credential storage; tokens provide strictly scoped kiosk access.
   - Immediate revocation invalidating all device actions.
2. Signed Rotating Pharmacy QR:
   - Cryptographically signed (HMAC via Django signing) short-lived QR codes.
   - Rotating expiry (default 60s TTL); concurrent worker scans supported.
   - Strict tamper detection, expiry enforcement, and pharmacy context isolation.
3. Personal Code (WorkerPIN) Lifecycle & Verification:
   - Owner/manager-authorized PIN creation and toggling.
   - Kiosk-only verification looking up worker by email or ID without prefixes.
   - Cross-site PIN resolution for eligible staff under same owner or organization.
   - Atomic row-locked attempt counting, 15-minute lockout on 5 failed attempts,
     and safe attempt resets on success.
"""

from datetime import datetime, timedelta
import base64
import hashlib
import secrets
import uuid
from typing import Optional, Tuple

from django.conf import settings
from django.core import signing
from django.core.cache import cache, caches
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import DatabaseError, IntegrityError, transaction
from django.db.models import Q
from django.utils import timezone
from django.utils.crypto import salted_hmac
from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from client_profile.models import (
    Chain,
    KioskDevice,
    KioskPairingAuthorization,
    Membership,
    Pharmacy,
    PharmacyAdmin,
    PharmacyQRSession,
    WorkerPIN,
)


QR_SALT = "chemisttasker_attendance_kiosk_qr"
DEVICE_TOKEN_PREFIX = "ctk_kiosk_"
security_cache = caches["security"]


def _count_security_attempt(key: str, *, limit: int, window: int) -> None:
    """Atomic, shared fixed-window limit; cache failure rejects a code attempt."""
    try:
        security_cache.add(key, 0, timeout=window)
        attempts = security_cache.incr(key)
    except Exception as exc:
        raise ValidationError("Verification is temporarily unavailable. Please retry shortly.") from exc
    if attempts > limit:
        raise ValidationError("Too many verification attempts. Please retry later.")


def _validate_kiosk_public_key(public_signing_key: str, *, required: bool = False) -> str:
    encoded = str(public_signing_key or "").strip()
    if not encoded:
        if required:
            raise ValidationError("A device public signing key is required.")
        return ""
    try:
        decoded = base64.b64decode(encoded, validate=True)
        if len(decoded) != 32:
            raise ValueError
        Ed25519PublicKey.from_public_bytes(decoded)
    except (TypeError, ValueError) as exc:
        raise ValidationError("Device public signing key is invalid.") from exc
    return encoded


def hash_kiosk_token(raw_token: str) -> str:
    """Compute deterministic SHA-256 hex digest for storing and querying kiosk device tokens."""
    if not raw_token or not isinstance(raw_token, str):
        return ""
    return hashlib.sha256(raw_token.strip().encode("utf-8")).hexdigest()


def is_authorized_kiosk_manager(user, pharmacy: Pharmacy) -> bool:
    """Check whether a user has authority to activate/manage kiosks or worker PINs."""
    if not user or not pharmacy:
        return False
    if user.is_superuser:
        return True

    # 1. Owner check
    owner = getattr(pharmacy, "owner", None)
    if owner and getattr(owner, "user_id", None) == user.id:
        return True

    # 2. PharmacyAdmin check
    if PharmacyAdmin.objects.filter(
        user=user,
        pharmacy=pharmacy,
        is_active=True,
        admin_level__in=[PharmacyAdmin.AdminLevel.OWNER, PharmacyAdmin.AdminLevel.MANAGER],
    ).exists():
        return True

    # 3. Organization admins, limited to their explicit pharmacy scope when set.
    if pharmacy.organization_id:
        try:
            from users.models import OrganizationMembership

            membership = OrganizationMembership.objects.filter(
                user=user,
                organization_id=pharmacy.organization_id,
                role="ORG_ADMIN",
            ).first()
            if membership:
                scope = membership.pharmacies.all()
                return not scope.exists() or scope.filter(pk=pharmacy.pk).exists()
        except DatabaseError:
            # Some isolated legacy tests intentionally omit the users membership table.
            return False
    return False


# -----------------------------------------------------------------------------
# 1. Kiosk Device Management
# -----------------------------------------------------------------------------

def activate_kiosk_device(
    user,
    pharmacy: Pharmacy,
    device_name: str,
    *,
    public_signing_key: str = "",
    platform: str = "",
    app_version: str = "",
    client_kind: str = "WEB_ONLINE",
) -> Tuple[KioskDevice, str]:
    """Activate a new kiosk device for a pharmacy, issuing a restricted device token."""
    if not is_authorized_kiosk_manager(user, pharmacy):
        raise PermissionDenied("Only the pharmacy owner or manager can activate a kiosk device.")

    if not device_name or not str(device_name).strip():
        raise ValidationError("A non-empty device name is required.")

    raw_token = f"{DEVICE_TOKEN_PREFIX}{secrets.token_urlsafe(32)}"
    token_hash = hash_kiosk_token(raw_token)

    device = KioskDevice.objects.create(
        pharmacy=pharmacy,
        device_name=str(device_name).strip(),
        public_signing_key=_validate_kiosk_public_key(public_signing_key),
        platform=str(platform or "")[:24],
        app_version=str(app_version or "")[:40],
        client_kind=client_kind,
        device_token=token_hash,
        is_active=True,
        activated_by=user,
    )

    return device, raw_token


KIOSK_DISCONNECT_CONTEXT = "chemisttasker:kiosk-disconnect:v1"
KIOSK_DISCONNECT_PROOF_MAX_AGE_SECONDS = 120


def _mark_kiosk_device_revoked(kiosk_device: KioskDevice) -> KioskDevice:
    """Single revocation state transition used by manager and device-initiated revocation."""
    if kiosk_device.is_active:
        kiosk_device.is_active = False
        kiosk_device.revoked_at = timezone.now()
        kiosk_device.save(update_fields=["is_active", "revoked_at"])
    return kiosk_device


def revoke_kiosk_device(user, kiosk_device: KioskDevice) -> KioskDevice:
    """Revoke an active kiosk device under authenticated manager authority."""
    if not is_authorized_kiosk_manager(user, kiosk_device.pharmacy):
        raise PermissionDenied("Only the pharmacy owner or manager can revoke a kiosk device.")
    return _mark_kiosk_device_revoked(kiosk_device)


def revoke_kiosk_device_by_credential(
    kiosk_device: KioskDevice,
    *,
    issued_at: str = "",
    proof_signature: str = "",
) -> KioskDevice:
    """Allow a kiosk to revoke only itself.

    Native/offline kiosks must prove possession of their registered Ed25519
    private key in addition to presenting the restricted device token. Legacy
    web-online kiosks have no device signing key, so their already-restricted
    device token is the self-revocation credential.
    """
    if kiosk_device.client_kind == "NATIVE_OFFLINE":
        if not kiosk_device.public_signing_key:
            raise ValidationError("Native kiosk signing key is not registered.")
        try:
            parsed_issued_at = datetime.fromisoformat(str(issued_at).replace("Z", "+00:00"))
        except (TypeError, ValueError) as exc:
            raise ValidationError("Kiosk disconnect proof timestamp is invalid.") from exc
        if parsed_issued_at.tzinfo is None:
            raise ValidationError("Kiosk disconnect proof timestamp must include a timezone.")
        age_seconds = abs((timezone.now() - parsed_issued_at).total_seconds())
        if age_seconds > KIOSK_DISCONNECT_PROOF_MAX_AGE_SECONDS:
            raise ValidationError("Kiosk disconnect proof has expired.")
        message = (
            f"{KIOSK_DISCONNECT_CONTEXT}|{kiosk_device.installation_id}|{issued_at}"
        ).encode("utf-8")
        try:
            signature = base64.b64decode(str(proof_signature or ""), validate=True)
            _validate_kiosk_public_key(kiosk_device.public_signing_key, required=True)
            key = Ed25519PublicKey.from_public_bytes(
                base64.b64decode(kiosk_device.public_signing_key, validate=True)
            )
            key.verify(signature, message)
        except (TypeError, ValueError, InvalidSignature) as exc:
            raise ValidationError("Native kiosk disconnect proof is invalid.") from exc

    return _mark_kiosk_device_revoked(kiosk_device)


def authenticate_kiosk_device(device_token: str) -> Optional[KioskDevice]:
    """Resolve an active kiosk device from its scoped device token."""
    if not device_token or not isinstance(device_token, str):
        return None

    cleaned_token = device_token.strip()
    token_hash = hash_kiosk_token(cleaned_token)

    # 1. Primary lookup by hashed token
    device = (
        KioskDevice.objects.select_related("pharmacy")
        .filter(device_token=token_hash, is_active=True)
        .first()
    )
    if device is not None:
        return device

    # 2. Backward-compatible fallback for legacy unhashed tokens
    return (
        KioskDevice.objects.select_related("pharmacy")
        .filter(device_token=cleaned_token, is_active=True)
        .first()
    )


KIOSK_PAIR_CACHE_PREFIX = "ctk_kiosk_pair:"
KIOSK_PAIR_TTL_SECONDS = 900  # 15 minutes


def _pairing_code_digest(code: str) -> str:
    return salted_hmac("chemisttasker.kiosk.pairing", code).hexdigest()


PAIRING_RECOVERY_CONTEXT = "chemisttasker:kiosk-pair-recovery:v1"


def _normalize_pairing_code(code: str) -> str:
    return str(code or "").strip().replace(" ", "").replace("-", "")


def _pairing_recovery_message(code: str, client_attempt_id) -> bytes:
    normalized_code = _normalize_pairing_code(code)
    attempt = uuid.UUID(str(client_attempt_id))
    return f"{PAIRING_RECOVERY_CONTEXT}|{attempt}|{normalized_code}".encode("utf-8")


def _verify_pairing_recovery_proof(public_signing_key: str, code: str, client_attempt_id, proof_signature: str) -> None:
    try:
        signature = base64.b64decode(str(proof_signature or ""), validate=True)
        _validate_kiosk_public_key(public_signing_key, required=True)
        key = Ed25519PublicKey.from_public_bytes(base64.b64decode(public_signing_key, validate=True))
        key.verify(signature, _pairing_recovery_message(code, client_attempt_id))
    except (TypeError, ValueError, InvalidSignature) as exc:
        raise ValidationError("Native kiosk pairing proof is invalid.") from exc


def generate_kiosk_pairing_code(
    user,
    pharmacy: Pharmacy,
    device_name: str = "Counter Terminal",
    ttl_seconds: int = KIOSK_PAIR_TTL_SECONDS,
) -> str:
    """Generate a single-use 6-digit numeric pairing code for an authorized pharmacy owner/manager.

    Dispatches push notification to the owner's mobile device and stores pairing metadata in cache.
    """
    if not is_authorized_kiosk_manager(user, pharmacy):
        raise PermissionDenied("Only the pharmacy owner or manager can request a kiosk pairing code.")

    payload = {
        "pharmacy_id": pharmacy.id,
        "pharmacy_name": pharmacy.name,
        "user_id": user.id,
        "device_name": str(device_name).strip() if device_name else "Counter Terminal",
        "created_at": timezone.now().isoformat(),
    }

    expires_at = timezone.now() + timedelta(seconds=ttl_seconds)
    # The database uniqueness constraint is the authoritative collision boundary.
    for _ in range(20):
        code = f"{secrets.randbelow(900000) + 100000}"
        try:
            KioskPairingAuthorization.objects.create(
                pharmacy=pharmacy,
                authorized_by=user,
                code_digest=_pairing_code_digest(code),
                device_name=payload["device_name"],
                allowed_client_kind=KioskPairingAuthorization.ClientKind.NATIVE_OFFLINE,
                expires_at=expires_at,
            )
            break
        except IntegrityError:
            continue
    else:
        raise ValidationError("Unable to reserve a pairing code. Please try again.")
    # Retain the cache entry only as a compatibility hint for older nodes/tests.
    try:
        cache.set(f"{KIOSK_PAIR_CACHE_PREFIX}{code}", payload, timeout=ttl_seconds)
    except Exception:
        # New servers redeem from the durable authorization. Cache is retained
        # only for a controlled mixed-version transition.
        pass

    # Dispatch notification to the user (triggers Expo push + WebSocket + DB in-app notification)
    try:
        from client_profile.notifications import notify_users, Notification
        notify_users(
            user_ids=[user.id],
            title="Kiosk Terminal Pairing Code",
            body=f"Your single-use pairing code for {pharmacy.name} is {code}. Valid for 15 minutes.",
            notification_type=Notification.Type.SECURITY if hasattr(Notification.Type, "SECURITY") else Notification.Type.TASK,
            action_url="/kiosk",
            payload={
                "pairing_code": code,
                "pharmacy_id": pharmacy.id,
                "pharmacy_name": pharmacy.name,
                "expires_in_seconds": ttl_seconds,
                "kiosk_link_route": (
                    f"/kiosk-link?source=kiosk&pharmacy_id={pharmacy.id}"
                    f"&pairing_code={code}"
                ),
            },
        )
    except Exception:
        # Non-critical: code is still generated and valid
        pass

    return code


def redeem_kiosk_pairing_code(
    pairing_code: str,
    device_name: Optional[str] = None,
    *,
    public_signing_key: str = "",
    platform: str = "",
    app_version: str = "",
    client_attempt_id: str = "",
    proof_signature: str = "",
) -> Tuple[KioskDevice, str]:
    """Redeem or recover a single-use pairing authorization.

    Native kiosks prove possession of their Ed25519 private key. If the server
    committed the first redemption but the response was lost, repeating the
    same pairing code + client_attempt_id + proof reissues a fresh device token
    for the *same* KioskDevice instead of creating another installation.
    """
    code = _normalize_pairing_code(pairing_code)
    if len(code) != 6 or not code.isdigit():
        raise ValidationError("Pairing code must be a 6-digit number.")
    # Unknown codes have no subject to lock. This shared budget limits the
    # entire six-digit search space across IPs and web workers.
    _count_security_attempt("kiosk-pair:redeem:minute", limit=300, window=60)
    _count_security_attempt("kiosk-pair:redeem:day", limit=3000, window=86400)

    native = str(platform or "").lower() in {"windows", "macos", "linux"}
    public_signing_key = _validate_kiosk_public_key(public_signing_key, required=native)
    attempt_uuid = None
    if native:
        try:
            attempt_uuid = uuid.UUID(str(client_attempt_id))
        except (TypeError, ValueError, AttributeError) as exc:
            raise ValidationError("A native kiosk pairing attempt identity is required.") from exc
        _verify_pairing_recovery_proof(
            public_signing_key, code, attempt_uuid, proof_signature
        )

    recovered = False
    with transaction.atomic():
        authorization = (
            KioskPairingAuthorization.objects.select_for_update()
            .filter(code_digest=_pairing_code_digest(code))
            .first()
        )
        if authorization is None or authorization.expires_at <= timezone.now():
            raise ValidationError(
                "Invalid or expired pairing code. Please request a new code from the owner's mobile app."
            )

        if authorization.consumed_at is not None:
            if (
                not native
                or authorization.resulting_device_id is None
                or authorization.client_attempt_id is None
                or authorization.client_attempt_id != attempt_uuid
            ):
                raise ValidationError(
                    "Invalid or expired pairing code. Please request a new code from the owner's mobile app."
                )
            device = KioskDevice.objects.select_related("pharmacy").get(
                pk=authorization.resulting_device_id
            )
            if not device.is_active or device.revoked_at:
                raise ValidationError("This kiosk registration has been revoked.")
            if device.public_signing_key != public_signing_key:
                raise ValidationError("Pairing recovery key does not match the registered kiosk.")
            _verify_pairing_recovery_proof(
                device.public_signing_key, code, attempt_uuid, proof_signature
            )
            raw_token = f"{DEVICE_TOKEN_PREFIX}{secrets.token_urlsafe(32)}"
            device.device_token = hash_kiosk_token(raw_token)
            device.last_seen_at = timezone.now()
            device.save(update_fields=["device_token", "last_seen_at"])
            recovered = True
        else:
            if native and authorization.allowed_client_kind != KioskPairingAuthorization.ClientKind.NATIVE_OFFLINE:
                raise ValidationError("This pairing authorization does not allow an offline native kiosk.")
            if native:
                if authorization.client_attempt_id and authorization.client_attempt_id != attempt_uuid:
                    raise ValidationError("Pairing authorization is already bound to another native attempt.")
                authorization.client_attempt_id = attempt_uuid

            resolved_device_name = (
                str(device_name).strip()
                if device_name and str(device_name).strip()
                else authorization.device_name
            )
            pharmacy = authorization.pharmacy
            user = authorization.authorized_by
            device, raw_token = activate_kiosk_device(
                user=user,
                pharmacy=pharmacy,
                device_name=resolved_device_name,
                public_signing_key=public_signing_key,
                platform=platform,
                app_version=app_version,
                client_kind=("NATIVE_OFFLINE" if native else "WEB_ONLINE"),
            )
            authorization.consumed_at = timezone.now()
            authorization.resulting_device = device
            update_fields = ["consumed_at", "resulting_device"]
            if native:
                update_fields.append("client_attempt_id")
            authorization.save(update_fields=update_fields)

    try:
        cache.delete(f"{KIOSK_PAIR_CACHE_PREFIX}{code}")
    except Exception:
        pass

    if not recovered:
        try:
            from client_profile.notifications import notify_users, Notification
            notify_users(
                user_ids=[authorization.authorized_by_id],
                title="Kiosk Device Paired",
                body=f"Kiosk '{device.device_name}' has been successfully activated for {device.pharmacy.name}.",
                notification_type=Notification.Type.SECURITY if hasattr(Notification.Type, "SECURITY") else Notification.Type.TASK,
                payload={
                    "device_id": device.id,
                    "device_name": device.device_name,
                    "pharmacy_id": device.pharmacy_id,
                },
            )
        except Exception:
            pass

    return device, raw_token


# -----------------------------------------------------------------------------
# 2. Signed Rotating Pharmacy QR
# -----------------------------------------------------------------------------

def generate_signed_pharmacy_qr(
    kiosk_device: KioskDevice,
    ttl_seconds: int = 30,
) -> dict:
    """
    Generate or reuse an active rotating QR code and return an HMAC-signed payload.
    Multiple workers can use the same active pharmacy QR concurrently.
    """
    if not kiosk_device.is_active:
        raise ValidationError("Cannot generate QR code: Kiosk device is inactive or revoked.")

    now = timezone.now()

    # Reuse existing active session if it still has at least 2 seconds remaining
    active_session = (
        PharmacyQRSession.objects.filter(
            pharmacy=kiosk_device.pharmacy,
            expires_at__gt=now + timedelta(seconds=2),
        )
        .order_by("-expires_at")
        .first()
    )

    if active_session is None:
        expires_at = now + timedelta(seconds=ttl_seconds)
        active_session = PharmacyQRSession.objects.create(
            pharmacy=kiosk_device.pharmacy,
            code=secrets.token_hex(16),
            expires_at=expires_at,
        )

    payload = {
        "pharmacy_id": kiosk_device.pharmacy_id,
        "code": active_session.code,
        "expires_at": active_session.expires_at.isoformat(),
    }

    signed_token = signing.dumps(payload, salt=QR_SALT)

    return {
        "signed_token": signed_token,
        "code": active_session.code,
        "expires_at": active_session.expires_at,
        "pharmacy_id": kiosk_device.pharmacy_id,
    }


def verify_signed_pharmacy_qr(
    signed_token: str,
    expected_pharmacy_id: Optional[int] = None,
) -> Tuple[bool, Optional[PharmacyQRSession], Optional[str]]:
    """
    Verify an HMAC-signed QR token for tampering, expiration, and pharmacy context.
    Returns (is_valid, qr_session, rejection_reason).
    """
    if not signed_token or not isinstance(signed_token, str):
        return False, None, "MISSING_QR_TOKEN"

    try:
        payload = signing.loads(signed_token, salt=QR_SALT)
    except (signing.BadSignature, Exception):
        return False, None, "TAMPERED_OR_INVALID_SIGNATURE"

    pharmacy_id = payload.get("pharmacy_id")
    code = payload.get("code")

    if expected_pharmacy_id is not None and pharmacy_id != expected_pharmacy_id:
        return False, None, "PHARMACY_CONTEXT_MISMATCH"

    qr_session = (
        PharmacyQRSession.objects.select_related("pharmacy")
        .filter(pharmacy_id=pharmacy_id, code=code)
        .first()
    )

    if qr_session is None:
        return False, None, "QR_SESSION_NOT_FOUND"

    if qr_session.is_expired:
        return False, qr_session, "QR_EXPIRED"

    return True, qr_session, None


# -----------------------------------------------------------------------------
# 3. Worker Personal Code (PIN) Lifecycle & Verification
# -----------------------------------------------------------------------------

def set_worker_personal_code(
    user,
    membership: Membership,
    raw_pin: str,
) -> WorkerPIN:
    """Set or reset a worker's hashed PIN; requires pharmacy owner or manager authority."""
    if not is_authorized_kiosk_manager(user, membership.pharmacy):
        raise PermissionDenied("Only the pharmacy owner or manager can set a worker's personal code.")

    worker_pin, _ = WorkerPIN.objects.get_or_create(membership=membership)
    worker_pin.set_pin(raw_pin)
    worker_pin.save()
    return worker_pin


def toggle_worker_personal_code(
    user,
    membership: Membership,
    is_enabled: bool,
) -> WorkerPIN:
    """Enable or disable the PIN requirement for a worker."""
    if not is_authorized_kiosk_manager(user, membership.pharmacy):
        raise PermissionDenied("Only the pharmacy owner or manager can toggle personal codes.")

    worker_pin, _ = WorkerPIN.objects.get_or_create(membership=membership)
    worker_pin.is_enabled = is_enabled
    worker_pin.save(update_fields=["is_enabled", "updated_at"])
    return worker_pin


def _find_kiosk_candidate_membership(
    kiosk_device: KioskDevice,
    user_identifier: str,
    require_pin: bool = True,
) -> Optional[Membership]:
    """
    Resolve eligible membership by email or user ID within kiosk pharmacy context
    (local staff or cross-site staff under same owner/chain/org) without requiring prefixes.
    When require_pin=False, workers without a WorkerPIN row are also resolved.
    """
    ident = str(user_identifier).strip()
    user_filter = Q(user__email__iexact=ident) | Q(user__username__iexact=ident)
    if ident.isdigit():
        user_filter |= Q(user__id=int(ident))

    target_pharmacy = kiosk_device.pharmacy

    local_kwargs = {"pharmacy": target_pharmacy, "is_active": True}
    if require_pin:
        local_kwargs["worker_pin__isnull"] = False

    # 1. Local membership
    local_mem = (
        Membership.objects.filter(
            user_filter,
            **local_kwargs,
        )
        .select_related("worker_pin", "user", "pharmacy")
        .first()
    )
    if local_mem is not None:
        return local_mem

    remote_kwargs = {"is_active": True}
    if require_pin:
        remote_kwargs["worker_pin__isnull"] = False

    # 2. Cross-site membership under same owner, active Chain, or organization
    remote_memberships = (
        Membership.objects.filter(
            user_filter,
            **remote_kwargs,
        )
        .exclude(pharmacy=target_pharmacy)
        .select_related("worker_pin", "user", "pharmacy")
    )

    for mem in remote_memberships:
        remote_p = mem.pharmacy
        if not remote_p:
            continue

        # Same non-null owner
        if (
            target_pharmacy.owner_id is not None
            and remote_p.owner_id is not None
            and target_pharmacy.owner_id == remote_p.owner_id
        ):
            return mem

        # Shared active chain
        if (
            Chain.objects.filter(is_active=True, pharmacies=target_pharmacy)
            .filter(pharmacies=remote_p)
            .exists()
        ):
            return mem

        # Same non-null organization
        if (
            target_pharmacy.organization_id is not None
            and remote_p.organization_id is not None
            and target_pharmacy.organization_id == remote_p.organization_id
        ):
            return mem

    return None


def verify_kiosk_worker_pin(
    kiosk_device: KioskDevice,
    user_identifier: str,
    raw_pin: str,
) -> Tuple[bool, Optional[Membership], Optional[str]]:
    """
    Kiosk-only PIN verification with atomic row locks, rate limits, and lockout.
    Enforces that attempts during an active lockout do not extend the lockout window.
    Returns (is_valid, membership, rejection_reason).
    """
    if not kiosk_device or not kiosk_device.is_active:
        return False, None, "KIOSK_DEVICE_INACTIVE"

    membership = _find_kiosk_candidate_membership(kiosk_device, user_identifier)
    if membership is None:
        return False, None, "WORKER_NOT_FOUND_OR_NO_PIN"

    # Serialized verification against the stored row using row locks
    with transaction.atomic():
        try:
            worker_pin = (
                WorkerPIN.objects.select_for_update()
                .select_related("membership", "membership__user")
                .get(pk=membership.worker_pin.pk)
            )
        except WorkerPIN.DoesNotExist:
            return False, None, "WORKER_PIN_NOT_FOUND"

        if not worker_pin.is_enabled:
            return False, membership, "PIN_DISABLED"

        now = timezone.now()

        # Check existing lockout
        if worker_pin.locked_until is not None:
            if now < worker_pin.locked_until:
                # Lockout is still active. Attempts during lockout do NOT extend it.
                return False, membership, "PIN_LOCKED"
            else:
                # Lockout has expired: start a fresh window
                worker_pin.failed_attempts = 0
                worker_pin.locked_until = None
                worker_pin.save(update_fields=["failed_attempts", "locked_until", "updated_at"])

        # Check PIN credential
        is_valid = worker_pin.check_pin(raw_pin)

        if is_valid:
            # Correct PIN resets failed attempts
            worker_pin.failed_attempts = 0
            worker_pin.locked_until = None
            worker_pin.save(update_fields=["failed_attempts", "locked_until", "updated_at"])
            return True, membership, None
        else:
            # Failed attempt
            worker_pin.failed_attempts += 1
            if worker_pin.failed_attempts >= worker_pin.MAX_FAILED_ATTEMPTS:
                worker_pin.locked_until = now + worker_pin.LOCKOUT_DURATION
                rejection_reason = "PIN_LOCKED"
            else:
                rejection_reason = "INVALID_PIN"

            worker_pin.save(update_fields=["failed_attempts", "locked_until", "updated_at"])
            return False, membership, rejection_reason


# -----------------------------------------------------------------------------
# 4. First-Time Kiosk PIN Setup via Email & Worker Self-Service Updates
# -----------------------------------------------------------------------------

WORKER_PIN_OTP_CACHE_PREFIX = "ctk_worker_pin_otp:"
WORKER_PIN_OTP_TTL = 600  # 10 minutes


def mask_email(email: str) -> str:
    """Mask email address for privacy on shared kiosks, e.g. s***r@domain.com."""
    if not email or "@" not in email:
        return "***"
    local_part, domain = email.split("@", 1)
    if len(local_part) <= 2:
        masked_local = local_part[0] + "*"
    else:
        masked_local = local_part[0] + "*" * (len(local_part) - 2) + local_part[-1]
    return f"{masked_local}@{domain}"


def send_worker_pin_setup_code(
    kiosk_device: KioskDevice,
    user_identifier: str,
    force_new: bool = False,
) -> dict:
    """Resolve an active worker without a PIN and dispatch a 6-digit verification code to their email."""
    if not kiosk_device or not kiosk_device.is_active:
        raise ValidationError("Kiosk device is inactive or revoked.")

    membership = _find_kiosk_candidate_membership(kiosk_device, user_identifier, require_pin=False)
    if membership is None:
        raise ValidationError("No active staff record found matching this email or ID.")

    worker = membership.user
    if not worker or not worker.email:
        raise ValidationError("Worker has no valid email address registered.")

    cache_key = f"{WORKER_PIN_OTP_CACHE_PREFIX}{worker.id}"
    lock_key = f"{cache_key}:locked"
    if security_cache.get(lock_key):
        raise ValidationError("Too many verification attempts. Please retry later.")
    cached_data = security_cache.get(cache_key)

    # If code was already sent in last 10 mins and caller did not explicitly request a fresh code
    if not force_new and cached_data and isinstance(cached_data, dict) and cached_data.get("otp"):
        return {
            "worker_id": worker.id,
            "worker_name": worker.get_full_name() or worker.username,
            "masked_email": mask_email(worker.email),
            "code_already_sent": True,
            "created_at": cached_data.get("created_at"),
        }

    # Generate 6-digit OTP
    otp_code = f"{secrets.randbelow(900000) + 100000}"

    _count_security_attempt(f"{cache_key}:send", limit=5, window=WORKER_PIN_OTP_TTL)
    security_cache.set(cache_key, {
        "otp": otp_code,
        "worker_id": worker.id,
        "membership_id": membership.id,
        "pharmacy_id": kiosk_device.pharmacy_id,
        "created_at": timezone.now().isoformat(),
    }, timeout=WORKER_PIN_OTP_TTL)

    # Email delivery is part of this security workflow. Do not claim that a
    # verification code was sent if the mail provider rejected it.
    try:
        from users.tasks import send_async_email
        pharmacy_name = kiosk_device.pharmacy.name
        first_name = worker.first_name or worker.username
        subject = f"ChemistTasker Kiosk - Your Attendance PIN Verification Code ({pharmacy_name})"
        message = (
            f"Hello {first_name},\n\n"
            f"You requested to set up your Kiosk attendance PIN at {pharmacy_name}.\n\n"
            f"Your 6-digit verification code is: {otp_code}\n\n"
            f"This code will expire in 10 minutes.\n\n"
            f"If you did not request this, please notify your pharmacy manager immediately.\n\n"
            f"Best regards,\n"
            f"ChemistTasker Team"
        )
        delivery_result = send_async_email(
            subject=subject,
            message=message,
            recipient_list=[worker.email],
        )
        if not delivery_result:
            raise RuntimeError("mail backend did not accept the verification email")
    except Exception as exc:
        security_cache.delete(cache_key)
        raise ValidationError(
            "Verification email could not be sent. Please retry; no active setup code was created."
        ) from exc

    # Send in-app notification / push as well
    try:
        from client_profile.notifications import notify_users, Notification
        notify_users(
            user_ids=[worker.id],
            title="Kiosk PIN Setup Code",
            body=f"Your verification code to set your counter PIN is {otp_code}.",
            notification_type=Notification.Type.SECURITY if hasattr(Notification.Type, "SECURITY") else Notification.Type.TASK,
            payload={"otp": otp_code, "pharmacy_id": kiosk_device.pharmacy_id},
        )
    except Exception:
        pass

    return {
        "worker_id": worker.id,
        "worker_name": worker.get_full_name() or worker.username,
        "masked_email": mask_email(worker.email),
        "code_already_sent": False,
        "delivery_channel": "EMAIL",
        "email_delivery": "SENT",
    }


def setup_worker_kiosk_pin(
    kiosk_device: KioskDevice,
    user_identifier: str,
    verification_code: str,
    new_pin: str,
) -> Tuple[Membership, WorkerPIN]:
    """Verify email OTP and set the worker's PIN from the kiosk."""
    if not kiosk_device or not kiosk_device.is_active:
        raise ValidationError("Kiosk device is inactive or revoked.")

    membership = _find_kiosk_candidate_membership(kiosk_device, user_identifier, require_pin=False)
    if membership is None:
        raise ValidationError("No active staff record found matching this email or ID.")

    worker = membership.user
    cache_key = f"{WORKER_PIN_OTP_CACHE_PREFIX}{worker.id}"
    lock_key = f"{cache_key}:locked"
    if security_cache.get(lock_key):
        raise ValidationError("Too many verification attempts. Please retry later.")
    cached_data = security_cache.get(cache_key)

    if not cached_data or not isinstance(cached_data, dict):
        raise ValidationError("Verification code expired or not requested. Please request a new code.")
    if (
        cached_data.get("membership_id") != membership.id
        or cached_data.get("pharmacy_id") != kiosk_device.pharmacy_id
    ):
        raise ValidationError("Verification code was requested for another pharmacy. Please request a new code.")

    cleaned_code = str(verification_code).strip().replace(" ", "").replace("-", "")
    if cleaned_code != str(cached_data.get("otp")):
        try:
            security_cache.add(f"{cache_key}:fail", 0, timeout=WORKER_PIN_OTP_TTL)
            failures = security_cache.incr(f"{cache_key}:fail")
        except Exception as exc:
            raise ValidationError("Verification is temporarily unavailable. Please retry shortly.") from exc
        if failures >= 5:
            security_cache.set(lock_key, True, timeout=WORKER_PIN_OTP_TTL)
            security_cache.delete(cache_key)
            raise ValidationError("Too many verification attempts. Please retry later.")
        raise ValidationError("Invalid verification code. Please check your email and try again.")

    cleaned_pin = str(new_pin).strip()
    if not (4 <= len(cleaned_pin) <= 6) or not cleaned_pin.isdigit():
        raise ValidationError("PIN must be 4 to 6 numeric digits.")

    # Code is valid, consume it immediately
    security_cache.delete(cache_key)
    security_cache.delete(f"{cache_key}:fail")

    # Save or update WorkerPIN
    worker_pin, _ = WorkerPIN.objects.get_or_create(membership=membership)
    worker_pin.set_pin(cleaned_pin)
    worker_pin.is_enabled = True
    worker_pin.failed_attempts = 0
    worker_pin.locked_until = None
    worker_pin.save()

    # Send confirmation email
    try:
        from users.tasks import send_async_email
        pharmacy_name = kiosk_device.pharmacy.name
        send_async_email(
            subject=f"ChemistTasker - Attendance PIN Created",
            message=(
                f"Hello {worker.first_name or worker.username},\n\n"
                f"Your attendance PIN has been successfully set on the counter kiosk at {pharmacy_name}.\n\n"
                f"You can change this PIN at any time from your ChemistTasker web or mobile app dashboard.\n\n"
                f"Thank you,\nChemistTasker Team"
            ),
            recipient_list=[worker.email],
        )
    except Exception:
        pass

    return membership, worker_pin


def worker_update_own_pin(user, new_pin: str, pharmacy_id=None) -> WorkerPIN:
    """Self-service PIN update for authenticated worker from web or mobile dashboard."""
    if not user or not user.is_authenticated:
        raise PermissionDenied("Authentication required.")

    cleaned_pin = str(new_pin).strip()
    if not (4 <= len(cleaned_pin) <= 6) or not cleaned_pin.isdigit():
        raise ValidationError("PIN must be 4 to 6 numeric digits.")

    memberships = Membership.objects.filter(
        user=user, is_active=True, status=Membership.Status.ACCEPTED,
    )
    if pharmacy_id is not None:
        memberships = memberships.filter(pharmacy_id=pharmacy_id)
    elif memberships.count() > 1:
        raise ValidationError("Select the pharmacy whose attendance PIN you want to update.")
    membership = memberships.first()
    if not membership:
        raise ValidationError("You do not have an active pharmacy membership.")

    worker_pin, _ = WorkerPIN.objects.get_or_create(membership=membership)
    worker_pin.set_pin(cleaned_pin)
    worker_pin.is_enabled = True
    worker_pin.failed_attempts = 0
    worker_pin.locked_until = None
    worker_pin.save()

    return worker_pin
