"""Attendance and kiosk REST API: device activation and pairing, QR and PIN clocking, offline sync, worker clock actions and manager approvals."""
import hashlib
from datetime import datetime, timedelta

from django.conf import settings

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

from attendance.approvals import (
    approve_provisional_attendance,
    create_attendance_correction,
    get_effective_session_timeline,
    get_pending_provisional_attendances,
    reject_provisional_attendance,
)
from client_profile.domains.roster.permissions import is_authorized_attendance_manager
from attendance.credentials import (
    activate_kiosk_device,
    authenticate_kiosk_device,
    generate_kiosk_pairing_code,
    generate_signed_pharmacy_qr,
    is_authorized_kiosk_manager,
    redeem_kiosk_pairing_code,
    revoke_kiosk_device,
    revoke_kiosk_device_by_credential,
    send_worker_pin_setup_code,
    setup_worker_kiosk_pin,
    verify_kiosk_worker_pin,
    verify_signed_pharmacy_qr,
    worker_update_own_pin,
)
from attendance.throttles import (
    KioskPINRateThrottle,
    KioskQRRateThrottle,
    WorkerClockInThrottle,
    WorkerClockOutThrottle,
)
from attendance.transitions import clock_in, clock_out, end_break, get_active_session_status, start_break
from attendance.protocol import sync_offline_batch
from client_profile.models import Membership, Pharmacy, RosterAcknowledgement, RosterPublicationAudit, Shift
from attendance.models import (
    AttendanceEvent,
    AttendanceSession,
    KioskDevice,
    ProvisionalAttendance,
    WorkerPIN,
)


def _get_kiosk_device_from_request(request, *, allow_revoked=False):
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

    device = authenticate_kiosk_device(token, include_revoked=allow_revoked)
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
        from client_profile.models import PharmacyAdmin

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
                client_attempt_id=request.data.get("client_attempt_id", ""),
                proof_signature=request.data.get("proof_signature", ""),
            )
            return Response({
                "device_id": device.id,
                "device_token": raw_token,
                "device_name": device.device_name,
                "pharmacy_id": device.pharmacy.id,
                "pharmacy_name": device.pharmacy.name,
                "activated_at": device.activated_at.isoformat(),
                "installation_id": str(device.installation_id),
                "server_time": timezone.now().isoformat(),
                "max_offline_hours": int(getattr(settings, "KIOSK_MAX_OFFLINE_HOURS", 24)),
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
            device = _get_kiosk_device_from_request(request, allow_revoked=True)
            if device.client_kind != "NATIVE_OFFLINE":
                raise PermissionDenied("This device is not authorized for offline attendance sync.")
            result = sync_offline_batch(
                device,
                request.data.get("events"),
                app_version=request.data.get("app_version", ""),
            )
            result["device_revoked"] = bool(device.revoked_at or not device.is_active)
            if not result["device_revoked"]:
                result["max_offline_hours"] = int(getattr(settings, "KIOSK_MAX_OFFLINE_HOURS", 24))
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
                "max_offline_hours": int(getattr(settings, "KIOSK_MAX_OFFLINE_HOURS", 24)),
            })
        except (DjangoPermissionDenied, PermissionDenied) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)


class KioskSelfRevokeView(APIView):
    """Revoke the authenticated kiosk itself before local credentials are cleared."""

    authentication_classes = []
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        try:
            device = _get_kiosk_device_from_request(request, allow_revoked=True)
            revoke_kiosk_device_by_credential(
                device,
                issued_at=request.data.get("issued_at", ""),
                proof_signature=request.data.get("proof_signature", ""),
            )
            return Response({"status": "REVOKED", "installation_id": str(device.installation_id)})
        except (DjangoPermissionDenied, PermissionDenied) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_401_UNAUTHORIZED)
        except DjangoValidationError as exc:
            message = "; ".join(exc.messages) if hasattr(exc, "messages") else str(exc)
            return Response({"error": message}, status=status.HTTP_400_BAD_REQUEST)


class ManagerKioskDevicesView(APIView):
    """List or revoke kiosk devices for a pharmacy under manager authority."""

    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        pharmacy_id = request.query_params.get("pharmacy_id")
        if not pharmacy_id:
            return Response({"error": "pharmacy_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        pharmacy = get_object_or_404(Pharmacy, pk=pharmacy_id)
        if not is_authorized_kiosk_manager(request.user, pharmacy):
            raise PermissionDenied("You are not authorized to manage kiosks for this pharmacy.")
        devices = KioskDevice.objects.filter(pharmacy=pharmacy).order_by("-activated_at", "-pk")
        return Response({"devices": [{
            "id": device.pk,
            "installation_id": str(device.installation_id),
            "device_name": device.device_name,
            "platform": device.platform,
            "client_kind": device.client_kind,
            "app_version": device.app_version,
            "is_active": device.is_active,
            "activated_at": device.activated_at.isoformat(),
            "last_seen_at": device.last_seen_at.isoformat() if device.last_seen_at else None,
            "last_sync_at": device.last_sync_at.isoformat() if device.last_sync_at else None,
            "revoked_at": device.revoked_at.isoformat() if device.revoked_at else None,
            "last_contiguous_sequence": device.last_contiguous_sequence,
        } for device in devices]})

    def post(self, request):
        device_id = request.data.get("device_id")
        if not device_id:
            return Response({"error": "device_id is required."}, status=status.HTTP_400_BAD_REQUEST)
        device = get_object_or_404(KioskDevice.objects.select_related("pharmacy"), pk=device_id)
        try:
            revoke_kiosk_device(request.user, device)
            return Response({
                "status": "REVOKED",
                "device_id": device.pk,
                "installation_id": str(device.installation_id),
                "revoked_at": device.revoked_at.isoformat() if device.revoked_at else None,
            })
        except (DjangoPermissionDenied, PermissionDenied) as exc:
            return Response({"error": str(exc)}, status=status.HTTP_403_FORBIDDEN)


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
            verified_at = timezone.now()
            max_offline_hours = int(getattr(settings, "KIOSK_MAX_OFFLINE_HOURS", 24))
            worker_pin = membership.worker_pin
            credential_generation = hashlib.sha256(
                f"{worker_pin.pk}:{int(worker_pin.is_enabled)}:{worker_pin.pin_hash}".encode("utf-8")
            ).hexdigest()
            return Response({
                "worker_id": worker.id,
                "worker_name": worker.get_full_name() or worker.username,
                "pharmacy_id": device.pharmacy_id,
                "is_clocked_in": active_session is not None,
                "is_on_break": bool(active_session and active_session["is_on_break"]),
                "verified_at": verified_at.isoformat(),
                "offline_valid_until": (verified_at + timedelta(hours=max_offline_hours)).isoformat(),
                "credential_generation": credential_generation,
                "max_offline_hours": max_offline_hours,
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

            from attendance.credentials import _find_kiosk_candidate_membership
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
