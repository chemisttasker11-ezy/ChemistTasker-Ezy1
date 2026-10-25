"""PR201 B29 signed offline kiosk clock regression contracts.

Run using the dedicated standalone attendance_tests SQLite schema, never Django
TestCase's default suite; signed events reach the real offline protocol.
"""
import base64
import unittest
from datetime import timedelta

from attendance_tests import test_kiosk_offline_protocol as offline_protocol
from django.conf import settings
from django.db.models import QuerySet
from django.utils import timezone
from attendance.protocol import calculate_event_hash, sync_offline_batch
from attendance.models import AttendanceEvent, AttendanceSession, KioskAttendanceEvent


@unittest.skipUnless(
    settings.SETTINGS_MODULE == "attendance_tests.settings",
    "Run with python -m unittest attendance_tests.test_pr201_b29_kiosk (isolated schema).",
)
class Phase6KioskClockIntegrity(offline_protocol.KioskOfflineProtocolTests):
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

    def review_client(self, user):
        """Use the actual view methods under the isolated in-memory schema.

        The dedicated kiosk unit harness intentionally does not install the
        full production URLconf. Routing is checked in normal Django tests.
        """
        from rest_framework.test import APIRequestFactory, force_authenticate
        from attendance.kiosk_review import (
            ManagerDecideKioskReviewView, ManagerPendingKioskReviewView,
        )

        class DirectReviewClient:
            def __init__(self, actor):
                self.actor = actor
                self.factory = APIRequestFactory()

            def post(self, url, payload, format="json"):
                req = self.factory.post(url, payload, format=format)
                force_authenticate(req, user=self.actor)
                return ManagerDecideKioskReviewView.as_view()(req)

            def get(self, url, params=None):
                req = self.factory.get(url, params or {})
                force_authenticate(req, user=self.actor)
                return ManagerPendingKioskReviewView.as_view()(req)

        return DirectReviewClient(user)

    def drift_pending(self):
        event = self.signed_event()
        event["device_timestamp"] = (
            timezone.now() - timedelta(minutes=10)
        ).isoformat()
        event["trusted_time_estimate"] = timezone.now().isoformat()
        event = self._resign(event)
        result = sync_offline_batch(self.device, [event])
        self.assertEqual(result["results"][0]["result"], "needs_review")
        return event

    def test_b29_manager_can_approve_with_corrected_time_and_replay_is_safe(self):
        from attendance.models import KioskAttendanceReview
        event = self.drift_pending()
        api = self.review_client(self.owner)
        url = "/api/v1/attendance/manager/kiosk-review/decide/"
        payload = {"event_id": event["event_id"], "decision": "APPROVED",
                   "corrected_timestamp": timezone.now().isoformat(),
                   "reason": "Verified original shift against recorded evidence."}
        approved = api.post(url, payload, format="json")
        self.assertEqual(approved.status_code, 200, approved.data)
        self.assertEqual(AttendanceEvent.objects.count(), 1)
        self.assertEqual(KioskAttendanceReview.objects.count(), 1)
        again = api.post(url, payload, format="json")
        self.assertEqual(again.status_code, 200, again.data)
        self.assertEqual(AttendanceEvent.objects.count(), 1)
        self.assertEqual(sync_offline_batch(self.device, [event])["results"][0]["result"], "already_received")
        self.assertEqual(KioskAttendanceEvent.objects.get().processing_status, "NEEDS_REVIEW")

    def test_b29_approve_without_corrected_time_does_not_apply_attendance(self):
        event = self.drift_pending()
        response = self.review_client(self.owner).post(
            "/api/v1/attendance/manager/kiosk-review/decide/",
            {"event_id": event["event_id"], "decision": "APPROVED", "reason": "Check"},
            format="json",
        )
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(AttendanceEvent.objects.count(), 0)

    def test_b29_rejection_retains_evidence_and_cannot_be_reversed(self):
        from attendance.models import KioskAttendanceReview
        event = self.drift_pending()
        api = self.review_client(self.owner)
        url = "/api/v1/attendance/manager/kiosk-review/decide/"
        rejected = api.post(url, {"event_id": event["event_id"], "decision": "REJECTED",
                                  "reason": "Could not establish actual time."}, format="json")
        self.assertEqual(rejected.status_code, 200, rejected.data)
        attempt = api.post(url, {"event_id": event["event_id"], "decision": "APPROVED",
                                 "reason": "Changed mind",
                                 "corrected_timestamp": timezone.now().isoformat()}, format="json")
        self.assertEqual(attempt.status_code, 409, attempt.data)
        self.assertEqual(AttendanceEvent.objects.count(), 0)
        self.assertEqual(KioskAttendanceReview.objects.count(), 1)

    def test_b29_missing_trusted_clock_remains_provisional(self):
        event = self.signed_event()
        event["trusted_time_estimate"] = None
        event = self._resign(event)
        result = sync_offline_batch(self.device, [event])
        self.assertEqual(result["results"][0]["result"], "needs_review", result)
        evidence = KioskAttendanceEvent.objects.get()
        self.assertIn("MISSING_TRUSTED_TIME", evidence.integrity_flags)
        self.assertIsNone(evidence.attendance_event_id)
        self.assertEqual(AttendanceEvent.objects.count(), 0)

    def test_b29_unrelated_manager_cannot_view_or_decide_other_pharmacy(self):
        from client_profile.characterization_support import make_owner_with_pharmacy
        foreign_owner, _ = make_owner_with_pharmacy("Foreign kiosk manager")
        event = self.drift_pending()
        api = self.review_client(foreign_owner)
        pending = api.get("/api/v1/attendance/manager/kiosk-review/pending/",
                          {"pharmacy_id": self.pharmacy.pk})
        self.assertEqual(pending.status_code, 403, pending.data)
        response = api.post("/api/v1/attendance/manager/kiosk-review/decide/",
                            {"event_id": event["event_id"], "decision": "REJECTED",
                             "reason": "Foreign"}, format="json")
        self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(AttendanceEvent.objects.count(), 0)

    def test_b29_legacy_review_row_already_applied_is_hidden_and_not_reapplied(self):
        from attendance.protocol import _apply_business_event
        event = self.drift_pending()
        api = self.review_client(self.owner)
        pending_url = "/api/v1/attendance/manager/kiosk-review/pending/"
        listed = api.get(pending_url, {"pharmacy_id": self.pharmacy.pk})
        self.assertEqual([row["event_id"] for row in listed.data], [event["event_id"]])
        evidence = KioskAttendanceEvent.objects.get()
        applied = _apply_business_event(
            self.device, evidence.employee, evidence.event_type, timezone.now(), evidence.shift_id,
        )
        # Bypass the append-only manager only to seed pre-hardening legacy state.
        QuerySet(model=KioskAttendanceEvent).filter(pk=evidence.pk).update(attendance_event=applied)
        self.assertEqual(api.get(pending_url, {"pharmacy_id": self.pharmacy.pk}).data, [])
        response = api.post("/api/v1/attendance/manager/kiosk-review/decide/", {
            "event_id": event["event_id"], "decision": "APPROVED", "reason": "Legacy row",
            "corrected_timestamp": timezone.now().isoformat()}, format="json")
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(AttendanceEvent.objects.count(), 1)
