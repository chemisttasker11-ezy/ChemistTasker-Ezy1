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
import secrets
from typing import Optional, Tuple

from django.conf import settings
from django.core import signing
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import Q
from django.utils import timezone

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
    return PharmacyAdmin.objects.filter(
        user=user,
        pharmacy=pharmacy,
        is_active=True,
        admin_level__in=[PharmacyAdmin.AdminLevel.OWNER, PharmacyAdmin.AdminLevel.MANAGER],
    ).exists()


# -----------------------------------------------------------------------------
# 1. Kiosk Device Management
# -----------------------------------------------------------------------------

def activate_kiosk_device(
    user,
    pharmacy: Pharmacy,
    device_name: str,
) -> Tuple[KioskDevice, str]:
    """Activate a new kiosk device for a pharmacy, issuing a restricted device token."""
    if not is_authorized_kiosk_manager(user, pharmacy):
        raise PermissionDenied("Only the pharmacy owner or manager can activate a kiosk device.")

    if not device_name or not str(device_name).strip():
        raise ValidationError("A non-empty device name is required.")

    raw_token = f"{DEVICE_TOKEN_PREFIX}{secrets.token_urlsafe(32)}"

    device = KioskDevice.objects.create(
        pharmacy=pharmacy,
        device_name=str(device_name).strip(),
        device_token=raw_token,
        is_active=True,
        activated_by=user,
    )

    return device, raw_token


def revoke_kiosk_device(user, kiosk_device: KioskDevice) -> KioskDevice:
    """Revoke an active kiosk device, immediately disabling its ability to generate QR or check PINs."""
    if not is_authorized_kiosk_manager(user, kiosk_device.pharmacy):
        raise PermissionDenied("Only the pharmacy owner or manager can revoke a kiosk device.")

    kiosk_device.is_active = False
    kiosk_device.save(update_fields=["is_active"])
    return kiosk_device


def authenticate_kiosk_device(device_token: str) -> Optional[KioskDevice]:
    """Resolve an active kiosk device from its scoped device token."""
    if not device_token or not isinstance(device_token, str):
        return None

    return (
        KioskDevice.objects.select_related("pharmacy")
        .filter(device_token=device_token, is_active=True)
        .first()
    )


# -----------------------------------------------------------------------------
# 2. Signed Rotating Pharmacy QR
# -----------------------------------------------------------------------------

def generate_signed_pharmacy_qr(
    kiosk_device: KioskDevice,
    ttl_seconds: int = 60,
) -> dict:
    """
    Generate or reuse an active rotating QR code and return an HMAC-signed payload.
    Multiple workers can use the same active pharmacy QR concurrently.
    """
    if not kiosk_device.is_active:
        raise ValidationError("Cannot generate QR code: Kiosk device is inactive or revoked.")

    now = timezone.now()

    # Reuse existing active session if it still has at least 15 seconds remaining
    active_session = (
        PharmacyQRSession.objects.filter(
            pharmacy=kiosk_device.pharmacy,
            expires_at__gt=now + timedelta(seconds=15),
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
) -> Optional[Membership]:
    """
    Resolve eligible membership by email or user ID within kiosk pharmacy context
    (local staff or cross-site staff under same owner/chain/org) without requiring prefixes.
    """
    ident = str(user_identifier).strip()
    user_filter = Q(user__email__iexact=ident) | Q(user__username__iexact=ident)
    if ident.isdigit():
        user_filter |= Q(user__id=int(ident))

    target_pharmacy = kiosk_device.pharmacy

    # 1. Local membership with PIN
    local_mem = (
        Membership.objects.filter(
            user_filter,
            pharmacy=target_pharmacy,
            is_active=True,
            worker_pin__isnull=False,
        )
        .select_related("worker_pin", "user", "pharmacy")
        .first()
    )
    if local_mem is not None:
        return local_mem

    # 2. Cross-site membership under same owner, active Chain, or organization
    remote_memberships = (
        Membership.objects.filter(
            user_filter,
            is_active=True,
            worker_pin__isnull=False,
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
