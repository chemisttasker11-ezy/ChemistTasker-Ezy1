"""Only the attendance endpoints exercised by the isolated SQLite suites."""

from django.urls import path
from client_profile.attendance_views import (
    KioskRequestPairingCodeView,
    KioskPairWithCodeView,
    KioskWorkerPinStatusView,
    KioskWorkerSetupPinView,
    WorkerUpdatePinView,
)

urlpatterns = [
    path("attendance/kiosk/pairing/request/", KioskRequestPairingCodeView.as_view()),
    path("attendance/kiosk/pairing/pair/", KioskPairWithCodeView.as_view()),
    path("attendance/kiosk/worker-pin/status/", KioskWorkerPinStatusView.as_view()),
    path("attendance/kiosk/worker-pin/setup/", KioskWorkerSetupPinView.as_view()),
    path("attendance/worker/pin/update/", WorkerUpdatePinView.as_view()),
]
