"""Audit-only signed B29 kiosk clock integrity contracts on frozen main.

Run using the dedicated standalone attendance_tests SQLite schema, never Django
TestCase's default suite; signed events reach the real offline protocol.
"""
import base64
from datetime import timedelta

from django.utils import timezone
from attendance.protocol import calculate_event_hash, sync_offline_batch
from attendance.models import AttendanceEvent, AttendanceSession, KioskAttendanceEvent
from attendance_tests.test_kiosk_offline_protocol import KioskOfflineProtocolTests


class Phase5KioskClockIntegrity(KioskOfflineProtocolTests):
    def _resign(self, event):
        payload = {
            field: event[field]
            for field in (
                "protocol_version", "event_id", "device_id", "device_seq",
                "employee_id", "shift_id", "event_type", "device_timestamp",
                "trusted_time_estimate", "monotonic_elapsed_ms",
                "boot_session_id", "previous_event_hash",
            )
        }
        digest = calculate_event_hash(payload)
        event["event_hash"] = digest
        event["signature"] = base64.b64encode(
            self.private_key.sign(digest.encode("ascii"))
        ).decode("ascii")
        return event

    def test_b29_normal_clock_positive_control_applies_attendance(self):
        event = self.signed_event()
        result = sync_offline_batch(self.device, [event])
        self.assertEqual(result["results"][0]["result"], "accepted", result)
        self.assertEqual(KioskAttendanceEvent.objects.count(), 1)
        self.assertEqual(AttendanceEvent.objects.count(), 1)
        self.assertEqual(AttendanceSession.objects.count(), 1)

    def test_b29_properly_signed_anchor_drift_must_not_apply_attendance(self):
        event = self.signed_event()
        event["device_timestamp"] = (
            timezone.now() - timedelta(minutes=10)
        ).isoformat()
        event["trusted_time_estimate"] = timezone.now().isoformat()
        event = self._resign(event)
        result = sync_offline_batch(self.device, [event])
        self.assertEqual(result["results"][0]["result"], "needs_review", result)
        stored = KioskAttendanceEvent.objects.get()
        self.assertIn("CLOCK_ANCHOR_DRIFT", stored.integrity_flags)
        self.assertIsNone(
            stored.attendance_event_id,
            "Clock-drift evidence must remain provisional until review.",
        )
        self.assertEqual(AttendanceEvent.objects.count(), 0)
        self.assertEqual(AttendanceSession.objects.count(), 0)

    def test_b29_properly_signed_server_drift_must_not_apply_attendance(self):
        event = self.signed_event()
        past = (timezone.now() - timedelta(days=8)).isoformat()
        event["device_timestamp"] = past
        event["trusted_time_estimate"] = past
        event = self._resign(event)
        result = sync_offline_batch(self.device, [event])
        self.assertEqual(result["results"][0]["result"], "needs_review", result)
        stored = KioskAttendanceEvent.objects.get()
        self.assertIn("SERVER_TIME_DRIFT", stored.integrity_flags)
        self.assertIsNone(stored.attendance_event_id)
        self.assertEqual(AttendanceEvent.objects.count(), 0)
        self.assertEqual(AttendanceSession.objects.count(), 0)
