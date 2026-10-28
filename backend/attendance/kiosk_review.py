"""Pharmacy-authorized review of signed, provisional kiosk attendance evidence."""
import logging
import uuid
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, OperationalError, transaction
from django.shortcuts import get_object_or_404
from django.utils import timezone
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from attendance.models import AttendanceSession, KioskAttendanceEvent, KioskAttendanceReview, KioskDevice
from attendance.approvals import is_authorized_attendance_manager
from attendance.protocol import _apply_business_event, _parse_aware_datetime
from organizations.models import Pharmacy

logger = logging.getLogger(__name__)

BLOCKED_APPROVAL_FLAGS = {
    "HASH_CHAIN_MISMATCH", "SEQUENCE_GAP", "UNEXPECTED_INITIAL_HASH",
    "DEVICE_REVOKED_DRAIN", "MONOTONIC_ROLLBACK",
}


def _is_lock_unavailable_error(exc: Exception) -> bool:
    cause = getattr(exc, "__cause__", None)
    pgcode = getattr(cause, "pgcode", None) or getattr(exc, "pgcode", None) or getattr(cause, "sqlstate", None)
    if pgcode == "55P03":
        return True
    msg = str(exc).lower()
    return "could not obtain lock" in msg or "lock not available" in msg


class ManagerPendingKioskReviewView(APIView):
    permission_classes = (IsAuthenticated,)

    def get(self, request):
        try:
            pharmacy_id = int(request.query_params.get("pharmacy_id", ""))
        except (TypeError, ValueError):
            raise ValidationError({"pharmacy_id": "A valid pharmacy ID is required."})
        pharmacy = get_object_or_404(Pharmacy, pk=pharmacy_id)
        if not is_authorized_attendance_manager(request.user, pharmacy):
            return Response({"detail": "Not authorized for this pharmacy."}, status=403)
        events = (
            KioskAttendanceEvent.objects.filter(
                device__pharmacy=pharmacy,
                processing_status=KioskAttendanceEvent.ProcessingStatus.NEEDS_REVIEW,
                manager_review__isnull=True,
                attendance_event__isnull=True,
            ).select_related("device", "device__pharmacy", "employee").order_by("received_at")[:100]
        )
        results = []
        for event in events:
            worker_name = ""
            if event.employee:
                worker_name = f"{event.employee.first_name} {event.employee.last_name}".strip()
                if not worker_name:
                    worker_name = event.employee.get_full_name() or event.employee.username or str(event.employee)

            can_approve = True
            approval_block_reason = None

            if not event.device.is_active or event.device.revoked_at is not None:
                can_approve = False
                approval_block_reason = "Device was revoked."
            elif event.employee is None or not event.employee.is_active:
                can_approve = False
                approval_block_reason = "Worker is inactive or not eligible."
            else:
                blocked = sorted(set(event.integrity_flags or []).intersection(BLOCKED_APPROVAL_FLAGS))
                if blocked:
                    can_approve = False
                    approval_block_reason = f"Approval blocked: {blocked[0]}"

            results.append({
                "event_id": str(event.event_id),
                "employee_id": event.employee_id,
                "worker_name": worker_name,
                "event_type": event.event_type,
                "device_id": event.device.pk,
                "device_name": event.device.device_name,
                "pharmacy_timezone": event.device.pharmacy.timezone or "UTC",
                "device_timestamp": event.device_timestamp.isoformat(),
                "trusted_time_estimate": event.trusted_time_estimate.isoformat() if event.trusted_time_estimate else None,
                "integrity_flags": event.integrity_flags or [],
                "received_at": event.received_at.isoformat(),
                "can_approve": can_approve,
                "approval_block_reason": approval_block_reason,
            })
        return Response(results)


class ManagerDecideKioskReviewView(APIView):
    permission_classes = (IsAuthenticated,)

    def post(self, request):
        try:
            event_uuid = uuid.UUID(str(request.data.get("event_id")))
        except (TypeError, ValueError, AttributeError):
            raise ValidationError({"event_id": "A signed kiosk event UUID is required."})
        decision = str(request.data.get("decision", "")).upper()
        reason = str(request.data.get("reason", "")).strip()
        if decision not in KioskAttendanceReview.Decision.values:
            raise ValidationError({"decision": "Use APPROVED or REJECTED."})
        if not reason:
            raise ValidationError({"reason": "A manager justification is required."})

        try:
            with transaction.atomic():
                try:
                    with transaction.atomic():
                        evidence = get_object_or_404(
                            KioskAttendanceEvent.objects.select_for_update(
                                nowait=True, of=("self",),
                            ).select_related(
                                "device", "device__pharmacy", "employee",
                            ),
                            event_id=event_uuid,
                        )
                except OperationalError as exc:
                    if _is_lock_unavailable_error(exc):
                        return Response(
                            {"code": "CONCURRENT_REVIEW", "detail": "Another review is in progress for this event."},
                            status=409,
                        )
                    raise
                pharmacy = evidence.device.pharmacy
                if not is_authorized_attendance_manager(request.user, pharmacy):
                    return Response({"detail": "Not authorized for this pharmacy."}, status=403)
                if evidence.processing_status != KioskAttendanceEvent.ProcessingStatus.NEEDS_REVIEW:
                    return Response({"code": "EVENT_NOT_PENDING_REVIEW"}, status=409)
                review = KioskAttendanceReview.objects.filter(evidence=evidence).first()
                if review:
                    if review.manager_id != request.user.pk or review.decision != decision:
                        return Response({"code": "REVIEW_ALREADY_DECIDED"}, status=409)
                    if (review.reason or "").strip() != reason:
                        return Response({"code": "REVIEW_ALREADY_DECIDED"}, status=409)
                    if decision == KioskAttendanceReview.Decision.APPROVED:
                        raw_corrected = request.data.get("corrected_timestamp")
                        if not raw_corrected:
                            return Response({"code": "REVIEW_ALREADY_DECIDED"}, status=409)
                        try:
                            req_time = _parse_aware_datetime(raw_corrected, "corrected_timestamp")
                        except DjangoValidationError:
                            return Response({"code": "REVIEW_ALREADY_DECIDED"}, status=409)
                        if review.effective_timestamp != req_time:
                            return Response({"code": "REVIEW_ALREADY_DECIDED"}, status=409)
                    return Response({
                        "decision": review.decision, "review_id": review.pk,
                        "attendance_event_id": review.attendance_event_id,
                    })
                # Legacy NEEDS_REVIEW rows may already have been applied live.
                if evidence.attendance_event_id:
                    return Response({"code": "EVENT_ALREADY_APPLIED"}, status=409)
                effective_time = None
                live_event = None
                if decision == KioskAttendanceReview.Decision.APPROVED:
                    if set(evidence.integrity_flags or []).intersection(BLOCKED_APPROVAL_FLAGS):
                        return Response({"code": "UNTRUSTWORTHY_DEVICE_EVIDENCE"}, status=409)
                    if evidence.employee is None or not evidence.employee.is_active:
                        return Response({"code": "WORKER_NOT_ELIGIBLE"}, status=409)

                    device = (
                        KioskDevice.objects.select_for_update(no_key=True)
                        .extra(where=["1=1 /* FOR UPDATE */"])
                        .get(pk=evidence.device_id)
                    )
                    if not device.is_active or device.revoked_at is not None:
                        return Response({"code": "DEVICE_REVOKED"}, status=409)

                    # Clock-drift evidence is never applied using an untrusted
                    # signed timestamp. The reviewer must supply a corrected
                    # aware timestamp and a written justification.
                    try:
                        effective_time = _parse_aware_datetime(
                            request.data.get("corrected_timestamp"), "corrected_timestamp",
                        )
                    except DjangoValidationError as exc:
                        logger.warning("Invalid corrected kiosk timestamp", exc_info=True)
                        raise ValidationError({
                            "corrected_timestamp": "Use an ISO-8601 timestamp with an offset.",
                        }) from exc

                    if effective_time > timezone.now():
                        raise ValidationError({
                            "corrected_timestamp": "Corrected timestamp cannot be in the future.",
                        })

                    open_session = (
                        AttendanceSession.objects.select_for_update()
                        .filter(user=evidence.employee, ended_at__isnull=True)
                        .first()
                    )
                    if open_session:
                        latest_event = open_session.events.order_by("-occurred_at", "-id").first()
                        if latest_event and effective_time < latest_event.occurred_at:
                            raise ValidationError({
                                "corrected_timestamp": "Corrected timestamp cannot precede the latest event in the active session.",
                            })
                        if effective_time < open_session.started_at:
                            raise ValidationError({
                                "corrected_timestamp": "Corrected timestamp cannot precede session start.",
                            })

                    live_event = _apply_business_event(
                        device, evidence.employee, evidence.event_type,
                        effective_time, evidence.shift_id,
                    )
                review = KioskAttendanceReview.objects.create(
                    evidence=evidence, manager=request.user, decision=decision,
                    reason=reason, effective_timestamp=effective_time,
                    attendance_event=live_event,
                )
                return Response({
                    "decision": review.decision, "review_id": review.pk,
                    "attendance_event_id": review.attendance_event_id,
                })
        except OperationalError as exc:
            # Device/session lock timeout: the outer transaction has rolled back, so the client may retry.
            if _is_lock_unavailable_error(exc):
                return Response(
                    {"code": "CONCURRENT_REVIEW", "detail": "Another review is in progress for this event."},
                    status=409,
                )
            raise
        except DjangoValidationError as exc:
            logger.warning("Kiosk attendance application failed validation", exc_info=True)
            raise ValidationError({"detail": "Attendance application failed validation."}) from exc
        except IntegrityError as exc:
            raise ValidationError({"detail": "Attendance application failed integrity checks."})
