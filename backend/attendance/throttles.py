"""Dedicated DRF Throttles for Attendance V1 Kiosk, QR, PIN, and Worker Clocking.

Provides separate rate limiting to defend against brute-force attacks and denial-of-service:
- KioskQRRateThrottle: Throttles rotating QR refresh requests (default 60/min).
- KioskPINRateThrottle: Throttles kiosk PIN entry attempts (default 10/min).
- WorkerClockInThrottle: Throttles worker clock-in requests (default 20/min).
- WorkerClockOutThrottle: Throttles worker clock-out requests (default 20/min).
"""

import hashlib
from rest_framework.throttling import SimpleRateThrottle


def _get_kiosk_ident(request, throttle_instance) -> str:
    """Extract a unique identifier for kiosk requests using device token or remote IP."""
    token = None
    if hasattr(request, "headers"):
        token = request.headers.get("X-Device-Token")
    if not token:
        token = request.META.get("HTTP_X_DEVICE_TOKEN")
    if not token:
        auth_header = (
            request.headers.get("Authorization", "")
            if hasattr(request, "headers")
            else ""
        ) or request.META.get("HTTP_AUTHORIZATION", "")
        if auth_header.startswith("Bearer ctk_kiosk_"):
            token = auth_header[7:].strip()
    if not token and hasattr(request, "data") and isinstance(request.data, dict):
        token = request.data.get("device_token")

    if token and isinstance(token, str):
        return f"dev_{hashlib.sha256(token.strip().encode('utf-8')).hexdigest()[:16]}"

    return f"ip_{throttle_instance.get_ident(request)}"


class KioskQRRateThrottle(SimpleRateThrottle):
    """Throttle for Kiosk rotating QR refresh endpoint."""

    scope = "kiosk_qr_refresh"
    default_rate = "60/minute"

    def get_rate(self):
        return self.THROTTLE_RATES.get(self.scope, self.default_rate)

    def get_cache_key(self, request, view):
        ident = _get_kiosk_ident(request, self)
        return self.cache_format % {
            "scope": self.scope,
            "ident": ident,
        }


class KioskPINRateThrottle(SimpleRateThrottle):
    """Throttle for Kiosk worker PIN clock-in/clock-out attempts."""

    scope = "kiosk_pin_attempt"
    default_rate = "10/minute"

    def get_rate(self):
        return self.THROTTLE_RATES.get(self.scope, self.default_rate)

    def get_cache_key(self, request, view):
        ident = _get_kiosk_ident(request, self)
        return self.cache_format % {
            "scope": self.scope,
            "ident": ident,
        }


class WorkerClockInThrottle(SimpleRateThrottle):
    """Throttle for worker clock-in requests."""

    scope = "worker_clock_in"
    default_rate = "20/minute"

    def get_rate(self):
        return self.THROTTLE_RATES.get(self.scope, self.default_rate)

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            ident = f"user_{request.user.pk}"
        else:
            ident = f"ip_{self.get_ident(request)}"

        return self.cache_format % {
            "scope": self.scope,
            "ident": ident,
        }


class WorkerClockOutThrottle(SimpleRateThrottle):
    """Throttle for worker clock-out requests."""

    scope = "worker_clock_out"
    default_rate = "20/minute"

    def get_rate(self):
        return self.THROTTLE_RATES.get(self.scope, self.default_rate)

    def get_cache_key(self, request, view):
        if request.user and request.user.is_authenticated:
            ident = f"user_{request.user.pk}"
        else:
            ident = f"ip_{self.get_ident(request)}"

        return self.cache_format % {
            "scope": self.scope,
            "ident": ident,
        }
