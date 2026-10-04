"""Attendance manager API: pending attendances, approval, rejection, corrections and the session timeline.

The kiosk and worker APIs live in attendance.kiosk_api and attendance.worker_api; their names are re-exported
here for urls.py and existing importers."""
import logging


from django.contrib.auth import get_user_model
from django.core.exceptions import (
    ObjectDoesNotExist,
    PermissionDenied as DjangoPermissionDenied,
    ValidationError as DjangoValidationError,
)
from django.shortcuts import get_object_or_404
from django.utils import timezone
from django.utils.dateparse import parse_datetime
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied, ValidationError
from rest_framework.response import Response
from rest_framework.views import APIView

User = get_user_model()

from attendance.approvals import (
    approve_provisional_attendance,
    create_attendance_correction,
    get_effective_session_timeline,
    get_pending_provisional_attendances,
    reject_provisional_attendance,
)
from workforce.roster.permissions import is_authorized_attendance_manager
from memberships.models import Membership  # noqa: F401  (ownership contract)
from organizations.models import Pharmacy
from shifts.models import Shift  # noqa: F401  (ownership contract)
from attendance.models import AttendanceSession

from attendance.api_support import _get_kiosk_device_from_request, _unexpected_error_response  # noqa: F401
from attendance.kiosk_api import (  # noqa: F401  (historical import path)
    KioskActivateView,
    KioskRequestPairingCodeView,
    KioskPairWithCodeView,
    KioskOfflineSyncView,
    KioskConfigView,
    KioskSelfRevokeView,
    ManagerKioskDevicesView,
    KioskWorkerEnrolView,
    KioskQRView,
    KioskPinClockView,
    KioskWorkerPinStatusView,
    KioskWorkerSetupPinView,
    KioskActiveStaffView,
    KioskStaffBreakActionView,
)
from attendance.worker_api import (  # noqa: F401  (historical import path)
    WorkerAttendanceStatusView,
    WorkerClockInView,
    WorkerBreakStartView,
    WorkerBreakEndView,
    WorkerClockOutView,
    WorkerUpdatePinView,
)

logger = logging.getLogger(__name__)


class ManagerPendingAttendancesView(APIView):
    """
    GET /api/attendance/manager/pending/?pharmacy_id=<id>
    Authorized destination manager retrieves pending provisional attendances.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        pharmacy_id = request.query_params.get("pharmacy_id")
        if not pharmacy_id:
            return Response({"error": "pharmacy_id query param is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            pharmacy_id = int(pharmacy_id)
        except (TypeError, ValueError):
            return Response(
                {"error": "pharmacy_id must be an integer."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pharmacy = get_object_or_404(Pharmacy, pk=pharmacy_id)
        if not is_authorized_attendance_manager(request.user, pharmacy):
            raise PermissionDenied("You are not authorized to manage attendance for this pharmacy.")

        pending_qs = get_pending_provisional_attendances(request.user, pharmacy)
        results = []
        for item in pending_qs:
            session = item.session
            worker = session.user
            results.append({
                "provisional_id": item.id,
                "session_id": session.id,
                "worker_id": worker.id,
                "worker_name": worker.get_full_name() or worker.username,
                "worker_email": worker.email,
                "started_at": session.started_at.isoformat(),
                "ended_at": session.ended_at.isoformat() if session.ended_at else None,
                "cover_type": item.cover_type,
                "source_pharmacy_name": (
                    session.source_membership.pharmacy.name
                    if (session.source_membership and session.source_membership.pharmacy)
                    else None
                ),
                "status": item.status,
                "decision_reason": item.decision_reason,
                "created_at": item.created_at.isoformat(),
            })
        return Response(results)


class ManagerApproveAttendanceView(APIView):
    """
    POST /api/attendance/manager/approve/
    Authorized manager approves provisional attendance and backfills shift/slot/assignment.
    Body: {"provisional_id": int, "reason": str}
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        provisional_id = request.data.get("provisional_id")
        reason = request.data.get("reason", "")

        if not provisional_id:
            return Response({"error": "provisional_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            provisional_id = int(provisional_id)
        except (TypeError, ValueError):
            return Response({"error": "provisional_id must be an integer."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            prov = approve_provisional_attendance(
                manager_user=request.user,
                provisional_id=provisional_id,
                reason=reason,
            )
            assignment = prov.backfill_assignment
            return Response({
                "status": "APPROVED",
                "assignment_id": assignment.id,
                "slot_id": assignment.slot_id,
                "shift_id": assignment.slot.shift_id,
            })
        except (PermissionDenied, DjangoPermissionDenied) as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except (DjangoValidationError, ValidationError) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except ObjectDoesNotExist:
            return Response({"error": "Provisional attendance not found."}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return _unexpected_error_response(request, "approve the attendance")


class ManagerRejectAttendanceView(APIView):
    """
    POST /api/attendance/manager/reject/
    Authorized manager rejects provisional attendance with reason; retains evidence.
    Body: {"provisional_id": int, "reason": str}
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        provisional_id = request.data.get("provisional_id")
        reason = request.data.get("reason")

        if not provisional_id or not reason:
            return Response({"error": "provisional_id and reason are required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            provisional_id = int(provisional_id)
        except (TypeError, ValueError):
            return Response({"error": "provisional_id must be an integer."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            provisional = reject_provisional_attendance(
                manager_user=request.user,
                provisional_id=provisional_id,
                reason=reason,
            )
            return Response({
                "status": "REJECTED",
                "provisional_id": provisional.id,
                "reason": provisional.decision_reason,
            })

        except (PermissionDenied, DjangoPermissionDenied) as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except (DjangoValidationError, ValidationError) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except ObjectDoesNotExist:
            return Response({"error": "Provisional attendance not found."}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return _unexpected_error_response(request, "reject the attendance")


class ManagerCreateCorrectionView(APIView):
    """
    POST /api/attendance/manager/correct/
    Authorized manager submits an append-only manual timestamp correction.
    Body: {"event_id": int, "corrected_timestamp": "ISO-8601", "reason": str}
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        event_id = request.data.get("event_id")
        timestamp_str = request.data.get("corrected_timestamp")
        reason = request.data.get("reason")

        if not event_id or not timestamp_str or not reason:
            return Response({"error": "event_id, corrected_timestamp, and reason are required."}, status=status.HTTP_400_BAD_REQUEST)

        corrected_dt = parse_datetime(timestamp_str)
        if not corrected_dt:
            return Response({"error": "Invalid ISO-8601 datetime format."}, status=status.HTTP_400_BAD_REQUEST)

        if timezone.is_naive(corrected_dt):
            corrected_dt = timezone.make_aware(corrected_dt, timezone.get_current_timezone())

        try:
            event_id = int(event_id)
        except (TypeError, ValueError):
            return Response({"error": "event_id must be an integer."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            correction = create_attendance_correction(
                manager_user=request.user,
                event_id=event_id,
                corrected_timestamp=corrected_dt,
                reason=reason,
            )
            return Response({
                "status": "CORRECTED",
                "correction_id": correction.id,
                "event_id": correction.original_event_id,
                "corrected_timestamp": correction.corrected_timestamp.isoformat(),
                "reason": correction.reason,
            })
        except (PermissionDenied, DjangoPermissionDenied) as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except (DjangoValidationError, ValidationError) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except ObjectDoesNotExist:
            return Response({"error": "Attendance event not found."}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return _unexpected_error_response(request, "create the correction")


class ManagerSessionTimelineView(APIView):
    """
    GET /api/attendance/manager/timeline/<int:session_id>/
    Authorized manager views the full effective timeline and correction audit history.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, session_id):
        session = get_object_or_404(AttendanceSession, pk=session_id)
        if not is_authorized_attendance_manager(request.user, session.pharmacy):
            raise PermissionDenied("You are not authorized to view attendance timeline for this pharmacy.")

        timeline = get_effective_session_timeline(session)
        return Response({
            "session_id": session.id,
            "pharmacy_id": session.pharmacy_id,
            "pharmacy_name": session.pharmacy.name,
            "worker_id": session.user_id,
            "worker_name": session.user.get_full_name() or session.user.username,
            "is_provisional": session.is_provisional,
            "timeline": timeline,
        })
