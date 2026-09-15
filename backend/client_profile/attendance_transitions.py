"""Attendance transitions engine for clock-in, in-app breaks, and clock-out.

Enforces transactional integrity, server-authoritative timestamps, and immutable
event tracking:
1. Clock-in:
   - Evaluates eligibility via `resolve_attendance_eligibility`.
   - Validates physical presence via signed QR token or kiosk PIN.
   - Enforces the one-open-session-per-worker database invariant with 30s duplicate idempotency.
   - Spawns `ProvisionalAttendance` records for unrostered local or cross-site cover.
2. In-app Breaks:
   - Validates sequential break flow (`BREAK_START` -> `BREAK_END`).
   - Prevents starting a break while already on break or when clocked out.
3. Clock-out:
   - Resolves the open session established at clock-in regardless of subsequent
     roster or membership changes.
   - Auto-ends active breaks before recording `CLOCK_OUT`.
   - Closes session by stamping `ended_at = now`.
"""

from datetime import timedelta
from typing import Optional, Tuple

from django.core.exceptions import ValidationError
from django.db import transaction
from django.utils import timezone

from client_profile.attendance_credentials import (
    verify_kiosk_worker_pin,
    verify_signed_pharmacy_qr,
)
from client_profile.attendance_eligibility import (
    resolve_attendance_eligibility,
)
from client_profile.models import (
    AttendanceEvent,
    AttendanceSession,
    KioskDevice,
    Pharmacy,
    ProvisionalAttendance,
)


def clock_in(
    user,
    pharmacy: Pharmacy,
    *,
    signed_qr_token: Optional[str] = None,
    kiosk_device: Optional[KioskDevice] = None,
    raw_pin: Optional[str] = None,
    user_identifier: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> Tuple[AttendanceSession, AttendanceEvent]:
    """
    Clock in a worker at a pharmacy transactionally.
    Returns (AttendanceSession, AttendanceEvent).
    """
    if user is None or pharmacy is None:
        raise ValidationError("Both user and pharmacy are required to clock in.")

    now = timezone.now()

    with transaction.atomic():
        # Check existing open session across all pharmacies
        existing_session = (
            AttendanceSession.objects.select_for_update()
            .filter(user=user, ended_at__isnull=True)
            .first()
        )

        if existing_session is not None:
            # Idempotent retry: if exact same pharmacy clocked in within 30 seconds, return existing
            if (
                existing_session.pharmacy_id == pharmacy.id
                and (now - existing_session.started_at) <= timedelta(seconds=30)
            ):
                initial_event = existing_session.events.filter(
                    event_type=AttendanceEvent.EventType.CLOCK_IN
                ).first()
                return existing_session, initial_event

            raise ValidationError(
                f"Worker already has an open attendance session at {existing_session.pharmacy.name}."
            )

        # Validate presence credentials
        qr_session = None
        device = None
        source = None

        if signed_qr_token:
            valid, qr_sess, reason = verify_signed_pharmacy_qr(
                signed_qr_token, expected_pharmacy_id=pharmacy.id
            )
            if not valid:
                raise ValidationError(f"QR validation failed: {reason}")
            qr_session = qr_sess
            source = AttendanceEvent.Source.MOBILE_QR
        elif kiosk_device and raw_pin:
            if not kiosk_device.is_active:
                raise ValidationError("Kiosk device is inactive or revoked.")
            if kiosk_device.pharmacy_id != pharmacy.id:
                raise ValidationError("Kiosk device does not belong to the target pharmacy.")

            ident = user_identifier or getattr(user, "email", None) or str(user.id)
            valid, _, reason = verify_kiosk_worker_pin(kiosk_device, ident, raw_pin)
            if not valid:
                raise ValidationError(f"PIN verification failed: {reason}")
            device = kiosk_device
            source = AttendanceEvent.Source.KIOSK_PIN
        else:
            raise ValidationError("A valid signed QR token or kiosk PIN credentials must be provided.")

        # Resolve attendance eligibility
        eligibility = resolve_attendance_eligibility(user, pharmacy, target_time=now)
        if not eligibility.is_eligible:
            raise ValidationError(
                f"Attendance eligibility rejected: {eligibility.rejection_reason}"
            )

        # Create AttendanceSession
        session = AttendanceSession.objects.create(
            pharmacy=pharmacy,
            user=user,
            assignment=eligibility.assignment,
            source_membership=eligibility.source_membership,
            started_at=now,
            ended_at=None,
            is_provisional=eligibility.is_provisional,
        )

        # Create immutable CLOCK_IN event
        event = AttendanceEvent.objects.create(
            session=session,
            event_type=AttendanceEvent.EventType.CLOCK_IN,
            occurred_at=now,
            source=source,
            qr_session=qr_session,
            device=device,
            ip_address=ip_address,
        )

        # If provisional, create ProvisionalAttendance record
        if eligibility.is_provisional:
            ProvisionalAttendance.objects.create(
                session=session,
                cover_type=eligibility.cover_type,
                status=ProvisionalAttendance.Status.PENDING,
            )

        return session, event


def start_break(
    user,
    *,
    ip_address: Optional[str] = None,
) -> AttendanceEvent:
    """Start an in-app break for the worker's active open session."""
    with transaction.atomic():
        session = (
            AttendanceSession.objects.select_for_update()
            .filter(user=user, ended_at__isnull=True)
            .first()
        )
        if session is None:
            raise ValidationError("No active open attendance session found for worker.")

        last_event = session.events.order_by("-occurred_at", "-id").first()
        if last_event and last_event.event_type == AttendanceEvent.EventType.BREAK_START:
            raise ValidationError("Cannot start break: Worker is already on break.")

        now = timezone.now()
        break_event = AttendanceEvent.objects.create(
            session=session,
            event_type=AttendanceEvent.EventType.BREAK_START,
            occurred_at=now,
            source=AttendanceEvent.Source.IN_APP,
            ip_address=ip_address,
        )
        return break_event


def end_break(
    user,
    *,
    ip_address: Optional[str] = None,
) -> AttendanceEvent:
    """End an in-app break for the worker's active open session."""
    with transaction.atomic():
        session = (
            AttendanceSession.objects.select_for_update()
            .filter(user=user, ended_at__isnull=True)
            .first()
        )
        if session is None:
            raise ValidationError("No active open attendance session found for worker.")

        last_event = session.events.order_by("-occurred_at", "-id").first()
        if not last_event or last_event.event_type != AttendanceEvent.EventType.BREAK_START:
            raise ValidationError("Cannot end break: Worker is not currently on break.")

        now = timezone.now()
        end_event = AttendanceEvent.objects.create(
            session=session,
            event_type=AttendanceEvent.EventType.BREAK_END,
            occurred_at=now,
            source=AttendanceEvent.Source.IN_APP,
            ip_address=ip_address,
        )
        return end_event


def clock_out(
    user,
    *,
    signed_qr_token: Optional[str] = None,
    kiosk_device: Optional[KioskDevice] = None,
    raw_pin: Optional[str] = None,
    user_identifier: Optional[str] = None,
    ip_address: Optional[str] = None,
) -> Tuple[AttendanceSession, AttendanceEvent]:
    """
    Clock out a worker from their active attendance session.
    Auto-closes active breaks before recording CLOCK_OUT.
    Returns (AttendanceSession, AttendanceEvent).
    """
    now = timezone.now()

    with transaction.atomic():
        session = (
            AttendanceSession.objects.select_for_update()
            .select_related("pharmacy")
            .filter(user=user, ended_at__isnull=True)
            .first()
        )

        if session is None:
            # Idempotent retry check: recently closed within 30s
            recent_closed = (
                AttendanceSession.objects.filter(
                    user=user,
                    ended_at__gte=now - timedelta(seconds=30),
                )
                .order_by("-ended_at")
                .first()
            )
            if recent_closed is not None:
                last_event = recent_closed.events.filter(
                    event_type=AttendanceEvent.EventType.CLOCK_OUT
                ).first()
                return recent_closed, last_event

            raise ValidationError("No active open attendance session found for worker.")

        # Validate credentials at the session's pharmacy
        qr_session = None
        device = None
        source = None

        if signed_qr_token:
            valid, qr_sess, reason = verify_signed_pharmacy_qr(
                signed_qr_token, expected_pharmacy_id=session.pharmacy_id
            )
            if not valid:
                raise ValidationError(f"QR validation failed: {reason}")
            qr_session = qr_sess
            source = AttendanceEvent.Source.MOBILE_QR
        elif kiosk_device and raw_pin:
            if not kiosk_device.is_active:
                raise ValidationError("Kiosk device is inactive or revoked.")
            if kiosk_device.pharmacy_id != session.pharmacy_id:
                raise ValidationError("Kiosk device does not belong to session pharmacy.")

            ident = user_identifier or getattr(user, "email", None) or str(user.id)
            valid, _, reason = verify_kiosk_worker_pin(kiosk_device, ident, raw_pin)
            if not valid:
                raise ValidationError(f"PIN verification failed: {reason}")
            device = kiosk_device
            source = AttendanceEvent.Source.KIOSK_PIN
        else:
            raise ValidationError("A valid signed QR token or kiosk PIN credentials must be provided.")

        # If currently on break, auto-close the break with BREAK_END first
        last_event = session.events.order_by("-occurred_at", "-id").first()
        if last_event and last_event.event_type == AttendanceEvent.EventType.BREAK_START:
            AttendanceEvent.objects.create(
                session=session,
                event_type=AttendanceEvent.EventType.BREAK_END,
                occurred_at=now,
                source=source,
                device=device,
                qr_session=qr_session,
                ip_address=ip_address,
            )

        # Record immutable CLOCK_OUT event
        clock_out_event = AttendanceEvent.objects.create(
            session=session,
            event_type=AttendanceEvent.EventType.CLOCK_OUT,
            occurred_at=now,
            source=source,
            device=device,
            qr_session=qr_session,
            ip_address=ip_address,
        )

        # Close session
        session.ended_at = now
        session.save(update_fields=["ended_at", "updated_at"])

        return session, clock_out_event


def get_active_session_status(user) -> Optional[dict]:
    """Retrieve summary of worker's active open session, if any."""
    session = (
        AttendanceSession.objects.filter(user=user, ended_at__isnull=True)
        .select_related("pharmacy", "assignment")
        .first()
    )
    if not session:
        return None

    last_event = session.events.order_by("-occurred_at", "-id").first()
    is_on_break = (
        last_event.event_type == AttendanceEvent.EventType.BREAK_START
        if last_event
        else False
    )

    return {
        "session_id": session.id,
        "pharmacy_id": session.pharmacy_id,
        "pharmacy_name": session.pharmacy.name,
        "started_at": session.started_at,
        "is_provisional": session.is_provisional,
        "is_on_break": is_on_break,
        "last_event_type": last_event.event_type if last_event else None,
    }
