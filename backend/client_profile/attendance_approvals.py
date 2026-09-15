"""Manager approval, rejection, and manual correction services for Attendance V1.

Provides destination-pharmacy review workflows for unrostered and cross-site attendance:
1. Destination-Pharmacy Capability Checks:
   - Enforces that only the destination pharmacy's owner or authorized manager
     (`PharmacyAdmin` with OWNER or MANAGER level) can review or correct records.
   - Wrong-site managers are strictly denied.
2. Atomic, Repeat-Safe Approval & Backfill:
   - Approving creates backfill `Shift`, `ShiftSlot`, and `ShiftSlotAssignment` records
     stamped with actual clock dates and times.
   - Links session to the new assignment.
   - Idempotent: repeated approval calls return the existing record without duplicates.
   - Zero permanent membership creation: urgent/cross-site workers are not granted
     permanent destination membership upon approval.
3. Rejection with Evidence Preservation:
   - Requires a justification reason; marks status as REJECTED.
   - All raw sessions and immutable events are retained intact for audit.
4. Audited Append-Only Manual Corrections:
   - Manager adjustments are stored as separate `AttendanceCorrection` records.
   - The original `AttendanceEvent.occurred_at` is preserved unmodified.
   - Timeline resolution computes the effective chronology with audit trail.
"""

from datetime import datetime
from typing import List, Optional

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.db.models import QuerySet
from django.utils import timezone

from client_profile.models import (
    AttendanceCorrection,
    AttendanceEvent,
    AttendanceSession,
    Pharmacy,
    PharmacyAdmin,
    ProvisionalAttendance,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
)


def is_authorized_attendance_manager(user, pharmacy: Pharmacy) -> bool:
    """Validate whether user is the owner or an authorized manager for this specific destination pharmacy."""
    if not user or not pharmacy or not user.is_active:
        return False
    if user.is_superuser:
        return True

    # Owner check
    owner = getattr(pharmacy, "owner", None)
    if owner and getattr(owner, "user_id", None) == user.id:
        return True

    # Reuse the existing destination-pharmacy roster capability.
    from .admin_helpers import can_manage_roster
    if can_manage_roster(user, pharmacy):
        return True
    if pharmacy.organization_id:
        from users.models import OrganizationMembership
        membership = OrganizationMembership.objects.filter(
            user=user, organization_id=pharmacy.organization_id, role="ORG_ADMIN",
        ).first()
        if membership:
            scope = membership.pharmacies.all()
            return not scope.exists() or scope.filter(pk=pharmacy.pk).exists()
    return False


def get_pending_provisional_attendances(user, pharmacy: Pharmacy) -> QuerySet:
    """Retrieve all pending provisional attendance reviews for an authorized destination pharmacy."""
    if not is_authorized_attendance_manager(user, pharmacy):
        raise PermissionDenied("Only an authorized manager of this pharmacy can view pending attendances.")

    return (
        ProvisionalAttendance.objects.filter(
            session__pharmacy=pharmacy,
            status=ProvisionalAttendance.Status.PENDING,
        )
        .select_related(
            "session",
            "session__user",
            "session__source_membership",
            "session__pharmacy",
        )
        .order_by("-created_at")
    )


def approve_provisional_attendance(
    manager_user,
    provisional_id: int,
    *,
    reason: str = "",
) -> ProvisionalAttendance:
    """
    Atomically approve a provisional attendance session and backfill Shift/Slot/Assignment.
    Repeat-safe / idempotent. Never creates permanent membership.
    Requires a closed session (worker must be clocked out).
    Clears session.is_provisional.
    Converts actual times using the destination pharmacy's timezone.
    """
    with transaction.atomic():
        provisional = (
            ProvisionalAttendance.objects.select_for_update()
            .select_related(
                "session",
                "session__pharmacy",
                "session__user",
                "session__source_membership",
            )
            .get(pk=provisional_id)
        )

        session = provisional.session
        destination_pharmacy = session.pharmacy

        # Destination-pharmacy capability check
        if not is_authorized_attendance_manager(manager_user, destination_pharmacy):
            raise PermissionDenied(
                "Wrong-site manager: only an authorized manager of the destination pharmacy can approve attendance."
            )

        # Idempotent repeat-safe check
        if (
            provisional.status == ProvisionalAttendance.Status.APPROVED
            or provisional.backfill_assignment_id is not None
            or session.assignment_id is not None
        ):
            return provisional

        if provisional.status == ProvisionalAttendance.Status.REJECTED:
            raise ValidationError("Cannot approve an attendance record that was already rejected.")

        # Require a closed attendance session before shift backfill
        if session.ended_at is None:
            raise ValidationError("Cannot approve an open attendance session. Worker must clock out first.")

        # Determine shift schedule details from actual worked times in pharmacy timezone
        from client_profile.timezone_utils import get_pharmacy_timezone

        tz = get_pharmacy_timezone(destination_pharmacy)
        local_started_at = session.started_at.astimezone(tz)
        local_ended_at = session.ended_at.astimezone(tz)

        shift_date = local_started_at.date()
        start_time = local_started_at.time()
        end_time = local_ended_at.time()

        role = (
            session.source_membership.role
            if session.source_membership and session.source_membership.role != "CONTACT"
            else "PHARMACIST"
        )

        # 1. Backfill Shift
        backfill_shift = Shift.objects.create(
            pharmacy=destination_pharmacy,
            role_needed=role,
            created_by=manager_user,
        )

        # 2. Backfill ShiftSlot
        backfill_slot = ShiftSlot.objects.create(
            shift=backfill_shift,
            date=shift_date,
            start_time=start_time,
            end_time=end_time,
        )

        # 3. Backfill ShiftSlotAssignment
        backfill_assignment = ShiftSlotAssignment.objects.create(
            shift=backfill_shift,
            slot=backfill_slot,
            slot_date=shift_date,
            user=session.user,
            is_rostered=False,
        )

        # 4. Link assignment back to session and clear is_provisional
        session.assignment = backfill_assignment
        session.is_provisional = False
        session.save(update_fields=["assignment", "is_provisional", "updated_at"])

        # 5. Update ProvisionalAttendance record
        now = timezone.now()
        provisional.status = ProvisionalAttendance.Status.APPROVED
        provisional.decided_by = manager_user
        provisional.decided_at = now
        provisional.backfill_shift = backfill_shift
        provisional.backfill_assignment = backfill_assignment
        provisional.decision_reason = reason.strip()
        provisional.save(
            update_fields=[
                "status",
                "decided_by",
                "decided_at",
                "backfill_shift",
                "backfill_assignment",
                "decision_reason",
                "updated_at",
            ]
        )

        return provisional


def reject_provisional_attendance(
    manager_user,
    provisional_id: int,
    *,
    reason: str,
) -> ProvisionalAttendance:
    """
    Reject a provisional attendance session with required justification.
    Retains all raw session and event records intact for audit evidence.
    """
    if not reason or not reason.strip():
        raise ValidationError("A justification reason is required to reject attendance.")

    with transaction.atomic():
        provisional = (
            ProvisionalAttendance.objects.select_for_update()
            .select_related("session", "session__pharmacy")
            .get(pk=provisional_id)
        )

        destination_pharmacy = provisional.session.pharmacy

        # Destination-pharmacy capability check
        if not is_authorized_attendance_manager(manager_user, destination_pharmacy):
            raise PermissionDenied(
                "Wrong-site manager: only an authorized manager of the destination pharmacy can reject attendance."
            )

        # Idempotent check
        if provisional.status == ProvisionalAttendance.Status.REJECTED:
            return provisional

        if provisional.status == ProvisionalAttendance.Status.APPROVED:
            raise ValidationError("Cannot reject an attendance record that was already approved.")

        now = timezone.now()
        provisional.status = ProvisionalAttendance.Status.REJECTED
        provisional.decided_by = manager_user
        provisional.decided_at = now
        provisional.decision_reason = reason.strip()
        provisional.save(
            update_fields=[
                "status",
                "decided_by",
                "decided_at",
                "decision_reason",
                "updated_at",
            ]
        )

        return provisional


def create_attendance_correction(
    manager_user,
    event_id: int,
    *,
    corrected_timestamp: datetime,
    reason: str,
) -> AttendanceCorrection:
    """
    Create an append-only manager correction to an attendance event.
    The original event record is never modified or deleted.
    Validates that:
    1. Reason is provided.
    2. Corrected timestamp is valid and not in the future.
    3. Chronology within the session is preserved.
    """
    if not reason or not str(reason).strip():
        raise ValidationError("A justification reason is required for attendance corrections.")

    if not corrected_timestamp:
        raise ValidationError("A valid corrected timestamp is required.")

    if corrected_timestamp > timezone.now():
        raise ValidationError("Corrected timestamp cannot be in the future.")

    with transaction.atomic():
        event = (
            AttendanceEvent.objects.select_for_update()
            .select_related("session", "session__pharmacy")
            .get(pk=event_id)
        )

        destination_pharmacy = event.session.pharmacy

        # Destination-pharmacy capability check
        if not is_authorized_attendance_manager(manager_user, destination_pharmacy):
            raise PermissionDenied(
                "Wrong-site manager: only an authorized manager of the destination pharmacy can correct attendance events."
            )

        # Chronology validation within the session
        session = event.session
        other_events = session.events.exclude(pk=event.id).prefetch_related("corrections")

        for other in other_events:
            latest_c = other.corrections.order_by("-corrected_at", "-id").first()
            other_time = latest_c.corrected_timestamp if latest_c else other.occurred_at

            if event.event_type == AttendanceEvent.EventType.CLOCK_IN:
                if other.event_type in (
                    AttendanceEvent.EventType.CLOCK_OUT,
                    AttendanceEvent.EventType.BREAK_START,
                    AttendanceEvent.EventType.BREAK_END,
                ):
                    if corrected_timestamp > other_time:
                        raise ValidationError(
                            f"Clock-in correction cannot be after subsequent {other.event_type} ({other_time.isoformat()})."
                        )
            elif event.event_type == AttendanceEvent.EventType.CLOCK_OUT:
                if other.event_type in (
                    AttendanceEvent.EventType.CLOCK_IN,
                    AttendanceEvent.EventType.BREAK_START,
                    AttendanceEvent.EventType.BREAK_END,
                ):
                    if corrected_timestamp < other_time:
                        raise ValidationError(
                            f"Clock-out correction cannot be before preceding {other.event_type} ({other_time.isoformat()})."
                        )
            elif event.event_type == AttendanceEvent.EventType.BREAK_START:
                if other.event_type == AttendanceEvent.EventType.CLOCK_IN and corrected_timestamp < other_time:
                    raise ValidationError(
                        f"Break-start correction cannot be before clock-in ({other_time.isoformat()})."
                    )
                elif other.event_type in (
                    AttendanceEvent.EventType.BREAK_END,
                    AttendanceEvent.EventType.CLOCK_OUT,
                ) and corrected_timestamp > other_time:
                    raise ValidationError(
                        f"Break-start correction cannot be after {other.event_type} ({other_time.isoformat()})."
                    )
            elif event.event_type == AttendanceEvent.EventType.BREAK_END:
                if other.event_type in (
                    AttendanceEvent.EventType.CLOCK_IN,
                    AttendanceEvent.EventType.BREAK_START,
                ) and corrected_timestamp < other_time:
                    raise ValidationError(
                        f"Break-end correction cannot be before {other.event_type} ({other_time.isoformat()})."
                    )
                elif other.event_type == AttendanceEvent.EventType.CLOCK_OUT and corrected_timestamp > other_time:
                    raise ValidationError(
                        f"Break-end correction cannot be after clock-out ({other_time.isoformat()})."
                    )

        correction = AttendanceCorrection.objects.create(
            original_event=event,
            corrected_timestamp=corrected_timestamp,
            reason=str(reason).strip(),
            corrected_by=manager_user,
        )

        return correction


def get_effective_session_timeline(session: AttendanceSession) -> List[dict]:
    """
    Resolve the effective session chronology by applying any latest manager corrections
    to the immutable raw events, returning both original and effective timestamps.
    """
    events = (
        session.events.prefetch_related("corrections")
        .order_by("occurred_at", "id")
    )

    timeline = []
    for ev in events:
        latest_corr = ev.corrections.order_by("-corrected_at", "-id").first()
        effective_time = latest_corr.corrected_timestamp if latest_corr else ev.occurred_at

        timeline.append({
            "event_id": ev.id,
            "event_type": ev.event_type,
            "original_timestamp": ev.occurred_at,
            "effective_timestamp": effective_time,
            "is_corrected": latest_corr is not None,
            "correction_id": latest_corr.id if latest_corr else None,
            "correction_reason": latest_corr.reason if latest_corr else None,
            "corrected_by_id": latest_corr.corrected_by_id if latest_corr else None,
        })

    return timeline
