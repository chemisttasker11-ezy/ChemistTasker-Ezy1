"""Versioned canonical protocol for signed, offline kiosk attendance events."""

import base64
import hashlib
import json
import uuid
from datetime import timedelta

from cryptography.exceptions import InvalidSignature
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from .attendance_transitions import clock_in, clock_out, end_break, start_break
from .models import AttendanceEvent, KioskAttendanceEvent, KioskDevice


PROTOCOL_VERSION = 1
SIGNED_EVENT_FIELDS = (
    "protocol_version",
    "event_id",
    "device_id",
    "device_seq",
    "employee_id",
    "shift_id",
    "event_type",
    "device_timestamp",
    "trusted_time_estimate",
    "monotonic_elapsed_ms",
    "boot_session_id",
    "previous_event_hash",
)


def canonical_event_payload(event):
    """Return the exact object hashed and signed by every kiosk client."""
    return {field: event.get(field) for field in SIGNED_EVENT_FIELDS}


def canonical_json_bytes(payload):
    return json.dumps(
        payload,
        ensure_ascii=False,
        allow_nan=False,
        separators=(",", ":"),
        sort_keys=True,
    ).encode("utf-8")


def calculate_event_hash(payload):
    return hashlib.sha256(canonical_json_bytes(payload)).hexdigest()


def _decode_public_key(encoded_key):
    try:
        key_bytes = base64.b64decode(encoded_key, validate=True)
        if len(key_bytes) != 32:
            raise ValueError
        return Ed25519PublicKey.from_public_bytes(key_bytes)
    except (TypeError, ValueError) as exc:
        raise ValidationError("Kiosk signing public key is invalid.") from exc


def _verify_signature(device, event_hash, encoded_signature):
    if not device.public_signing_key:
        raise ValidationError("Kiosk has no registered signing key.")
    try:
        signature = base64.b64decode(encoded_signature, validate=True)
        _decode_public_key(device.public_signing_key).verify(
            signature,
            event_hash.encode("ascii"),
        )
    except (TypeError, ValueError, InvalidSignature) as exc:
        raise ValidationError("Event signature is invalid.") from exc


def _parse_aware_datetime(value, field_name, *, required=True):
    if value in (None, "") and not required:
        return None
    parsed = parse_datetime(str(value)) if value else None
    if parsed is None or timezone.is_naive(parsed):
        raise ValidationError(f"{field_name} must be an ISO-8601 timestamp with an offset.")
    return parsed


def _integrity_flags(device, sequence, event_hash, previous_hash, device_time, trusted_time, monotonic_ms, boot_id):
    flags = []
    previous = KioskAttendanceEvent.objects.filter(
        device=device,
        device_sequence=sequence - 1,
    ).first()

    if sequence > 1 and previous is None:
        flags.append("SEQUENCE_GAP")
    elif previous and previous.event_hash != previous_hash:
        flags.append("HASH_CHAIN_MISMATCH")
    elif sequence == 1 and previous_hash:
        flags.append("UNEXPECTED_INITIAL_HASH")

    if previous:
        if device_time < previous.device_timestamp:
            flags.append("CLOCK_MOVED_BACKWARDS")
        if previous.boot_session_id == boot_id and monotonic_ms <= previous.monotonic_elapsed_ms:
            flags.append("MONOTONIC_ROLLBACK")

    if trusted_time is None:
        flags.append("MISSING_TRUSTED_TIME")
    elif abs(device_time - trusted_time) > timedelta(minutes=5):
        flags.append("CLOCK_ANCHOR_DRIFT")

    if abs(timezone.now() - device_time) > timedelta(days=7):
        flags.append("SERVER_TIME_DRIFT")

    return flags


def _apply_business_event(device, employee, event_type, occurred_at, shift_id):
    if event_type == AttendanceEvent.EventType.CLOCK_IN:
        _, event = clock_in(
            employee,
            device.pharmacy,
            kiosk_device=device,
            verified_kiosk_event=True,
            occurred_at=occurred_at,
            assignment_id=shift_id,
        )
        return event
    if event_type == AttendanceEvent.EventType.CLOCK_OUT:
        _, event = clock_out(
            employee,
            kiosk_device=device,
            verified_kiosk_event=True,
            occurred_at=occurred_at,
        )
        return event
    if event_type == AttendanceEvent.EventType.BREAK_START:
        return start_break(
            employee,
            source=AttendanceEvent.Source.OFFLINE_KIOSK,
            device=device,
            occurred_at=occurred_at,
        )
    if event_type == AttendanceEvent.EventType.BREAK_END:
        return end_break(
            employee,
            source=AttendanceEvent.Source.OFFLINE_KIOSK,
            device=device,
            occurred_at=occurred_at,
        )
    raise ValidationError("Unsupported attendance event type.")


def _advance_contiguous_ack(device):
    next_sequence = device.last_contiguous_sequence + 1
    previous_hash = device.last_event_hash
    while True:
        event = KioskAttendanceEvent.objects.filter(
            device=device,
            device_sequence=next_sequence,
        ).first()
        if event is None or event.previous_event_hash != previous_hash:
            break
        previous_hash = event.event_hash
        device.last_contiguous_sequence = next_sequence
        next_sequence += 1
    device.last_event_hash = previous_hash


def ingest_offline_event(device, raw_event):
    """Verify, retain and apply one device event. Safe to call repeatedly."""
    if not isinstance(raw_event, dict):
        raise ValidationError("Each event must be an object.")
    payload = canonical_event_payload(raw_event)
    try:
        event_uuid = uuid.UUID(str(payload["event_id"]))
        sequence = int(payload["device_seq"])
        employee_id = int(payload["employee_id"])
        monotonic_ms = int(payload["monotonic_elapsed_ms"])
    except (TypeError, ValueError, KeyError) as exc:
        raise ValidationError("Event identifiers and sequence values are invalid.") from exc

    if payload["protocol_version"] != PROTOCOL_VERSION or sequence < 1 or monotonic_ms < 0:
        raise ValidationError("Unsupported protocol version or invalid device sequence.")
    if str(payload["device_id"]).lower() != str(device.installation_id).lower():
        raise ValidationError("Event was signed for a different kiosk device.")

    existing = KioskAttendanceEvent.objects.filter(event_id=event_uuid).first()
    if existing:
        if existing.device_id != device.id:
            raise ValidationError("Event identifier is already owned by another kiosk.")
        return existing, "already_received"

    sequence_event = KioskAttendanceEvent.objects.filter(device=device, device_sequence=sequence).first()
    if sequence_event:
        raise ValidationError("Device sequence is already occupied by another event.")

    event_hash = calculate_event_hash(payload)
    if raw_event.get("event_hash") != event_hash:
        raise ValidationError("Event hash does not match its canonical payload.")
    _verify_signature(device, event_hash, raw_event.get("signature", ""))

    device_time = _parse_aware_datetime(payload["device_timestamp"], "device_timestamp")
    trusted_time = _parse_aware_datetime(
        payload["trusted_time_estimate"],
        "trusted_time_estimate",
        required=False,
    )
    event_type = payload["event_type"]
    if event_type not in AttendanceEvent.EventType.values:
        raise ValidationError("Unsupported attendance event type.")

    User = get_user_model()
    employee = User.objects.filter(pk=employee_id, is_active=True).first()
    if employee is None:
        raise ValidationError("Employee does not exist or is inactive.")

    flags = _integrity_flags(
        device,
        sequence,
        event_hash,
        str(payload["previous_event_hash"] or ""),
        device_time,
        trusted_time,
        monotonic_ms,
        str(payload["boot_session_id"] or ""),
    )
    attendance_event = None
    rejection_reason = ""
    processing_status = (
        KioskAttendanceEvent.ProcessingStatus.NEEDS_REVIEW
        if flags
        else KioskAttendanceEvent.ProcessingStatus.ACCEPTED
    )

    blocking_flags = {"SEQUENCE_GAP", "HASH_CHAIN_MISMATCH", "UNEXPECTED_INITIAL_HASH"}
    if not blocking_flags.intersection(flags):
        try:
            with transaction.atomic():
                attendance_event = _apply_business_event(
                    device,
                    employee,
                    event_type,
                    device_time,
                    payload["shift_id"],
                )
        except (ValidationError, IntegrityError) as exc:
            processing_status = KioskAttendanceEvent.ProcessingStatus.REJECTED
            rejection_reason = "; ".join(getattr(exc, "messages", [])) or str(exc)

    stored = KioskAttendanceEvent.objects.create(
        event_id=event_uuid,
        device=device,
        device_sequence=sequence,
        employee=employee,
        shift_id=payload["shift_id"],
        event_type=event_type,
        device_timestamp=device_time,
        trusted_time_estimate=trusted_time,
        monotonic_elapsed_ms=monotonic_ms,
        boot_session_id=str(payload["boot_session_id"] or ""),
        previous_event_hash=str(payload["previous_event_hash"] or ""),
        event_hash=event_hash,
        device_signature=raw_event["signature"],
        canonical_payload=payload,
        integrity_flags=flags,
        processing_status=processing_status,
        rejection_reason=rejection_reason,
        attendance_event=attendance_event,
    )
    return stored, (
        "accepted"
        if processing_status == KioskAttendanceEvent.ProcessingStatus.ACCEPTED
        else "needs_review"
        if processing_status == KioskAttendanceEvent.ProcessingStatus.NEEDS_REVIEW
        else "rejected"
    )


@transaction.atomic
def sync_offline_batch(device, events, *, app_version=""):
    if not isinstance(events, list) or not events:
        raise ValidationError("events must be a non-empty list.")
    if len(events) > 100:
        raise ValidationError("A sync batch may contain at most 100 events.")

    device = KioskDevice.objects.select_for_update().select_related("pharmacy").get(pk=device.pk)
    if not device.is_active or device.revoked_at:
        raise ValidationError("Kiosk device is revoked.")

    results = []
    for raw_event in events:
        try:
            stored, result = ingest_offline_event(device, raw_event)
            results.append({
                "event_id": str(stored.event_id),
                "device_seq": stored.device_sequence,
                "result": result,
                "integrity_flags": stored.integrity_flags,
                "reason": stored.rejection_reason or None,
            })
        except ValidationError as exc:
            raw_summary = raw_event if isinstance(raw_event, dict) else {}
            results.append({
                "event_id": str(raw_summary.get("event_id", "")),
                "device_seq": raw_summary.get("device_seq"),
                "result": "rejected",
                "integrity_flags": [],
                "reason": "; ".join(exc.messages),
            })

    _advance_contiguous_ack(device)
    now = timezone.now()
    device.last_seen_at = now
    device.last_sync_at = now
    if app_version:
        device.app_version = str(app_version)[:40]
    device.save(update_fields=[
        "last_contiguous_sequence",
        "last_event_hash",
        "last_seen_at",
        "last_sync_at",
        "app_version",
    ])
    return {
        "device_id": str(device.installation_id),
        "acknowledged_through": device.last_contiguous_sequence,
        "results": results,
        "server_time": now.isoformat(),
    }
