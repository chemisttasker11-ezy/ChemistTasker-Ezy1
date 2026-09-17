"""
Attendance REST API views connecting to:
- attendance_credentials.py
- attendance_transitions.py
- attendance_approvals.py
"""
import hashlib
from datetime import date, datetime, timedelta

from django.contrib.auth import get_user_model
from django.core.exceptions import (
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

from .attendance_approvals import (
    approve_provisional_attendance,
    create_attendance_correction,
    get_effective_session_timeline,
    get_pending_provisional_attendances,
    is_authorized_attendance_manager,
    reject_provisional_attendance,
)
from .attendance_credentials import (
    activate_kiosk_device,
    authenticate_kiosk_device,
    generate_kiosk_pairing_code,
    is_authorized_kiosk_manager,
    generate_signed_pharmacy_qr,
    redeem_kiosk_pairing_code,
    send_worker_pin_setup_code,
    setup_worker_kiosk_pin,
    verify_kiosk_worker_pin,
    verify_signed_pharmacy_qr,
    worker_update_own_pin,
)
from .attendance_throttles import (
    KioskPINRateThrottle,
    KioskQRRateThrottle,
    WorkerClockInThrottle,
    WorkerClockOutThrottle,
)
from .attendance_transitions import (
    clock_in,
    clock_out,
    end_break,
    get_active_session_status,
    start_break,
)
from .attendance_protocol import sync_offline_batch
from .models import (
    AttendanceEvent,
    AttendanceSession,
    KioskDevice,
    Membership,
    Pharmacy,
    ProvisionalAttendance,
    RosterPeriod,
    RosterAcknowledgement,
    RosterActionAudit,
    RosterPublicationAudit,
    RosterTemplate,
    Shift,
    ShiftSlotAssignment,
    WorkerPIN,
    WorkerShiftRequest,
)
from .roster_worker_actions import (
    approve_cover_replacement,
    approve_direct_swap,
    reject_worker_shift_request,
    release_worker_from_assignment,
    request_direct_swap,
    submit_cover_request,
)
from .roster_services import (
    archive_roster_period,
    acknowledge_roster_period,
    apply_roster_template,
    bulk_edit_roster_period,
    copy_roster_week,
    create_roster_template,
    get_or_create_roster_period,
    get_roster_acknowledgement_status,
    get_roster_period_assignments,
    get_roster_period_grid,
    get_worker_published_roster,
    publish_roster_period,
    save_period_as_template,
    unpublish_roster_period,
    validate_roster_period,
)


def _get_kiosk_device_from_request(request):
    """
    Extracts and authenticates a KioskDevice from request headers, META, or body.
    Supports:
    - X-Device-Token: ctk_kiosk_...
    - HTTP_X_DEVICE_TOKEN: ctk_kiosk_...
    - Authorization: Bearer ctk_kiosk_...
    - body: {"device_token": "ctk_kiosk_..."}
    """
    token = request.headers.get("X-Device-Token") if hasattr(request, "headers") else None
    if not token:
        token = request.META.get("HTTP_X_DEVICE_TOKEN")
    if not token:
        auth_header = (request.headers.get("Authorization", "") if hasattr(request, "headers") else "") or request.META.get("HTTP_AUTHORIZATION", "")
        if auth_header.startswith("Bearer ctk_kiosk_"):
            token = auth_header[7:].strip()
    if not token and hasattr(request, "data") and isinstance(request.data, dict):
        token = request.data.get("device_token")

    if not token:
        raise PermissionDenied("Kiosk device token required.")

    device = authenticate_kiosk_device(token)
    if not device:
        raise PermissionDenied("Invalid or revoked kiosk device.")
    return device


# ---------------------------------------------------------------------------
# Kiosk Endpoints
# ---------------------------------------------------------------------------

class KioskActivateView(APIView):
    """
    POST /api/attendance/kiosk/activate/
    Owner or manager activates a new kiosk terminal for their pharmacy.
    Returns restricted device token (shown once to store locally).
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        pharmacy_id = request.data.get("pharmacy_id")
        device_name = request.data.get("device_name", "Pharmacy Counter Terminal")

        if not pharmacy_id:
            return Response({"error": "pharmacy_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        pharmacy = get_object_or_404(Pharmacy, id=pharmacy_id)

        try:
            device, raw_token = activate_kiosk_device(
                user=request.user,
                pharmacy=pharmacy,
                device_name=device_name,
                public_signing_key=request.data.get("public_signing_key", ""),
                platform=request.data.get("platform", ""),
                app_version=request.data.get("app_version", ""),
            )

            return Response({
                "device_id": device.id,
                "device_token": raw_token,
                "device_name": device.device_name,
                "pharmacy_id": pharmacy.id,
                "pharmacy_name": pharmacy.name,
                "activated_at": device.activated_at.isoformat(),
                "installation_id": str(device.installation_id),
            }, status=status.HTTP_201_CREATED)
        except (DjangoPermissionDenied, PermissionDenied) as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class KioskRequestPairingCodeView(APIView):
    """
    POST /api/client-profile/attendance/kiosk/pairing/request/
    Owner or Manager requests a single-use 6-digit pairing code.
    Dispatches a push notification to their mobile app and records an in-app alert.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        from django.db.models import Q
        from users.models import OrganizationMembership
        from .models import PharmacyAdmin

        pharmacies = Pharmacy.objects.select_related("owner").order_by("name", "pk")
        if not request.user.is_superuser:
            admin_ids = PharmacyAdmin.objects.filter(
                user=request.user, is_active=True,
                admin_level__in=[PharmacyAdmin.AdminLevel.OWNER, PharmacyAdmin.AdminLevel.MANAGER],
            ).values_list("pharmacy_id", flat=True)
            org_ids = OrganizationMembership.objects.filter(
                user=request.user, role="ORG_ADMIN",
            ).values_list("organization_id", flat=True)
            pharmacies = pharmacies.filter(
                Q(owner__user=request.user) | Q(pk__in=admin_ids) | Q(organization_id__in=org_ids)
            )
        return Response({"pharmacies": [{"id": pharmacy.pk, "name": pharmacy.name,
                                         "timezone": pharmacy.timezone}
            for pharmacy in pharmacies if is_authorized_kiosk_manager(request.user, pharmacy)]})

    def post(self, request):
        pharmacy_id = request.data.get("pharmacy_id")
        device_name = request.data.get("device_name", "Pharmacy Counter Terminal")

        if not pharmacy_id:
            return Response({"error": "pharmacy_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        pharmacy = get_object_or_404(Pharmacy, id=pharmacy_id)

        try:
            code = generate_kiosk_pairing_code(
                user=request.user,
                pharmacy=pharmacy,
                device_name=device_name,
            )
            return Response({
                "success": True,
                "message": f"Pairing code sent to your mobile device for {pharmacy.name}.",
                "expires_in_seconds": 900,
                "pairing_code": code,
                "pharmacy_id": pharmacy.id,
                "pharmacy_name": pharmacy.name,
            }, status=status.HTTP_200_OK)
        except (DjangoPermissionDenied, PermissionDenied) as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)
        except DjangoValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class KioskPairWithCodeView(APIView):
    """
    POST /api/client-profile/attendance/kiosk/pairing/pair/
    Public terminal endpoint: Pairs a physical counter tablet using the 6-digit code.
    Single-use: The code is consumed immediately upon successful activation.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        pairing_code = request.data.get("pairing_code")
        device_name = request.data.get("device_name")

        if not pairing_code:
            return Response({"error": "pairing_code is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            device, raw_token = redeem_kiosk_pairing_code(
                pairing_code=pairing_code,
                device_name=device_name,
                public_signing_key=request.data.get("public_signing_key", ""),
                platform=request.data.get("platform", ""),
                app_version=request.data.get("app_version", ""),
            )
            return Response({
                "device_id": device.id,
                "device_token": raw_token,
                "device_name": device.device_name,
                "pharmacy_id": device.pharmacy.id,
                "pharmacy_name": device.pharmacy.name,
                "activated_at": device.activated_at.isoformat(),
                "installation_id": str(device.installation_id),
            }, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") and e.messages else str(e)
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class KioskOfflineSyncView(APIView):
    """Accept a signed, idempotent batch from a local-first kiosk outbox."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        try:
            device = _get_kiosk_device_from_request(request)
            if device.client_kind != "NATIVE_OFFLINE":
                raise PermissionDenied("This device is not authorized for offline attendance sync.")
            result = sync_offline_batch(
                device,
                request.data.get("events"),
                app_version=request.data.get("app_version", ""),
            )
            return Response(result, status=status.HTTP_200_OK)
        except (DjangoPermissionDenied, PermissionDenied) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)
        except DjangoValidationError as exc:
            message = "; ".join(exc.messages) if hasattr(exc, "messages") else str(exc)
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)


class KioskConfigView(APIView):
    """Return restricted device policy and a fresh server-time anchor."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def get(self, request):
        try:
            device = _get_kiosk_device_from_request(request)
            now = timezone.now()
            device.last_seen_at = now
            device.save(update_fields=["last_seen_at"])
            return Response({
                "device_id": str(device.installation_id),
                "pharmacy_id": device.pharmacy_id,
                "server_time": now.isoformat(),
                "max_offline_hours": 24,
            })
        except (DjangoPermissionDenied, PermissionDenied) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)


class KioskWorkerEnrolView(APIView):
    """Verify an established worker PIN without creating attendance."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [KioskPINRateThrottle]

    def post(self, request):
        try:
            device = _get_kiosk_device_from_request(request)
            identifier = request.data.get("identifier")
            pin = request.data.get("pin")
            if not identifier or not pin:
                return Response(
                    {"error": "identifier and pin are required."},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            is_valid, membership, reason = verify_kiosk_worker_pin(
                kiosk_device=device,
                user_identifier=identifier,
                raw_pin=pin,
            )
            if not is_valid or membership is None:
                if reason == "PIN_LOCKED":
                    return Response(
                        {"error": "Worker PIN is temporarily locked.", "locked": True},
                        status=status.HTTP_400_BAD_REQUEST,
                    )
                return Response(
                    {"error": "Invalid worker identifier or PIN.", "locked": False},
                    status=status.HTTP_400_BAD_REQUEST,
                )

            worker = membership.user
            active_session = get_active_session_status(worker)
            if active_session and active_session["pharmacy_id"] != device.pharmacy_id:
                return Response(
                    {"error": "Worker has an active attendance session at another pharmacy."},
                    status=status.HTTP_409_CONFLICT,
                )
            return Response({
                "worker_id": worker.id,
                "worker_name": worker.get_full_name() or worker.username,
                "pharmacy_id": device.pharmacy_id,
                "is_clocked_in": active_session is not None,
                "is_on_break": bool(active_session and active_session["is_on_break"]),
                "verified_at": timezone.now().isoformat(),
            })
        except (DjangoPermissionDenied, PermissionDenied) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)
        except DjangoValidationError as exc:
            message = "; ".join(exc.messages) if hasattr(exc, "messages") else str(exc)
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)


class KioskQRView(APIView):
    """
    POST /api/attendance/kiosk/qr/
    Device requests a dynamic HMAC-signed QR token with TTL.
    Authenticated via device token.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [KioskQRRateThrottle]

    def post(self, request):
        try:
            device = _get_kiosk_device_from_request(request)
            qr_data = generate_signed_pharmacy_qr(device, ttl_seconds=30)
            return Response({
                "qr_token": qr_data["signed_token"],
                "expires_at": qr_data["expires_at"].isoformat(),
                "pharmacy_id": qr_data["pharmacy_id"],
                "pharmacy_name": device.pharmacy.name,
                "refresh_interval_seconds": 30,
            })
        except (DjangoPermissionDenied, PermissionDenied) as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)



class KioskPinClockView(APIView):
    """
    POST /api/attendance/kiosk/pin-clock/
    Staff enters personal PIN and identifier at kiosk to clock in or clock out.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]
    throttle_classes = [KioskPINRateThrottle]

    def post(self, request):
        try:
            device = _get_kiosk_device_from_request(request)
            identifier = request.data.get("identifier")
            pin = request.data.get("pin")

            if not identifier or not pin:
                return Response({"error": "identifier and pin are required."}, status=status.HTTP_400_BAD_REQUEST)

            is_valid, membership, reason = verify_kiosk_worker_pin(
                kiosk_device=device,
                user_identifier=identifier,
                raw_pin=pin,
            )

            if not is_valid:
                if reason == "PIN_LOCKED":
                    return Response({
                        "error": "Account is temporarily locked due to too many failed attempts. Please try again later.",
                        "locked": True,
                    }, status=status.HTTP_400_BAD_REQUEST)
                return Response({
                    "error": "Invalid worker identifier or PIN.",
                    "locked": False,
                }, status=status.HTTP_400_BAD_REQUEST)

            worker = membership.user

            # Check existing open session at this pharmacy
            status_info = get_active_session_status(worker)
            if status_info is not None and status_info["pharmacy_id"] == device.pharmacy_id:
                # Clock out
                session, out_event = clock_out(
                    user=worker,
                    kiosk_device=device,
                    raw_pin=pin,
                    user_identifier=identifier,
                )
                action_name = "CLOCKED_OUT"
                ended_at = session.ended_at.isoformat() if session.ended_at else None
            else:
                # Clock in
                session, in_event = clock_in(
                    user=worker,
                    pharmacy=device.pharmacy,
                    kiosk_device=device,
                    raw_pin=pin,
                    user_identifier=identifier,
                )
                action_name = "CLOCKED_IN"
                ended_at = None

            return Response({
                "action": action_name,
                "worker_id": worker.id,
                "worker_name": worker.get_full_name() or worker.username,
                "session_id": session.id,
                "started_at": session.started_at.isoformat(),
                "ended_at": ended_at,
                "is_provisional": session.is_provisional,
                "pharmacy_name": device.pharmacy.name,
            })

        except (DjangoPermissionDenied, PermissionDenied) as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)
        except DjangoValidationError as e:
            msg = e.message if hasattr(e, "message") else str(e)
            is_locked = "locked" in msg.lower()
            return Response({
                "error": msg,
                "locked": is_locked,
            }, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class KioskWorkerPinStatusView(APIView):
    """
    POST /api/client-profile/attendance/kiosk/worker-pin/status/
    Kiosk checks if a worker entering their Email or Staff ID has an active PIN set.
    If no PIN is set, automatically generates and dispatches an OTP to their email.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        try:
            device = _get_kiosk_device_from_request(request)
            identifier = request.data.get("identifier")
            if not identifier:
                return Response({"error": "Staff Email or ID is required."}, status=status.HTTP_400_BAD_REQUEST)

            from .attendance_credentials import _find_kiosk_candidate_membership
            membership = _find_kiosk_candidate_membership(device, identifier, require_pin=False)
            if membership is None:
                return Response({
                    "error": "Staff member not found. Please check your email or staff ID.",
                    "found": False,
                }, status=status.HTTP_404_NOT_FOUND)

            worker = membership.user
            has_pin = hasattr(membership, "worker_pin") and membership.worker_pin and bool(membership.worker_pin.pin_hash)
            force_reset = bool(request.data.get("reset") or request.data.get("force_reset"))
            resend = bool(request.data.get("resend") or request.data.get("force_new"))

            if has_pin and not force_reset:
                return Response({
                    "status": "READY_FOR_PIN",
                    "has_pin": True,
                    "worker_id": worker.id,
                    "worker_name": worker.get_full_name() or worker.username,
                })
            else:
                # First time or Reset: check if code already sent or dispatch 6-digit OTP code to email
                code_data = send_worker_pin_setup_code(device, identifier, force_new=resend)
                code_already_sent = code_data.get("code_already_sent", False)
                if code_already_sent:
                    message = f"An active 6-digit verification code was already sent to {code_data['masked_email']} within the last 10 minutes. Please enter it below, or tap 'Resend Code' to receive a new one."
                else:
                    message = f"A 6-digit verification code was sent to {code_data['masked_email']}."

                return Response({
                    "status": "NEEDS_SETUP",
                    "has_pin": has_pin,
                    "worker_id": code_data["worker_id"],
                    "worker_name": code_data["worker_name"],
                    "masked_email": code_data["masked_email"],
                    "code_already_sent": code_already_sent,
                    "message": message,
                })

        except (DjangoPermissionDenied, PermissionDenied) as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") and e.messages else str(e)
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class KioskWorkerSetupPinView(APIView):
    """
    POST /api/client-profile/attendance/kiosk/worker-pin/setup/
    Kiosk verifies email OTP, sets the worker's PIN, and immediately clocks them in.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        try:
            device = _get_kiosk_device_from_request(request)
            identifier = request.data.get("identifier")
            verification_code = request.data.get("verification_code")
            new_pin = request.data.get("new_pin")

            if not identifier or not verification_code or not new_pin:
                return Response({
                    "error": "Staff identifier, verification code, and new PIN are required.",
                }, status=status.HTTP_400_BAD_REQUEST)

            membership, worker_pin = setup_worker_kiosk_pin(
                kiosk_device=device,
                user_identifier=identifier,
                verification_code=verification_code,
                new_pin=new_pin,
            )

            worker = membership.user

            # Automatically clock in the worker
            session, in_event = clock_in(
                user=worker,
                pharmacy=device.pharmacy,
                kiosk_device=device,
                raw_pin=new_pin,
                user_identifier=identifier,
            )

            return Response({
                "success": True,
                "action": "CLOCKED_IN",
                "worker_id": worker.id,
                "worker_name": worker.get_full_name() or worker.username,
                "session_id": session.id,
                "started_at": session.started_at.isoformat(),
                "is_provisional": session.is_provisional,
                "pharmacy_name": device.pharmacy.name,
                "message": "PIN created successfully! You are now clocked in.",
            }, status=status.HTTP_201_CREATED)

        except (DjangoPermissionDenied, PermissionDenied) as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") and e.messages else str(e)
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class KioskActiveStaffView(APIView):
    """
    POST or GET /api/client-profile/attendance/kiosk/active-staff/
    Returns list of all staff members currently clocked in at this kiosk's pharmacy,
    including their break status (working vs on-break) and break start time.
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def _get_response(self, request):
        try:
            device = _get_kiosk_device_from_request(request)
            pharmacy = device.pharmacy

            now = timezone.now()
            # Fetch all active open sessions at this pharmacy
            active_sessions = (
                AttendanceSession.objects.filter(
                    pharmacy=pharmacy,
                    ended_at__isnull=True,
                )
                .select_related("user")
                .prefetch_related("events")
                .order_by("started_at")
            )

            # Also fetch memberships for roles
            user_ids = [s.user_id for s in active_sessions]
            memberships = {
                m.user_id: m
                for m in Membership.objects.filter(
                    pharmacy=pharmacy,
                    user_id__in=user_ids,
                    is_active=True,
                )
            }

            # Pre-fetch WorkerPIN for whether PIN exists
            worker_pins = {
                wp.membership_id: wp
                for wp in WorkerPIN.objects.filter(
                    membership_id__in=[m.id for m in memberships.values()],
                    is_enabled=True,
                )
            }

            staff_list = []
            for session in active_sessions:
                user = session.user
                mem = memberships.get(user.id)
                wpin = worker_pins.get(mem.id) if mem else None

                # Check last event for break status
                events = sorted(session.events.all(), key=lambda e: (e.occurred_at, e.id), reverse=True)
                last_event = events[0] if events else None

                is_on_break = (
                    last_event is not None
                    and last_event.event_type == AttendanceEvent.EventType.BREAK_START
                )
                break_started_at = last_event.occurred_at.isoformat() if is_on_break and last_event else None
                break_elapsed_seconds = (
                    int((now - last_event.occurred_at).total_seconds())
                    if is_on_break and last_event
                    else 0
                )

                staff_list.append({
                    "worker_id": user.id,
                    "worker_name": user.get_full_name() or user.username,
                    "email": user.email,
                    "role": mem.role if mem else "STAFF",
                    "session_id": session.id,
                    "started_at": session.started_at.isoformat(),
                    "is_on_break": is_on_break,
                    "break_started_at": break_started_at,
                    "break_elapsed_seconds": break_elapsed_seconds,
                    "has_pin": bool(wpin and wpin.pin_hash),
                })

            return Response({
                "pharmacy_id": pharmacy.id,
                "pharmacy_name": pharmacy.name,
                "staff": staff_list,
                "server_time": now.isoformat(),
            })

        except (DjangoPermissionDenied, PermissionDenied) as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)

    def get(self, request):
        return self._get_response(request)

    def post(self, request):
        return self._get_response(request)


class KioskStaffBreakActionView(APIView):
    """
    POST /api/client-profile/attendance/kiosk/break/
    Kiosk staff member starts or ends their break (Lunch 30m or Tea 10m).
    """
    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        try:
            device = _get_kiosk_device_from_request(request)
            worker_id = request.data.get("worker_id")
            action = str(request.data.get("action", "")).upper()
            break_type = str(request.data.get("break_type", "LUNCH_30")).upper()
            pin = request.data.get("pin")

            if not worker_id or not action:
                return Response({
                    "error": "worker_id and action (START or END) are required.",
                }, status=status.HTTP_400_BAD_REQUEST)

            if action not in ("START", "END"):
                return Response({
                    "error": "action must be either 'START' or 'END'.",
                }, status=status.HTTP_400_BAD_REQUEST)

            worker = get_object_or_404(User, id=worker_id)

            # Verify active session at this pharmacy
            session = (
                AttendanceSession.objects.filter(
                    user=worker,
                    pharmacy=device.pharmacy,
                    ended_at__isnull=True,
                ).first()
            )
            if not session:
                return Response({
                    "error": f"{worker.get_full_name() or worker.username} is not currently clocked in at this pharmacy.",
                }, status=status.HTTP_400_BAD_REQUEST)

            # Security: If worker has a PIN, require or verify it
            membership = (
                Membership.objects.filter(
                    pharmacy=device.pharmacy,
                    user=worker,
                    is_active=True,
                ).first()
            )
            has_pin = hasattr(membership, "worker_pin") and membership.worker_pin and bool(membership.worker_pin.pin_hash)

            if has_pin:
                if not pin:
                    return Response({
                        "error": "PIN is required to confirm this break action.",
                        "requires_pin": True,
                    }, status=status.HTTP_400_BAD_REQUEST)

                is_valid, _, reason = verify_kiosk_worker_pin(
                    kiosk_device=device,
                    user_identifier=str(worker.id),
                    raw_pin=str(pin),
                )
                if not is_valid:
                    return Response({
                        "error": "Invalid PIN. Please try again.",
                        "requires_pin": True,
                    }, status=status.HTTP_400_BAD_REQUEST)

            ip_addr = request.META.get("REMOTE_ADDR")

            if action == "START":
                event = start_break(
                    user=worker,
                    source=AttendanceEvent.Source.KIOSK_PIN,
                    device=device,
                    ip_address=ip_addr,
                )
                label = "Lunch Break (30 mins)" if break_type == "LUNCH_30" else "Tea Break (10 mins)"
                message = f"{worker.get_full_name() or worker.username} started {label}."
            else:
                event = end_break(
                    user=worker,
                    source=AttendanceEvent.Source.KIOSK_PIN,
                    device=device,
                    ip_address=ip_addr,
                )
                message = f"{worker.get_full_name() or worker.username} ended break and resumed shift."

            return Response({
                "success": True,
                "action": event.event_type,
                "worker_id": worker.id,
                "worker_name": worker.get_full_name() or worker.username,
                "break_type": break_type,
                "occurred_at": event.occurred_at.isoformat(),
                "message": message,
            })

        except (DjangoPermissionDenied, PermissionDenied) as e:
            return Response({"error": str(e)}, status=status.HTTP_401_UNAUTHORIZED)
        except DjangoValidationError as e:
            msg = e.messages[0] if hasattr(e, "messages") and e.messages else str(e)
            return Response({"error": msg}, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Worker Attendance Endpoints
# ---------------------------------------------------------------------------

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
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


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
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


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
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


# ---------------------------------------------------------------------------
# Manager Review & Correction Endpoints
# ---------------------------------------------------------------------------

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

        pharmacy = get_object_or_404(Pharmacy, pk=int(pharmacy_id))
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
            prov = approve_provisional_attendance(
                manager_user=request.user,
                provisional_id=int(provisional_id),
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
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


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
            provisional = reject_provisional_attendance(
                manager_user=request.user,
                provisional_id=int(provisional_id),
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
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)



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
            correction = create_attendance_correction(
                manager_user=request.user,
                event_id=int(event_id),
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
        except Exception as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


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


# ---------------------------------------------------------------------------
# Roster V2 API Views
# ---------------------------------------------------------------------------

class RosterPeriodDetailView(APIView):
    """
    GET /api/attendance/roster/period/?pharmacy_id=X&week_start=YYYY-MM-DD
    Side-effect-free view: retrieves weekly roster period details without mutating database or creating drafts.

    POST /api/attendance/roster/period/
    Body: {"pharmacy_id": int, "week_start": "YYYY-MM-DD"}
    Explicit write action to initialize or retrieve a persisted RosterPeriod draft.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        pharmacy_id = request.query_params.get("pharmacy_id")
        week_start_str = request.query_params.get("week_start")

        if not pharmacy_id or not week_start_str:
            return Response({"error": "pharmacy_id and week_start are required."}, status=status.HTTP_400_BAD_REQUEST)

        pharmacy = get_object_or_404(Pharmacy, pk=pharmacy_id)
        if not is_authorized_attendance_manager(request.user, pharmacy):
            raise PermissionDenied("You are not authorized to view or manage rosters for this pharmacy.")

        try:
            week_start = date.fromisoformat(week_start_str)
            if week_start.weekday() != 0:
                return Response({"error": "week_start must be a Monday."}, status=status.HTTP_400_BAD_REQUEST)
        except (ValueError, TypeError):
            return Response({"error": "Invalid week_start date format."}, status=status.HTTP_400_BAD_REQUEST)

        week_end = week_start + timedelta(days=6)

        # Side-effect-free read: query existing period without creating a draft
        period = RosterPeriod.objects.filter(pharmacy=pharmacy, week_start=week_start).first()
        rostered_count = ShiftSlotAssignment.objects.filter(
            shift__pharmacy=pharmacy,
            slot_date__gte=week_start,
            slot_date__lte=week_end,
            is_rostered=True,
        ).count()

        grid = get_roster_period_grid(pharmacy, week_start, week_end)

        if period:
            return Response({
                "period_id": period.id,
                "pharmacy_id": period.pharmacy_id,
                "pharmacy_name": period.pharmacy.name,
                "week_start": str(period.week_start),
                "week_end": str(period.week_end),
                "status": period.status,
                "published_at": period.published_at.isoformat() if period.published_at else None,
                "published_by": period.published_by.get_full_name() or period.published_by.username if period.published_by else None,
                "total_assignments": rostered_count,
                "created": False,
                "assignments": grid["assignments"],
                "vacant_slots": grid["vacant_slots"],
                "staff_view": grid["staff_view"],
                "stacked_view": grid["stacked_view"],
            })
        else:
            return Response({
                "period_id": None,
                "pharmacy_id": pharmacy.id,
                "pharmacy_name": pharmacy.name,
                "week_start": str(week_start),
                "week_end": str(week_end),
                "status": "DRAFT",
                "published_at": None,
                "published_by": None,
                "total_assignments": rostered_count,
                "created": False,
                "assignments": grid["assignments"],
                "vacant_slots": grid["vacant_slots"],
                "staff_view": grid["staff_view"],
                "stacked_view": grid["stacked_view"],
            })

    def post(self, request):
        """
        Explicit write action to initialize a RosterPeriod draft for a pharmacy and week.
        """
        pharmacy_id = request.data.get("pharmacy_id")
        week_start_str = request.data.get("week_start")

        if not pharmacy_id or not week_start_str:
            return Response({"error": "pharmacy_id and week_start are required."}, status=status.HTTP_400_BAD_REQUEST)

        pharmacy = get_object_or_404(Pharmacy, pk=pharmacy_id)
        if not is_authorized_attendance_manager(request.user, pharmacy):
            raise PermissionDenied("You are not authorized to view or manage rosters for this pharmacy.")

        try:
            period, created = get_or_create_roster_period(pharmacy, week_start_str, user=request.user)
            assignments = get_roster_period_assignments(period)
            grid = get_roster_period_grid(pharmacy, period.week_start, period.week_end)
            return Response({
                "period_id": period.id,
                "pharmacy_id": period.pharmacy_id,
                "pharmacy_name": period.pharmacy.name,
                "week_start": str(period.week_start),
                "week_end": str(period.week_end),
                "status": period.status,
                "published_at": period.published_at.isoformat() if period.published_at else None,
                "published_by": period.published_by.get_full_name() or period.published_by.username if period.published_by else None,
                "total_assignments": assignments.count(),
                "created": created,
                "assignments": grid["assignments"],
                "vacant_slots": grid["vacant_slots"],
                "staff_view": grid["staff_view"],
                "stacked_view": grid["stacked_view"],
            }, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK)
        except DjangoValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class RosterValidateView(APIView):
    """
    POST /api/attendance/roster/validate/
    Body: {"period_id": int} or {"pharmacy_id": int, "week_start": "YYYY-MM-DD"}
    Runs pre-publish validation on a roster period.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        period_id = request.data.get("period_id")
        if not period_id:
            pharmacy_id = request.data.get("pharmacy_id")
            week_start_str = request.data.get("week_start")
            if pharmacy_id and week_start_str:
                pharmacy = get_object_or_404(Pharmacy, pk=pharmacy_id)
                if not is_authorized_attendance_manager(request.user, pharmacy):
                    raise PermissionDenied("You are not authorized to validate rosters for this pharmacy.")
                period, _ = get_or_create_roster_period(pharmacy, week_start_str, user=request.user)
            else:
                return Response({"error": "period_id or (pharmacy_id and week_start) is required."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            period = get_object_or_404(RosterPeriod, pk=period_id)

        if not is_authorized_attendance_manager(request.user, period.pharmacy):
            raise PermissionDenied("You are not authorized to validate rosters for this pharmacy.")

        validation = validate_roster_period(period)
        return Response(validation)


class RosterPublishView(APIView):
    """
    POST /api/attendance/roster/publish/
    Body: {"period_id": int, "force_warnings": bool} or {"pharmacy_id": int, "week_start": "YYYY-MM-DD"}
    Atomically publishes a roster period if validation passes.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        period_id = request.data.get("period_id")
        force_warnings = bool(request.data.get("force_warnings", True))

        if not period_id:
            pharmacy_id = request.data.get("pharmacy_id")
            week_start_str = request.data.get("week_start")
            if pharmacy_id and week_start_str:
                pharmacy = get_object_or_404(Pharmacy, pk=pharmacy_id)
                if not is_authorized_attendance_manager(request.user, pharmacy):
                    raise PermissionDenied("You are not authorized to publish rosters for this pharmacy.")
                period, _ = get_or_create_roster_period(pharmacy, week_start_str, user=request.user)
            else:
                return Response({"error": "period_id or (pharmacy_id and week_start) is required."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            period = get_object_or_404(RosterPeriod, pk=period_id)

        if not is_authorized_attendance_manager(request.user, period.pharmacy):
            raise PermissionDenied("You are not authorized to publish rosters for this pharmacy.")

        try:
            published_period, validation = publish_roster_period(
                period,
                published_by=request.user,
                force_warnings=force_warnings,
            )
            return Response({
                "status": "PUBLISHED",
                "period_id": published_period.id,
                "week_start": str(published_period.week_start),
                "published_at": published_period.published_at.isoformat(),
                "validation": validation,
            })
        except DjangoValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class RosterUnpublishView(APIView):
    """
    POST /api/attendance/roster/unpublish/
    Body: {"period_id": int}
    Reverts a published roster period to DRAFT.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        period_id = request.data.get("period_id")
        if not period_id:
            return Response({"error": "period_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        period = get_object_or_404(RosterPeriod, pk=period_id)
        if not is_authorized_attendance_manager(request.user, period.pharmacy):
            raise PermissionDenied("You are not authorized to unpublish rosters for this pharmacy.")

        try:
            draft_period = unpublish_roster_period(period, unpublished_by=request.user)
            return Response({
                "status": "DRAFT",
                "period_id": draft_period.id,
                "week_start": str(draft_period.week_start),
            })
        except DjangoValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class RosterArchiveView(APIView):
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        if not request.data.get("period_id"):
            return Response({"error": "period_id is required."}, status=400)
        period = get_object_or_404(RosterPeriod, pk=request.data["period_id"])
        if not is_authorized_attendance_manager(request.user, period.pharmacy):
            raise PermissionDenied("You are not authorized to archive this roster.")
        try:
            period = archive_roster_period(period, request.user)
            return Response({"period_id": period.pk, "status": period.status})
        except DjangoValidationError as exc:
            return Response({"error": str(exc)}, status=400)


class WorkerPublishedRosterView(APIView):
    """
    GET /api/attendance/roster/worker/
    Params: ?start_date=YYYY-MM-DD&end_date=YYYY-MM-DD
    Worker views their published roster shifts. Strictly excludes drafts.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        start_date = request.query_params.get("start_date")
        end_date = request.query_params.get("end_date")

        from datetime import timedelta
        from .models import RosterPeriod, RosterAcknowledgement

        shifts = get_worker_published_roster(request.user, start_date=start_date, end_date=end_date)
        period_ids = set()
        shift_items = []
        for a in shifts:
            monday = a.slot_date - timedelta(days=a.slot_date.weekday())
            period = RosterPeriod.objects.filter(pharmacy_id=a.shift.pharmacy_id, week_start=monday).first()
            pid = period.id if period else None
            if pid:
                period_ids.add(pid)
            shift_items.append((a, pid))

        acked_period_ids = set(
            RosterAcknowledgement.objects.filter(
                roster_period_id__in=period_ids,
                user=request.user,
            ).values_list("roster_period_id", flat=True)
        )

        return Response({
            "worker_id": request.user.id,
            "total_shifts": len(shifts),
            "shifts": [
                {
                    "assignment_id": a.id,
                    "period_id": pid,
                    "pharmacy_id": a.shift.pharmacy_id,
                    "pharmacy_name": a.shift.pharmacy.name,
                    "slot_date": str(a.slot_date),
                    "start_time": str(a.slot.start_time),
                    "end_time": str(a.slot.end_time),
                    "role": a.shift.role_needed,
                    "is_acknowledged": (pid in acked_period_ids) if pid else False,
                }
                for a, pid in shift_items
            ],
        })


class WorkerAcknowledgeRosterView(APIView):
    """
    POST /api/attendance/roster/acknowledge/
    Body: {"period_id": int, "notes": str}
    Worker records acknowledgement of their published shifts in a roster period.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        period_id = request.data.get("period_id")
        notes = request.data.get("notes", "")

        if not period_id:
            return Response({"error": "period_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        period = get_object_or_404(RosterPeriod, pk=period_id)
        try:
            ack = acknowledge_roster_period(period, user=request.user, notes=notes)
            return Response({
                "status": "ACKNOWLEDGED",
                "period_id": period.id,
                "acknowledged_at": ack.acknowledged_at.isoformat(),
                "notes": ack.notes,
            })
        except DjangoValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class RosterAcknowledgementStatusView(APIView):
    """
    GET /api/attendance/roster/acknowledgements/<int:period_id>/
    Manager views worker acknowledgement breakdown for a published period.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request, period_id):
        period = get_object_or_404(RosterPeriod, pk=period_id)
        if not is_authorized_attendance_manager(request.user, period.pharmacy):
            raise PermissionDenied("You are not authorized to view acknowledgements for this pharmacy.")

        try:
            status_data = get_roster_acknowledgement_status(period, manager_user=request.user)
            return Response(status_data)
        except DjangoValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class RosterCopyWeekView(APIView):
    """
    POST /api/attendance/roster/copy-week/
    Body: {
        "source_period_id": int,
        "target_week_start": "YYYY-MM-DD",
        "include_assignments": bool (default True),
        "overwrite": bool (default False)
    }
    Copies shifts and assignments from source period into a target week in DRAFT status.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        source_period_id = request.data.get("source_period_id")
        target_week_start = request.data.get("target_week_start")
        include_assignments = request.data.get("include_assignments", True)
        overwrite = request.data.get("overwrite", False)

        if not source_period_id or not target_week_start:
            return Response(
                {"error": "source_period_id and target_week_start are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        source_period = get_object_or_404(RosterPeriod, pk=source_period_id)
        if not is_authorized_attendance_manager(request.user, source_period.pharmacy):
            raise PermissionDenied("You are not authorized to copy rosters for this pharmacy.")

        try:
            target_period, counts = copy_roster_week(
                source_period=source_period,
                target_week_start=target_week_start,
                user=request.user,
                include_assignments=include_assignments,
                overwrite=overwrite,
            )
            return Response({
                "status": "DRAFT",
                "period_id": target_period.id,
                "target_week_start": str(target_period.week_start),
                "copied_from_period_id": source_period.id,
                "counts": counts,
            })
        except (DjangoValidationError, ValueError) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class RosterTemplateView(APIView):
    """
    GET /api/attendance/roster/templates/?pharmacy_id=<id>
    Lists templates for a pharmacy.

    POST /api/attendance/roster/templates/
    Body:
      - Direct creation: {"pharmacy_id": int, "name": str, "template_data": list}
      - From existing period: {"from_period_id": int, "name": str, "include_users": bool}
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        pharmacy_id = request.query_params.get("pharmacy_id")
        if not pharmacy_id:
            return Response({"error": "pharmacy_id query param is required."}, status=status.HTTP_400_BAD_REQUEST)

        pharmacy = get_object_or_404(Pharmacy, pk=pharmacy_id)
        if not is_authorized_attendance_manager(request.user, pharmacy):
            raise PermissionDenied("You are not authorized to view templates for this pharmacy.")

        templates = RosterTemplate.objects.filter(pharmacy=pharmacy).order_by("-updated_at")
        data = [
            {
                "id": t.id,
                "name": t.name,
                "pharmacy_id": t.pharmacy_id,
                "template_data": t.template_data,
                "total_slots": len(t.template_data) if isinstance(t.template_data, list) else 0,
                "created_at": t.created_at.isoformat(),
                "updated_at": t.updated_at.isoformat(),
            }
            for t in templates
        ]
        return Response(data)

    def post(self, request):
        from_period_id = request.data.get("from_period_id")
        name = request.data.get("name")
        if not name or not str(name).strip():
            return Response({"error": "name is required."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            if from_period_id:
                period = get_object_or_404(RosterPeriod, pk=from_period_id)
                include_users = bool(request.data.get("include_users", True))
                template = save_period_as_template(period, name=name, user=request.user, include_users=include_users)
            else:
                pharmacy_id = request.data.get("pharmacy_id")
                if not pharmacy_id:
                    return Response({"error": "pharmacy_id or from_period_id is required."}, status=status.HTTP_400_BAD_REQUEST)
                pharmacy = get_object_or_404(Pharmacy, pk=pharmacy_id)
                template_data = request.data.get("template_data", [])
                template = create_roster_template(pharmacy, name=name, template_data=template_data, user=request.user)

            return Response({
                "id": template.id,
                "name": template.name,
                "pharmacy_id": template.pharmacy_id,
                "template_data": template.template_data,
                "total_slots": len(template.template_data) if isinstance(template.template_data, list) else 0,
                "created_at": template.created_at.isoformat(),
            }, status=status.HTTP_201_CREATED)
        except (DjangoValidationError, ValueError) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class RosterTemplateApplyView(APIView):
    """
    POST /api/attendance/roster/templates/apply/
    Body: {
        "template_id": int,
        "target_week_start": "YYYY-MM-DD",
        "include_assignments": bool (default True),
        "overwrite": bool (default False)
    }
    Applies a template to generate draft shifts for the given week.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        template_id = request.data.get("template_id")
        target_week_start = request.data.get("target_week_start")
        include_assignments = request.data.get("include_assignments", True)
        overwrite = request.data.get("overwrite", False)

        if not template_id or not target_week_start:
            return Response(
                {"error": "template_id and target_week_start are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        template = get_object_or_404(RosterTemplate, pk=template_id)
        if not is_authorized_attendance_manager(request.user, template.pharmacy):
            raise PermissionDenied("You are not authorized to apply templates for this pharmacy.")

        try:
            period, counts = apply_roster_template(
                pharmacy=template.pharmacy,
                template=template,
                target_week_start=target_week_start,
                user=request.user,
                include_assignments=include_assignments,
                overwrite=overwrite,
            )
            return Response({
                "status": "DRAFT",
                "period_id": period.id,
                "target_week_start": str(period.week_start),
                "template_id": template.id,
                "counts": counts,
            })
        except (DjangoValidationError, ValueError) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class RosterBulkEditView(APIView):
    """
    POST /api/attendance/roster/bulk-edit/
    Body: {
        "period_id": int,
        "operations": [
            {"action": "create_shift", ...},
            {"action": "assign_worker", ...},
            {"action": "unassign_worker", ...},
            {"action": "delete_slot", ...},
            {"action": "update_slot_times", ...}
        ]
    }
    Executes a transactional batch of roster operations with all-or-nothing rollback.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        period_id = request.data.get("period_id")
        operations = request.data.get("operations")

        if not period_id or operations is None:
            return Response(
                {"error": "period_id and operations are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        period = get_object_or_404(RosterPeriod, pk=period_id)
        if not is_authorized_attendance_manager(request.user, period.pharmacy):
            raise PermissionDenied("You are not authorized to edit rosters for this pharmacy.")

        try:
            summary = bulk_edit_roster_period(period, operations=operations, user=request.user)
            return Response({
                "status": "SUCCESS",
                "period_id": period.id,
                "summary": summary,
            })
        except (DjangoValidationError, ValueError) as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class RosterWorkerSwapRequestView(APIView):
    """
    POST /api/attendance/roster/worker/swap-request/
    Body: {"assignment_id": int, "target_user_id": int, "notes": str}
    Worker requests direct swap. Assignment is preserved until approval.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        assignment_id = request.data.get("assignment_id")
        target_user_id = request.data.get("target_user_id")
        notes = request.data.get("notes", "")

        if not assignment_id or not target_user_id:
            return Response(
                {"error": "assignment_id and target_user_id are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        assignment = get_object_or_404(ShiftSlotAssignment, pk=assignment_id)
        target_user = get_object_or_404(User, pk=target_user_id)

        try:
            req, audit = request_direct_swap(
                assignment=assignment,
                requesting_user=request.user,
                target_user=target_user,
                notes=notes,
            )
            return Response({
                "status": "PENDING",
                "request_id": req.id,
                "audit_id": audit.id,
                "assignment_id": assignment.id,
                "target_user_id": target_user.id,
                "message": "Direct swap request submitted successfully. Assignment is retained until approval.",
            }, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except DjangoPermissionDenied as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)


class RosterWorkerCoverRequestView(APIView):
    """
    POST /api/attendance/roster/worker/cover-request/
    Body: {"assignment_id": int, "reason": str}
    Worker requests shift cover ("can't work"). Assignment is preserved.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        assignment_id = request.data.get("assignment_id")
        reason = request.data.get("reason", "")

        if not assignment_id:
            return Response(
                {"error": "assignment_id is required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        assignment = get_object_or_404(ShiftSlotAssignment, pk=assignment_id)

        try:
            req, audit = submit_cover_request(
                assignment=assignment,
                requesting_user=request.user,
                reason=reason,
            )
            return Response({
                "status": "PENDING",
                "request_id": req.id,
                "audit_id": audit.id,
                "assignment_id": assignment.id,
                "message": "Cover request submitted successfully. Assignment is retained until replacement or release.",
            }, status=status.HTTP_201_CREATED)
        except DjangoValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)
        except DjangoPermissionDenied as e:
            return Response({"error": str(e)}, status=status.HTTP_403_FORBIDDEN)


class RosterManagerApproveSwapView(APIView):
    """
    POST /api/attendance/roster/manager/approve-swap/
    Body: {"request_id": int}
    Manager approves direct swap atomically.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        request_id = request.data.get("request_id")
        if not request_id:
            return Response({"error": "request_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        req = get_object_or_404(WorkerShiftRequest, pk=request_id)
        if not is_authorized_attendance_manager(request.user, req.pharmacy):
            raise PermissionDenied("You are not authorized to approve roster actions for this pharmacy.")

        target_user = None
        target_user_id = request.data.get("target_user_id")
        if target_user_id:
            target_user = get_object_or_404(User, pk=target_user_id)

        try:
            assignment = approve_direct_swap(req, manager=request.user, target_user=target_user)
            return Response({
                "status": "APPROVED",
                "request_id": req.id,
                "assignment_id": assignment.id,
                "new_assigned_user_id": assignment.user_id,
                "message": "Swap approved and assignment atomically transferred.",
            })
        except DjangoValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class RosterManagerApproveReplacementView(APIView):
    """
    POST /api/attendance/roster/manager/approve-replacement/
    Body: {"request_id": int, "replacement_user_id": int}
    Manager approves replacement worker for cover request atomically.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        request_id = request.data.get("request_id")
        replacement_user_id = request.data.get("replacement_user_id")

        if not request_id or not replacement_user_id:
            return Response(
                {"error": "request_id and replacement_user_id are required."},
                status=status.HTTP_400_BAD_REQUEST,
            )

        req = get_object_or_404(WorkerShiftRequest, pk=request_id)
        if not is_authorized_attendance_manager(request.user, req.pharmacy):
            raise PermissionDenied("You are not authorized to approve roster actions for this pharmacy.")

        replacement_user = get_object_or_404(User, pk=replacement_user_id)

        try:
            assignment = approve_cover_replacement(
                request_id_or_obj=req,
                replacement_user=replacement_user,
                manager=request.user,
            )
            return Response({
                "status": "APPROVED",
                "request_id": req.id,
                "assignment_id": assignment.id,
                "new_assigned_user_id": assignment.user_id,
                "message": "Replacement approved and assignment atomically updated.",
            })
        except DjangoValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class RosterManagerReleaseWorkerView(APIView):
    """
    POST /api/attendance/roster/manager/release-worker/
    Body: {"request_id": int, "escalate_to_visibility": str | null}
    Manager releases worker; deletes assignment and optionally escalates existing shift.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        request_id = request.data.get("request_id")
        escalate_to_visibility = request.data.get("escalate_to_visibility")

        if not request_id:
            return Response({"error": "request_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        req = get_object_or_404(WorkerShiftRequest, pk=request_id)
        if not is_authorized_attendance_manager(request.user, req.pharmacy):
            raise PermissionDenied("You are not authorized to release workers for this pharmacy.")

        try:
            shift = release_worker_from_assignment(
                request_id_or_obj=req,
                manager=request.user,
                escalate_to_visibility=escalate_to_visibility,
            )
            return Response({
                "status": "WORKER_RELEASED",
                "request_id": req.id,
                "shift_id": shift.id if shift else None,
                "visibility": shift.visibility if shift else None,
                "message": "Worker released from assignment. Existing shift preserved and escalated.",
            })
        except DjangoValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class RosterManagerRejectRequestView(APIView):
    """
    POST /api/attendance/roster/manager/reject-request/
    Body: {"request_id": int, "reason": str}
    Manager rejects request; assignment remains with original worker.
    """
    permission_classes = [permissions.IsAuthenticated]

    def post(self, request):
        request_id = request.data.get("request_id")
        reason = request.data.get("reason", "")

        if not request_id:
            return Response({"error": "request_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        req = get_object_or_404(WorkerShiftRequest, pk=request_id)
        if not is_authorized_attendance_manager(request.user, req.pharmacy):
            raise PermissionDenied("You are not authorized to reject roster actions for this pharmacy.")

        try:
            rejected_req = reject_worker_shift_request(
                request_id_or_obj=req,
                manager=request.user,
                reason=reason,
            )
            return Response({
                "status": "REJECTED",
                "request_id": rejected_req.id,
                "message": "Request rejected. Assignment remains with original worker.",
            })
        except DjangoValidationError as e:
            return Response({"error": str(e)}, status=status.HTTP_400_BAD_REQUEST)


class RosterActionAuditListView(APIView):
    """
    GET /api/attendance/roster/audits/?pharmacy_id=X
    Returns recent roster action audit logs for authorized managers.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        pharmacy_id = request.query_params.get("pharmacy_id")
        if not pharmacy_id:
            return Response({"error": "pharmacy_id is required."}, status=status.HTTP_400_BAD_REQUEST)

        pharmacy = get_object_or_404(Pharmacy, pk=pharmacy_id)
        if not is_authorized_attendance_manager(request.user, pharmacy):
            raise PermissionDenied("You are not authorized to view audits for this pharmacy.")

        audits = RosterActionAudit.objects.filter(pharmacy=pharmacy).select_related(
            "performed_by", "target_user"
        ).order_by("-created_at")[:50]

        data = [
            {
                "id": a.id,
                "action_type": a.action_type,
                "performed_by": a.performed_by.get_full_name() or a.performed_by.username if a.performed_by else None,
                "target_user": a.target_user.get_full_name() or a.target_user.username if a.target_user else None,
                "shift_assignment_id": a.shift_assignment_id,
                "details": a.details,
                "created_at": a.created_at.isoformat(),
            }
            for a in audits
        ]
        return Response({"audits": data})
