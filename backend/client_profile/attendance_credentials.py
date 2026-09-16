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
from typing import Optional, Tuple

from django.conf import settings
from django.core import signing
from django.core.cache import cache
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import DatabaseError, transaction
from django.db.models import Q
from django.utils import timezone
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey

from client_profile.models import (
    Chain,
    KioskDevice,
    Membership,
    Pharmacy,
    PharmacyAdmin,
    PharmacyQRSession,
    WorkerPIN,
)


QR_SALT = "chemisttasker_attendance_kiosk_qr"
DEVICE_TOKEN_PREFIX = "ctk_kiosk_"


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
        device_token=token_hash,
        is_active=True,
        activated_by=user,
    )

    return device, raw_token


def revoke_kiosk_device(user, kiosk_device: KioskDevice) -> KioskDevice:
    """Revoke an active kiosk device, immediately disabling its ability to generate QR or check PINs."""
    if not is_authorized_kiosk_manager(user, kiosk_device.pharmacy):
        raise PermissionDenied("Only the pharmacy owner or manager can revoke a kiosk device.")

    kiosk_device.is_active = False
    kiosk_device.revoked_at = timezone.now()
    kiosk_device.save(update_fields=["is_active", "revoked_at"])
    return kiosk_device


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

    # Reserve a collision-free code instead of overwriting another live authorization.
    for _ in range(20):
        code = f"{secrets.randbelow(900000) + 100000}"
        if cache.add(
            f"{KIOSK_PAIR_CACHE_PREFIX}{code}",
            payload,
            timeout=ttl_seconds,
        ):
            break
    else:
        raise ValidationError("Unable to reserve a pairing code. Please try again.")

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
) -> Tuple[KioskDevice, str]:
    """Redeem a single-use 6-digit pairing code from a physical kiosk terminal.

    Atomically retrieves and deletes the cache key, validates the pharmacy,
    and activates the kiosk device.
    """
    if not pairing_code or not str(pairing_code).strip():
        raise ValidationError("A pairing code is required.")

    code = str(pairing_code).strip().replace(" ", "").replace("-", "")
    if len(code) != 6 or not code.isdigit():
        raise ValidationError("Pairing code must be a 6-digit number.")

    public_signing_key = _validate_kiosk_public_key(public_signing_key, required=True)

    cache_key = f"{KIOSK_PAIR_CACHE_PREFIX}{code}"
    payload = cache.get(cache_key)

    if not payload or not isinstance(payload, dict):
        raise ValidationError("Invalid or expired pairing code. Please request a new code from the owner's mobile app.")

    # Immediately delete the code to ensure single-use (replay prevention)
    cache.delete(cache_key)

    pharmacy_id = payload.get("pharmacy_id")
    user_id = payload.get("user_id")
    default_device_name = payload.get("device_name") or "Counter Terminal"
    resolved_device_name = str(device_name).strip() if device_name and str(device_name).strip() else default_device_name

    pharmacy = Pharmacy.objects.filter(id=pharmacy_id).first()
    if not pharmacy:
        raise ValidationError("Pharmacy associated with this pairing code no longer exists.")

    from django.contrib.auth import get_user_model
    User = get_user_model()
    user = User.objects.filter(id=user_id).first()
    if not user:
        raise ValidationError("User who authorized this pairing code no longer exists.")

    device, raw_token = activate_kiosk_device(
        user=user,
        pharmacy=pharmacy,
        device_name=resolved_device_name,
        public_signing_key=public_signing_key,
        platform=platform,
        app_version=app_version,
    )

    # Notify owner that device has been successfully paired
    try:
        from client_profile.notifications import notify_users, Notification
        notify_users(
            user_ids=[user.id],
            title="Kiosk Device Paired",
            body=f"Kiosk '{device.device_name}' has been successfully activated for {pharmacy.name}.",
            notification_type=Notification.Type.SECURITY if hasattr(Notification.Type, "SECURITY") else Notification.Type.TASK,
            payload={
                "device_id": device.id,
                "device_name": device.device_name,
                "pharmacy_id": pharmacy.id,
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
    cached_data = cache.get(cache_key)

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

    cache.set(cache_key, {
        "otp": otp_code,
        "worker_id": worker.id,
        "membership_id": membership.id,
        "pharmacy_id": kiosk_device.pharmacy_id,
        "created_at": timezone.now().isoformat(),
    }, timeout=WORKER_PIN_OTP_TTL)

    # Send Email via users.tasks.send_async_email
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
        send_async_email(
            subject=subject,
            message=message,
            recipient_list=[worker.email],
        )
    except Exception:
        pass

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
    cached_data = cache.get(cache_key)

    if not cached_data or not isinstance(cached_data, dict):
        raise ValidationError("Verification code expired or not requested. Please request a new code.")

    cleaned_code = str(verification_code).strip().replace(" ", "").replace("-", "")
    if cleaned_code != str(cached_data.get("otp")):
        raise ValidationError("Invalid verification code. Please check your email and try again.")

    cleaned_pin = str(new_pin).strip()
    if not (4 <= len(cleaned_pin) <= 6) or not cleaned_pin.isdigit():
        raise ValidationError("PIN must be 4 to 6 numeric digits.")

    # Code is valid, consume it immediately
    cache.delete(cache_key)

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


def worker_update_own_pin(user, new_pin: str) -> WorkerPIN:
    """Self-service PIN update for authenticated worker from web or mobile dashboard."""
    if not user or not user.is_authenticated:
        raise PermissionDenied("Authentication required.")

    cleaned_pin = str(new_pin).strip()
    if not (4 <= len(cleaned_pin) <= 6) or not cleaned_pin.isdigit():
        raise ValidationError("PIN must be 4 to 6 numeric digits.")

    membership = (
        Membership.objects.filter(user=user, is_active=True)
        .order_by("-id")
        .first()
    )
    if not membership:
        raise ValidationError("You do not have an active pharmacy membership.")

    worker_pin, _ = WorkerPIN.objects.get_or_create(membership=membership)
    worker_pin.set_pin(cleaned_pin)
    worker_pin.is_enabled = True
    worker_pin.failed_attempts = 0
    worker_pin.locked_until = None
    worker_pin.save()

    return worker_pin
