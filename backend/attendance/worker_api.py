"""A worker's own attendance API: status, clock in and out, breaks and their kiosk PIN."""
from django.core.exceptions import (
    PermissionDenied as DjangoPermissionDenied,
    ValidationError as DjangoValidationError,
)
from rest_framework import permissions, status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from rest_framework.views import APIView
from attendance.credentials import verify_signed_pharmacy_qr, worker_update_own_pin
from attendance.throttles import WorkerClockInThrottle, WorkerClockOutThrottle
from attendance.transitions import clock_in, clock_out, end_break, get_active_session_status, start_break
from memberships.models import Membership
from attendance.api_support import _unexpected_error_response


class WorkerAttendanceStatusView(APIView):
    """
    GET /api/attendance/worker/status/
    Authenticated worker fetches their active session, break state, and provisional status.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        status_info = get_active_session_status(request.user)
        if status_info is None:
            return Response({
                "has_active_session": False,
                "session_id": None,
                "pharmacy_id": None,
                "pharmacy_name": None,
                "started_at": None,
                "is_provisional": False,
                "is_on_break": False,
                "last_event_type": None,
            })
        return Response({
            "has_active_session": True,
            "session_id": status_info["session_id"],
            "pharmacy_id": status_info["pharmacy_id"],
            "pharmacy_name": status_info["pharmacy_name"],
            "started_at": status_info["started_at"].isoformat() if status_info["started_at"] else None,
            "is_provisional": status_info["is_provisional"],
            "is_on_break": status_info["is_on_break"],
            "last_event_type": status_info["last_event_type"],
        })


class WorkerClockInView(APIView):
    """
    POST /api/attendance/worker/clock-in/
    Worker scans a signed QR code displayed on the pharmacy kiosk.
    Body: {"qr_token": str}
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [WorkerClockInThrottle]

    def post(self, request):
        qr_token = request.data.get("qr_token")
        if not qr_token:
            return Response({"error": "qr_token is required."}, status=status.HTTP_400_BAD_REQUEST)

        valid, qr_session, reason = verify_signed_pharmacy_qr(qr_token)
        if not valid:
            return Response({"error": f"QR verification failed: {reason}"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            session, in_event = clock_in(
                user=request.user,
                pharmacy=qr_session.pharmacy,
                signed_qr_token=qr_token,
            )
            return Response({
                "session_id": session.id,
                "pharmacy_id": session.pharmacy_id,
                "pharmacy_name": session.pharmacy.name,
                "started_at": session.started_at.isoformat(),
                "is_provisional": session.is_provisional,
                "status": "CLOCKED_IN",
            }, status=status.HTTP_201_CREATED)
        except (DjangoValidationError, PermissionDenied) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return _unexpected_error_response(request, "clock in")


class WorkerBreakStartView(APIView):
    """
    POST /api/attendance/worker/break-start/
    Worker initiates an in-app break.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            event = start_break(request.user)
            return Response({
                "status": "ON_BREAK",
                "event_id": event.id,
                "started_at": event.occurred_at.isoformat(),
            })
        except DjangoValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class WorkerBreakEndView(APIView):
    """
    POST /api/attendance/worker/break-end/
    Worker ends their in-app break.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        try:
            event = end_break(request.user)
            return Response({
                "status": "WORKING",
                "event_id": event.id,
                "ended_at": event.occurred_at.isoformat(),
            })
        except DjangoValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class WorkerClockOutView(APIView):
    """
    POST /api/attendance/worker/clock-out/
    Worker scans a signed QR code at the pharmacy kiosk to finish their shift.
    Body: {"qr_token": str}
    """
    permission_classes = [permissions.IsAuthenticated]
    throttle_classes = [WorkerClockOutThrottle]

    def post(self, request):
        qr_token = request.data.get("qr_token")
        if not qr_token:
            return Response({"error": "qr_token is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            session, out_event = clock_out(
                user=request.user,
                signed_qr_token=qr_token,
            )
            return Response({
                "session_id": session.id,
                "pharmacy_id": session.pharmacy_id,
                "pharmacy_name": session.pharmacy.name,
                "started_at": session.started_at.isoformat(),
                "ended_at": session.ended_at.isoformat() if session.ended_at else None,
                "status": "CLOCKED_OUT",
            })
        except (DjangoValidationError, PermissionDenied) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return _unexpected_error_response(request, "clock out")


class WorkerUpdatePinView(APIView):
    """
    POST /api/client-profile/attendance/worker/pin/update/
    Logged-in worker sets or changes their attendance PIN from the web/mobile app.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        memberships = Membership.objects.filter(
            user=request.user, is_active=True, status=Membership.Status.ACCEPTED,
        ).select_related("pharmacy", "worker_pin").order_by("pharmacy__name", "pk")
        return Response({"pharmacies": [{
            "id": membership.pharmacy_id,
            "name": membership.pharmacy.name,
            "has_pin": bool(getattr(membership, "worker_pin", None)
                            and membership.worker_pin.pin_hash),
        } for membership in memberships]})

    def post(self, request):
        new_pin = request.data.get("new_pin")
        if not new_pin:
            return Response({"error": "new_pin is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            worker_pin = worker_update_own_pin(request.user, new_pin, request.data.get("pharmacy_id"))
            return Response({
                "success": True,
                "message": "Attendance PIN updated successfully.",
                "pharmacy_id": worker_pin.membership.pharmacy_id,
            }, status=status.HTTP_200_OK)
        except (DjangoPermissionDenied, PermissionDenied) as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") and e.messages else str(e)
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return _unexpected_error_response(request, "update the PIN")
