"""Pharmacy-authorized review of signed, provisional kiosk attendance evidence."""
import uuid
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import IntegrityError, transaction
from django.shortcuts import get_object_or_404
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from rest_framework.views import APIView
from attendance.models import KioskAttendanceEvent, KioskAttendanceReview
from attendance.approvals import is_authorized_attendance_manager
from attendance.protocol import _apply_business_event, _parse_aware_datetime
from organizations.models import Pharmacy

BLOCKED_APPROVAL_FLAGS = {
    "HASH_CHAIN_MISMATCH", "SEQUENCE_GAP", "UNEXPECTED_INITIAL_HASH",
    "DEVICE_REVOKED_DRAIN",
}


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
            ).select_related("device", "employee").order_by("received_at")[:100]
        )
        return Response([
            {
                "event_id": str(event.event_id), "employee_id": event.employee_id,
                "event_type": event.event_type,
                "device_timestamp": event.device_timestamp.isoformat(),
                "trusted_time_estimate": event.trusted_time_estimate.isoformat() if event.trusted_time_estimate else None,
                "integrity_flags": event.integrity_flags,
                "received_at": event.received_at.isoformat(),
            }
            for event in events
        ])


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
                evidence = get_object_or_404(
                    KioskAttendanceEvent.objects.select_for_update(of=("self",)).select_related(
                        "device", "device__pharmacy", "employee",
                    ),
                    event_id=event_uuid,
                )
                pharmacy = evidence.device.pharmacy
                if not is_authorized_attendance_manager(request.user, pharmacy):
                    return Response({"detail": "Not authorized for this pharmacy."}, status=403)
                if evidence.processing_status != KioskAttendanceEvent.ProcessingStatus.NEEDS_REVIEW:
                    return Response({"code": "EVENT_NOT_PENDING_REVIEW"}, status=409)
                review = KioskAttendanceReview.objects.filter(evidence=evidence).first()
                if review:
                    if review.decision != decision:
                        return Response({"code": "REVIEW_ALREADY_DECIDED"}, status=409)
                    return Response({
                        "decision": review.decision, "review_id": review.pk,
                        "attendance_event_id": review.attendance_event_id,
                    })
                effective_time = None
                live_event = None
                if decision == KioskAttendanceReview.Decision.APPROVED:
                    if set(evidence.integrity_flags or []).intersection(BLOCKED_APPROVAL_FLAGS):
                        return Response({"code": "UNTRUSTWORTHY_DEVICE_EVIDENCE"}, status=409)
                    if evidence.employee is None or not evidence.employee.is_active:
                        return Response({"code": "WORKER_NOT_ELIGIBLE"}, status=409)
                    # Clock-drift evidence is never applied using an untrusted
                    # signed timestamp. The reviewer must supply a corrected
                    # aware timestamp and a written justification.
                    try:
                        effective_time = _parse_aware_datetime(
                            request.data.get("corrected_timestamp"), "corrected_timestamp",
                        )
                    except DjangoValidationError as exc:
                        raise ValidationError({"corrected_timestamp": str(exc)})
                    live_event = _apply_business_event(
                        evidence.device, evidence.employee, evidence.event_type,
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
        except DjangoValidationError as exc:
            raise ValidationError({"detail": str(exc)})
        except IntegrityError as exc:
            raise ValidationError({"detail": "Attendance application failed integrity checks."})
