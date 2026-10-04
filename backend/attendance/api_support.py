"""Shared by the attendance endpoints: the stable error response for unexpected failures and kiosk-device
authentication from the request.

Logs go to the historical "attendance.views" channel that operators and the
public error-surface tests read."""
import logging
from rest_framework import status
from rest_framework.exceptions import PermissionDenied
from rest_framework.response import Response
from attendance.credentials import authenticate_kiosk_device

logger = logging.getLogger("attendance.views")


def _unexpected_error_response(request, operation):
    """A stable 400 for an unexpected failure: the exception and its traceback go to the log, never to the client."""
    logger.exception("Attendance request failed: operation=%s path=%s", operation, request.path)
    return Response({"error": f"Unable to {operation}. Please try again."}, status=status.HTTP_400_BAD_REQUEST)


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
