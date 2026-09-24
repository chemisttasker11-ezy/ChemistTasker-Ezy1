from __future__ import annotations

from datetime import datetime, timedelta

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_datetime

from client_profile.models import Membership, ShiftSlotAssignment
from client_profile.timezone_utils import get_pharmacy_timezone

from .models import WorkforceLeaveRequest
from .permissions import can_manage_pharmacy


ACTIVE_SLOT_STATUSES = {
    WorkforceLeaveRequest.Status.PENDING,
    WorkforceLeaveRequest.Status.APPROVED,
}


def _required_datetime(value, label):
    parsed = parse_datetime(str(value or ""))
    if not parsed:
        raise ValidationError(f"{label} must be an ISO-8601 datetime.")
    if timezone.is_naive(parsed):
        raise ValidationError(f"{label} must include a timezone offset.")
    return parsed


def _membership_for_assignment(user, pharmacy):
    queryset = Membership.objects.filter(user=user, pharmacy=pharmacy)
    return (
        queryset.filter(is_active=True, status=Membership.Status.ACCEPTED).order_by("-id").first()
        or queryset.filter(status=Membership.Status.ACCEPTED).order_by("-id").first()
        or queryset.order_by("-id").first()
    )


def assignment_interval(assignment):
    work_date = assignment.slot_date or assignment.slot.date
    tz = get_pharmacy_timezone(assignment.shift.pharmacy)
    start = datetime.combine(work_date, assignment.slot.start_time, tzinfo=tz)
    end_date = work_date + timedelta(days=1) if assignment.slot.end_time <= assignment.slot.start_time else work_date
    end = datetime.combine(end_date, assignment.slot.end_time, tzinfo=tz)
    return start, end


def serialize_leave(row, *, include_manager_note=False):
    payload = {
        "id": row.pk,
        "pharmacy_id": row.pharmacy_id,
        "pharmacy_name": row.pharmacy.name,
        "user_id": row.user_id,
        "worker_name": row.user.get_full_name() or row.user.username,
        "membership_id": row.membership_id,
        "slot_assignment_id": row.slot_assignment_id,
        "leave_type": row.leave_type,
        "start_at": row.start_at.isoformat(),
        "end_at": row.end_at.isoformat(),
        "status": row.status,
        "note": row.note,
        "created_at": row.created_at.isoformat(),
        "decided_at": row.decided_at.isoformat() if row.decided_at else None,
    }
    payload["manager_note"] = row.manager_note if include_manager_note else ""
    return payload


def serialize_legacy_leave(row):
    return {
        "id": row.pk,
        "slot_assignment": row.slot_assignment_id,
        "user": row.user_id,
        "leave_type": row.leave_type,
        "note": row.note,
        "status": row.status,
        "date_applied": row.created_at,
        "date_resolved": row.decided_at,
    }


@transaction.atomic
def create_leave(user, payload):
    raw_assignment_id = payload.get("slot_assignment_id") or payload.get("slot_assignment")
    leave_type = str(payload.get("leave_type") or "").upper()
    note = str(payload.get("note") or "").strip()

    if raw_assignment_id:
        try:
            assignment = (
                ShiftSlotAssignment.objects.select_for_update()
                .select_related("shift__pharmacy", "slot")
                .get(pk=int(raw_assignment_id))
            )
        except (ShiftSlotAssignment.DoesNotExist, TypeError, ValueError):
            raise ValidationError("A valid roster assignment is required.")

        if assignment.user_id != user.pk:
            raise PermissionDenied("You can only request leave for your own assigned shifts.")

        existing = WorkforceLeaveRequest.objects.filter(
            slot_assignment=assignment,
            user=user,
            status__in=ACTIVE_SLOT_STATUSES,
        ).first()
        if existing:
            raise ValidationError("An active leave request already exists for this shift.")

        start_at, end_at = assignment_interval(assignment)
        membership = _membership_for_assignment(user, assignment.shift.pharmacy)
        row = WorkforceLeaveRequest(
            pharmacy=assignment.shift.pharmacy,
            membership=membership,
            user=user,
            slot_assignment=assignment,
            leave_type=leave_type,
            start_at=start_at,
            end_at=end_at,
            note=note,
        )
    else:
        try:
            membership = Membership.objects.select_related("pharmacy", "user").get(
                pk=payload.get("membership_id"),
                user=user,
                is_active=True,
                status=Membership.Status.ACCEPTED,
            )
        except Membership.DoesNotExist:
            raise PermissionDenied("Select one of your active pharmacy memberships.")

        start_at = _required_datetime(payload.get("start_at"), "start_at")
        end_at = _required_datetime(payload.get("end_at"), "end_at")
        if end_at <= start_at:
            raise ValidationError("end_at must be after start_at.")

        row = WorkforceLeaveRequest(
            pharmacy=membership.pharmacy,
            membership=membership,
            user=user,
            leave_type=leave_type,
            start_at=start_at,
            end_at=end_at,
            note=note,
        )

    row.full_clean()
    row.save()
    return row


@transaction.atomic
def update_pending_leave(user, leave_id, payload):
    try:
        row = WorkforceLeaveRequest.objects.select_for_update().select_related(
            "pharmacy", "user", "membership", "slot_assignment"
        ).get(pk=leave_id)
    except WorkforceLeaveRequest.DoesNotExist:
        raise ValidationError("Leave request not found.")

    if row.user_id != user.pk:
        raise PermissionDenied("You can only manage your own leave requests.")
    if row.status != WorkforceLeaveRequest.Status.PENDING:
        raise ValidationError("Only pending leave requests can be updated or cancelled.")

    if "leave_type" in payload:
        row.leave_type = str(payload.get("leave_type") or "").upper()
    if "note" in payload:
        row.note = str(payload.get("note") or "").strip()

    if not row.slot_assignment_id:
        if "start_at" in payload:
            row.start_at = _required_datetime(payload.get("start_at"), "start_at")
        if "end_at" in payload:
            row.end_at = _required_datetime(payload.get("end_at"), "end_at")
        if row.end_at <= row.start_at:
            raise ValidationError("end_at must be after start_at.")

    row.full_clean()
    row.save()
    return row


@transaction.atomic
def decide_leave(actor, leave_id, decision, manager_note=""):
    try:
        row = WorkforceLeaveRequest.objects.select_for_update().select_related(
            "pharmacy", "user", "membership", "slot_assignment__slot", "slot_assignment__shift__pharmacy"
        ).get(pk=leave_id)
    except WorkforceLeaveRequest.DoesNotExist:
        raise ValidationError("Leave request not found.")

    decision = str(decision or "").upper()
    if decision == WorkforceLeaveRequest.Status.CANCELLED:
        if row.user_id != actor.pk:
            raise PermissionDenied("Workers can only cancel their own leave requests.")
        if row.status != WorkforceLeaveRequest.Status.PENDING:
            raise ValidationError("Only a pending leave request can be cancelled by the worker.")
    else:
        if not can_manage_pharmacy(actor, row.pharmacy):
            raise PermissionDenied("Not authorized to approve/reject this leave request.")
        if decision not in {WorkforceLeaveRequest.Status.APPROVED, WorkforceLeaveRequest.Status.REJECTED}:
            raise ValidationError("decision must be APPROVED, REJECTED, or worker-owned CANCELLED.")
        if row.status != WorkforceLeaveRequest.Status.PENDING:
            raise ValidationError("Only pending leave requests can be approved or rejected.")
        if decision == WorkforceLeaveRequest.Status.APPROVED and WorkforceLeaveRequest.objects.filter(
            user_id=row.user_id,
            pharmacy_id=row.pharmacy_id,
            status=WorkforceLeaveRequest.Status.APPROVED,
            start_at__lt=row.end_at,
            end_at__gt=row.start_at,
        ).exclude(pk=row.pk).exists():
            raise ValidationError("This leave request overlaps another approved leave request for the worker.")

    row.status = decision
    row.manager_note = str(manager_note or "").strip() if decision != WorkforceLeaveRequest.Status.CANCELLED else row.manager_note
    row.decided_by = actor
    row.decided_at = timezone.now()
    row.save(update_fields=["status", "manager_note", "decided_by", "decided_at", "updated_at"])
    return row
