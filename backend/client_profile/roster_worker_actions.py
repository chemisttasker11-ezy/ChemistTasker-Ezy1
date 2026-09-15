"""
Service layer for Worker Roster Actions and Escalation (Checkpoint 12).
Handles:
- Direct swaps between eligible workers with role, overlap, and leave validation.
- "Can't work" cover requests that preserve assignments upon submission.
- Atomic manager replacement approval.
- Explicit manager release of workers with reuse of existing shift escalation (no duplicate shifts).
- Comprehensive append-only audit logging via RosterActionAudit.
"""
from datetime import date, time, timedelta
from django.core.exceptions import PermissionDenied, ValidationError
from django.db import transaction
from django.utils import timezone

from client_profile.attendance_approvals import is_authorized_attendance_manager
from client_profile.models import (
    LeaveRequest,
    Membership,
    Pharmacy,
    RosterActionAudit,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
    WorkerShiftRequest,
)


def validate_worker_replacement_eligibility(
    pharmacy: Pharmacy,
    target_user,
    slot_date: date,
    start_time: time,
    end_time: time,
    role_needed: str,
    exclude_assignment_id: int = None,
) -> bool:
    from django.contrib.auth import get_user_model
    from django.db import connection
    from .roster_validation import worker_issues
    if not target_user:
        raise ValidationError("Target worker is required.")
    if connection.in_atomic_block:
        target_user = get_user_model().objects.select_for_update().get(pk=target_user.pk)
    errors, warnings = worker_issues(pharmacy, target_user, slot_date, start_time, end_time,
                                    role_needed, exclude_assignment_id)
    if errors or warnings:
        raise ValidationError([item["message"] for item in errors + warnings])
    return True


def request_direct_swap(
    assignment: ShiftSlotAssignment,
    requesting_user,
    target_user,
    notes: str = "",
):
    """
    Submits a direct swap request from requesting_user to target_user.
    CRITICAL RULE: Submitting a request PRESERVES the current assignment.
    The requesting_user remains assigned until a replacement is approved.
    """
    if assignment.user_id != requesting_user.id:
        raise PermissionDenied("You can only request swaps for shifts assigned to you.")

    if target_user.id == requesting_user.id:
        raise ValidationError("Cannot swap a shift with yourself.")

    pharmacy = assignment.shift.pharmacy
    slot = assignment.slot
    slot_date = assignment.slot_date
    role_needed = assignment.shift.role_needed

    # Check eligibility of target worker
    validate_worker_replacement_eligibility(
        pharmacy=pharmacy,
        target_user=target_user,
        slot_date=slot_date,
        start_time=slot.start_time,
        end_time=slot.end_time,
        role_needed=role_needed,
        exclude_assignment_id=assignment.id,
    )

    with transaction.atomic():
        # Create WorkerShiftRequest linking to the existing assignment
        target_name = target_user.get_full_name() or target_user.username
        req = WorkerShiftRequest.objects.create(
            pharmacy=pharmacy,
            requested_by=requesting_user,
            shift=assignment,
            role=role_needed,
            slot_date=slot_date,
            start_time=slot.start_time,
            end_time=slot.end_time,
            note=f"Direct swap request with {target_name}. {notes}".strip(),
            status="PENDING",
        )

        audit = RosterActionAudit.objects.create(
            pharmacy=pharmacy,
            shift_assignment=assignment,
            action_type=RosterActionAudit.ActionType.SWAP_REQUESTED,
            performed_by=requesting_user,
            target_user=target_user,
            details={
                "request_id": req.id,
                "target_user_id": target_user.id,
                "target_user_name": target_name,
                "notes": notes,
            },
        )

    return req, audit


def approve_direct_swap(
    request_id_or_obj,
    manager,
    target_user=None,
):
    """
    Manager approves a direct swap request.
    Atomic execution: verifies target availability at approval time and
    reassigns assignment.user = target_user in a single transaction.
    Protects against stale requests if the assignment or assignee changed in the interim.
    """
    with transaction.atomic():
        if isinstance(request_id_or_obj, WorkerShiftRequest):
            req = WorkerShiftRequest.objects.select_for_update().get(pk=request_id_or_obj.pk)
        else:
            req = WorkerShiftRequest.objects.select_for_update().get(pk=request_id_or_obj)

        if req.status != "PENDING":
            raise ValidationError(f"Request is already {req.status.lower()}.")

        pharmacy = req.pharmacy
        if not is_authorized_attendance_manager(manager, pharmacy):
            raise PermissionDenied("You are not authorized to approve roster actions for this pharmacy.")

        if not req.shift_id:
            raise ValidationError("Associated shift assignment no longer exists.")

        try:
            assignment = ShiftSlotAssignment.objects.select_for_update().get(pk=req.shift_id)
        except ShiftSlotAssignment.DoesNotExist:
            raise ValidationError("Associated shift assignment no longer exists.")

        # Stale request protection: requester must still be the current assignee!
        if assignment.user_id != req.requested_by_id:
            raise ValidationError("Stale request: the requesting worker is no longer assigned to this shift.")

        swap_audit = RosterActionAudit.objects.filter(
            details__request_id=req.pk, shift_assignment=assignment,
            performed_by=req.requested_by, action_type=RosterActionAudit.ActionType.SWAP_REQUESTED,
        ).order_by("-created_at").first()
        if not swap_audit or not swap_audit.target_user_id:
            raise ValidationError("Target swap worker could not be determined for this request.")
        if target_user and target_user.pk != swap_audit.target_user_id:
            raise ValidationError("Target worker does not match the original swap request.")
        target_user = swap_audit.target_user

        # Re-verify eligibility at decision time
        validate_worker_replacement_eligibility(
            pharmacy=pharmacy,
            target_user=target_user,
            slot_date=assignment.slot_date or assignment.slot.date,
            start_time=assignment.slot.start_time,
            end_time=assignment.slot.end_time,
            role_needed=assignment.shift.role_needed,
            exclude_assignment_id=assignment.id,
        )

        previous_user_id = assignment.user_id

        # Atomic transfer of assignment
        assignment.user = target_user
        assignment.save(update_fields=["user"])
        from .roster_services import refresh_assignment_rate
        refresh_assignment_rate(assignment)

        # Mark request approved
        req.status = "APPROVED"
        req.resolved_by = manager
        req.resolved_at = timezone.now()
        req.save(update_fields=["status", "resolved_by", "resolved_at"])

        # Audit log
        audit = RosterActionAudit.objects.create(
            pharmacy=pharmacy,
            shift_assignment=assignment,
            action_type=RosterActionAudit.ActionType.SWAP_APPROVED,
            performed_by=manager,
            target_user=target_user,
            details={
                "request_id": req.id,
                "previous_user_id": previous_user_id,
                "new_user_id": target_user.id,
            },
        )

    return assignment


def submit_cover_request(
    assignment: ShiftSlotAssignment,
    requesting_user,
    reason: str = "",
):
    """
    Submits a cover request ("can't work").
    CRITICAL RULE: Submitting a request PRESERVES the assignment.
    Original worker remains assigned until a replacement is approved or released.
    """
    if assignment.user_id != requesting_user.id:
        raise PermissionDenied("You can only request cover for shifts assigned to you.")

    pharmacy = assignment.shift.pharmacy
    slot = assignment.slot
    slot_date = assignment.slot_date
    role_needed = assignment.shift.role_needed

    with transaction.atomic():
        req = WorkerShiftRequest.objects.create(
            pharmacy=pharmacy,
            requested_by=requesting_user,
            shift=assignment,
            role=role_needed,
            slot_date=slot_date,
            start_time=slot.start_time,
            end_time=slot.end_time,
            note=reason or "Worker requested shift cover.",
            status="PENDING",
        )

        audit = RosterActionAudit.objects.create(
            pharmacy=pharmacy,
            shift_assignment=assignment,
            action_type=RosterActionAudit.ActionType.COVER_REQUESTED,
            performed_by=requesting_user,
            details={
                "request_id": req.id,
                "reason": reason,
            },
        )

    return req, audit


def approve_cover_replacement(
    request_id_or_obj,
    replacement_user,
    manager,
):
    """
    Manager approves a replacement worker for a cover request.
    Atomically reassigns assignment.user = replacement_user with role/conflict/leave checks.
    """
    with transaction.atomic():
        if isinstance(request_id_or_obj, WorkerShiftRequest):
            req = WorkerShiftRequest.objects.select_for_update().get(pk=request_id_or_obj.pk)
        else:
            req = WorkerShiftRequest.objects.select_for_update().get(pk=request_id_or_obj)

        if req.status != "PENDING":
            raise ValidationError(f"Request is already {req.status.lower()}.")

        pharmacy = req.pharmacy
        if not is_authorized_attendance_manager(manager, pharmacy):
            raise PermissionDenied("You are not authorized to approve roster actions for this pharmacy.")

        if not req.shift_id:
            raise ValidationError("Associated shift assignment no longer exists.")

        try:
            assignment = ShiftSlotAssignment.objects.select_for_update().get(pk=req.shift_id)
        except ShiftSlotAssignment.DoesNotExist:
            raise ValidationError("Associated shift assignment no longer exists.")

        # Stale request protection: requester must still be the current assignee!
        if assignment.user_id != req.requested_by_id:
            raise ValidationError("Stale request: the requesting worker is no longer assigned to this shift.")

        # Validate replacement worker eligibility
        validate_worker_replacement_eligibility(
            pharmacy=pharmacy,
            target_user=replacement_user,
            slot_date=assignment.slot_date or assignment.slot.date,
            start_time=assignment.slot.start_time,
            end_time=assignment.slot.end_time,
            role_needed=assignment.shift.role_needed,
            exclude_assignment_id=assignment.id,
        )

        previous_user_id = assignment.user_id

        # Atomic reassignment
        assignment.user = replacement_user
        assignment.save(update_fields=["user"])
        from .roster_services import refresh_assignment_rate
        refresh_assignment_rate(assignment)

        # Mark request approved
        req.status = "APPROVED"
        req.resolved_by = manager
        req.resolved_at = timezone.now()
        req.save(update_fields=["status", "resolved_by", "resolved_at"])

        audit = RosterActionAudit.objects.create(
            pharmacy=pharmacy,
            shift_assignment=assignment,
            action_type=RosterActionAudit.ActionType.COVER_APPROVED,
            performed_by=manager,
            target_user=replacement_user,
            details={
                "request_id": req.id,
                "previous_user_id": previous_user_id,
                "replacement_user_id": replacement_user.id,
            },
        )

    return assignment


def release_worker_from_assignment(
    request_id_or_obj,
    manager,
    escalate_to_visibility: str = None,
):
    """
    Manager explicitly releases a worker without replacement.
    Deletes the ShiftSlotAssignment row, but REUSES the existing Shift and ShiftSlot.
    If escalate_to_visibility is provided, updates shift.visibility directly.
    NEVER creates duplicate marketplace shifts.
    Rejects stale requests if the assignment was already transferred to another worker.
    """
    with transaction.atomic():
        if isinstance(request_id_or_obj, WorkerShiftRequest):
            req = WorkerShiftRequest.objects.select_for_update().get(pk=request_id_or_obj.pk)
        else:
            req = WorkerShiftRequest.objects.select_for_update().get(pk=request_id_or_obj)

        if req.status != "PENDING":
            raise ValidationError(f"Request is already {req.status.lower()}.")

        pharmacy = req.pharmacy
        if not is_authorized_attendance_manager(manager, pharmacy):
            raise PermissionDenied("You are not authorized to release workers for this pharmacy.")

        assignment = req.shift
        released_worker = req.requested_by
        shift = None

        if assignment:
            # Stale request protection: requester must still be the current assignee!
            if assignment.user_id != req.requested_by_id:
                raise ValidationError("Stale request: the requesting worker is no longer assigned to this shift.")

            shift = assignment.shift
            # Explicit deletion of the filled slot assignment
            from .roster_services import _protect_assignment_history
            _protect_assignment_history(assignment)
            assignment.delete()
            req.shift = None

        if shift and escalate_to_visibility:
            from .views import BaseShiftViewSet, PUBLIC_LEVEL, enforce_public_shift_daily_limit
            from .serializers import ShiftSerializer
            tiers = ShiftSerializer.build_allowed_tiers(shift.pharmacy)
            if escalate_to_visibility not in tiers:
                raise ValidationError("Invalid escalation visibility for this pharmacy.")
            if escalate_to_visibility == PUBLIC_LEVEL:
                enforce_public_shift_daily_limit(shift.pharmacy)
            BaseShiftViewSet._apply_escalation(shift, tiers, tiers.index(escalate_to_visibility))
            # Released work now belongs to the established marketplace workflow.
            shift.slots.filter(roster_period__isnull=False).update(roster_period=None)

        req.status = "APPROVED"
        req.resolved_by = manager
        req.resolved_at = timezone.now()
        req.save(update_fields=["status", "resolved_by", "resolved_at", "shift"])

        audit = RosterActionAudit.objects.create(
            pharmacy=pharmacy,
            shift_assignment=None,
            action_type=RosterActionAudit.ActionType.WORKER_RELEASED,
            performed_by=manager,
            target_user=released_worker,
            details={
                "request_id": req.id,
                "released_worker_id": released_worker.id,
                "escalate_to_visibility": escalate_to_visibility,
                "shift_id": shift.id if shift else None,
            },
        )

    return shift


def reject_worker_shift_request(
    request_id_or_obj,
    manager,
    reason: str = "",
):
    """
    Manager rejects a worker's swap or cover request.
    The original assignment remains completely intact with the original worker.
    """
    with transaction.atomic():
        if isinstance(request_id_or_obj, WorkerShiftRequest):
            req = WorkerShiftRequest.objects.select_for_update().get(pk=request_id_or_obj.pk)
        else:
            req = WorkerShiftRequest.objects.select_for_update().get(pk=request_id_or_obj)

        if req.status != "PENDING":
            raise ValidationError(f"Request is already {req.status.lower()}.")

        pharmacy = req.pharmacy
        if not is_authorized_attendance_manager(manager, pharmacy):
            raise PermissionDenied("You are not authorized to reject roster actions for this pharmacy.")

        req.status = "REJECTED"
        req.resolved_by = manager
        req.resolved_at = timezone.now()
        req.save(update_fields=["status", "resolved_by", "resolved_at"])

        is_swap = "swap" in (req.note or "").lower()
        action_type = (
            RosterActionAudit.ActionType.SWAP_REJECTED
            if is_swap
            else RosterActionAudit.ActionType.COVER_REJECTED
        )

        audit = RosterActionAudit.objects.create(
            pharmacy=pharmacy,
            shift_assignment=req.shift,
            action_type=action_type,
            performed_by=manager,
            target_user=req.requested_by,
            details={
                "request_id": req.id,
                "reason": reason,
            },
        )

    return req
