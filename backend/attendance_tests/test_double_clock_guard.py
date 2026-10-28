"""E13/PR-CLOCK contracts; run with --settings core.postgres_test_settings.

Uses the migrated PostgreSQL schema and real API views, credentials and transitions.
Time is controlled; SQLite and skipped database checks are deliberately unsupported.
"""
import base64
from datetime import datetime, timedelta, timezone as datetime_timezone
from types import SimpleNamespace
from unittest.mock import patch
from uuid import uuid4

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.core.cache.backends.locmem import LocMemCache
from django.db import connection
from django.test import SimpleTestCase, TestCase
from django.utils.dateparse import parse_datetime
from rest_framework.test import APIRequestFactory, force_authenticate

from attendance import credentials
from attendance.api_support import _confirm_opposite
from attendance.credentials import activate_kiosk_device, generate_signed_pharmacy_qr, set_worker_personal_code
from attendance.kiosk_api import KioskOfflineSyncView, KioskPinClockView, KioskWorkerSetupPinView
from attendance.models import AttendanceEvent, AttendanceSession, KioskAttendanceEvent, WorkerPIN
from attendance.protocol import calculate_event_hash
from attendance.worker_api import WorkerClockInView, WorkerClockOutView
from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from memberships.models import Membership


class DoubleClockFixture(TestCase):
    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        if connection.vendor != "postgresql":
            raise AssertionError("Run CLOCK tests with --settings core.postgres_test_settings (no SQLite fallback).")

    def setUp(self):
        self.now = datetime(2026, 10, 28, 0, 0, tzinfo=datetime_timezone.utc)
        frozen = patch("django.utils.timezone.now", side_effect=lambda: self.now)
        frozen.start()
        self.addCleanup(frozen.stop)
        self.factory = APIRequestFactory()
        self.owner, self.pharmacy = make_owner_with_pharmacy("CLOCK Pharmacy A")
        self.device, self.token = activate_kiosk_device(self.owner, self.pharmacy, "Counter")
        self.worker = make_user("PHARMACIST")
        self.membership = self.add_membership(self.worker, self.pharmacy)
        for view in (KioskPinClockView, WorkerClockInView, WorkerClockOutView):
            throttle = patch.object(view, "throttle_classes", [])
            throttle.start()
            self.addCleanup(throttle.stop)

    def add_membership(self, worker, pharmacy):
        membership = Membership.objects.create(
            user=worker, pharmacy=pharmacy, role="PHARMACIST", employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED, is_active=True,
        )
        set_worker_personal_code(pharmacy.owner.user, membership, "1357")
        return membership

    def post_kiosk(self, body, *, token=None, view=KioskPinClockView):
        request = self.factory.post(
            "/api/v1/attendance/kiosk/pin-clock/", body, format="json",
            HTTP_X_DEVICE_TOKEN=token or self.token,
        )
        return view.as_view()(request)

    def action(self, kind, *, worker=None, device=None, token=None, request_id=None, **extra):
        worker = worker or self.worker
        device = device or self.device
        body = {"request_id": request_id or str(uuid4()), **extra}
        if self.channel == "kiosk":
            body.update(identifier=worker.email, pin="1357")
            return self.post_kiosk(body, token=token)
        # Fresh QR at the controlled request time: expiry must not masquerade as
        # a double-clock refusal at +30 or +61 seconds.
        body["qr_token"] = generate_signed_pharmacy_qr(device)["signed_token"]
        request = self.factory.post(f"/api/v1/attendance/worker/clock-{kind}/", body, format="json", HTTP_X_CLIENT_PLATFORM="mobile")
        force_authenticate(request, user=worker)
        view = WorkerClockInView if kind == "in" else WorkerClockOutView
        return view.as_view()(request)

    def assert_action(self, response, kind):
        expected_status = 201 if self.channel == "qr" and kind == "in" else 200
        self.assertEqual(response.status_code, expected_status, response.data)
        key = "action" if self.channel == "kiosk" else "status"
        self.assertEqual(response.data[key], "CLOCKED_IN" if kind == "in" else "CLOCKED_OUT")

    def establish_last_action(self, kind):
        at = self.now
        if kind == "out":
            self.now = at - timedelta(hours=1)
            self.assert_action(self.action("in"), "in")
            self.now = at
        response = self.action(kind)
        self.assert_action(response, kind)
        return response

    def attendance_snapshot(self):
        return (
            list(AttendanceSession.objects.order_by("pk").values()),
            list(AttendanceEvent.objects.order_by("pk").values()),
        )

    def assert_confirmation(self, response, last_kind, at):
        pending = "out" if last_kind == "in" else "in"
        self.assertEqual(response.status_code, 409, response.data)
        self.assertEqual(response.data.get("code"), "CONFIRM_OPPOSITE_ACTION")
        self.assertEqual(response.data.get("last_action"), "CLOCK_IN" if last_kind == "in" else "CLOCK_OUT")
        self.assertEqual(response.data.get("pending_action"), "CLOCK_OUT" if last_kind == "in" else "CLOCK_IN")
        self.assertEqual(parse_datetime(response.data.get("last_action_at", "")), at)
        self.assertEqual(response.data.get("message"), f"You just clocked {last_kind}. Clock {pending} now?")


class OppositeActionContracts:
    """Apply the same API contract to both online entry points and directions."""

    def check_prompt(self, last_kind, **extra):
        self.establish_last_action(last_kind)
        last_at = self.now
        before = self.attendance_snapshot()
        self.now += timedelta(seconds=30)
        response = self.action("out" if last_kind == "in" else "in", **extra)
        self.assert_confirmation(response, last_kind, last_at)
        self.assertEqual(self.attendance_snapshot(), before, "A prompt must not create an event or change a session.")

    def test_new_clock_out_at_30_seconds_prompts_without_mutation(self):
        self.check_prompt("in")

    def test_new_clock_in_at_30_seconds_prompts_without_mutation(self):
        self.check_prompt("out")

    def test_false_confirmation_does_not_bypass_prompt(self):
        self.check_prompt("in", confirm_opposite=False)

    def test_string_false_is_not_explicit_confirmation(self):
        self.check_prompt("in", confirm_opposite="false")

    def check_confirm(self, last_kind):
        self.establish_last_action(last_kind)
        last_at = self.now
        self.now += timedelta(seconds=30)
        kind = "out" if last_kind == "in" else "in"
        request_id = str(uuid4())
        before = self.attendance_snapshot()
        prompt = self.action(kind, request_id=request_id)
        self.assert_confirmation(prompt, last_kind, last_at)
        self.assertEqual(self.attendance_snapshot(), before)
        # No event exists for the refused request, so confirmation may reuse its ID.
        response = self.action(kind, request_id=request_id, confirm_opposite=True)
        self.assert_action(response, kind)
        self.assertEqual(AttendanceEvent.objects.count(), len(before[1]) + 1)
        session = AttendanceSession.objects.get(pk=response.data["session_id"])
        self.assertEqual(session.ended_at, self.now if kind == "out" else None)
        if kind == "in":
            self.assertEqual(session.started_at, self.now)

    def test_confirmed_clock_out_at_30_seconds_acts(self):
        self.check_confirm("in")

    def test_confirmed_clock_in_at_30_seconds_acts(self):
        self.check_confirm("out")

    def check_expired_window(self, last_kind):
        self.establish_last_action(last_kind)
        before = AttendanceEvent.objects.count()
        self.now += timedelta(seconds=61)
        kind = "out" if last_kind == "in" else "in"
        response = self.action(kind)
        self.assert_action(response, kind)
        self.assertEqual(AttendanceEvent.objects.count(), before + 1)

    def test_clock_out_at_61_seconds_acts_without_confirmation(self):
        self.check_expired_window("in")

    def test_clock_in_at_61_seconds_acts_without_confirmation(self):
        self.check_expired_window("out")

    def test_another_worker_on_same_kiosk_is_unaffected(self):
        self.establish_last_action("in")
        other = make_user("PHARMACIST")
        self.add_membership(other, self.pharmacy)
        self.now += timedelta(seconds=10)
        response = self.action("in", worker=other)
        self.assert_action(response, "in")
        self.assertEqual(AttendanceSession.objects.filter(ended_at__isnull=True).count(), 2)

    def test_same_worker_at_another_pharmacy_is_unaffected(self):
        self.establish_last_action("out")
        _, pharmacy_b = make_owner_with_pharmacy("CLOCK Pharmacy B")
        self.add_membership(self.worker, pharmacy_b)
        device_b, token_b = activate_kiosk_device(pharmacy_b.owner.user, pharmacy_b, "Counter B")
        self.now += timedelta(seconds=10)
        response = self.action("in", device=device_b, token=token_b)
        self.assert_action(response, "in")
        session = AttendanceSession.objects.get(pk=response.data["session_id"])
        self.assertEqual(session.pharmacy_id, pharmacy_b.pk)
        self.assertEqual(AttendanceSession.objects.filter(ended_at__isnull=True).count(), 1)


class KioskDoubleClockGuardTests(OppositeActionContracts, DoubleClockFixture):
    channel = "kiosk"

    def test_omitting_request_id_cannot_bypass_the_guard(self):
        self.establish_last_action("in")
        last_at = self.now
        self.now += timedelta(seconds=30)
        before = self.attendance_snapshot()
        prompt = self.post_kiosk({"identifier": self.worker.email, "pin": "1357"})
        self.assert_confirmation(prompt, "in", last_at)
        self.assertEqual(self.attendance_snapshot(), before)

    def test_same_request_id_at_30_seconds_replays_original_clock_in(self):
        request_id = str(uuid4())
        first = self.action("in", request_id=request_id)
        self.assert_action(first, "in")
        before = self.attendance_snapshot()
        self.now += timedelta(seconds=30)
        retry = self.action("in", request_id=request_id)
        self.assertEqual(retry.status_code, 200, retry.data)
        self.assertEqual(retry.data, first.data)
        self.assertEqual(self.attendance_snapshot(), before)

    def test_same_request_id_replays_clock_out_and_older_clock_in_even_with_confirm(self):
        in_id, out_id = str(uuid4()), str(uuid4())
        first = self.action("in", request_id=in_id)
        self.assert_action(first, "in")
        self.now += timedelta(hours=1)
        out = self.action("out", request_id=out_id)
        self.assert_action(out, "out")
        before = self.attendance_snapshot()
        self.now += timedelta(seconds=30)
        for request_id, original in ((in_id, first), (out_id, out)):
            retry = self.action("in", request_id=request_id, confirm_opposite=True)
            self.assertEqual(retry.status_code, 200, retry.data)
            self.assertEqual(retry.data, original.data)
        self.assertEqual(self.attendance_snapshot(), before)

    def test_pin_setup_auto_clock_in_prompts_before_consuming_otp_or_changing_pin(self):
        self.establish_last_action("out")
        last_at = self.now
        self.now += timedelta(seconds=30)
        cache = LocMemCache("clock-setup", {})
        cache_key = f"{credentials.WORKER_PIN_OTP_CACHE_PREFIX}{self.worker.pk}"
        otp = {"otp": "123456", "membership_id": self.membership.pk, "pharmacy_id": self.pharmacy.pk}
        cache.set(cache_key, otp)
        body = {"identifier": self.worker.email, "verification_code": "123456", "new_pin": "2468"}
        before = self.attendance_snapshot()
        with patch.object(credentials, "security_cache", cache), patch("users.tasks.send_async_email"):
            prompt = self.post_kiosk(body, view=KioskWorkerSetupPinView)
            self.assert_confirmation(prompt, "out", last_at)
            self.assertEqual(cache.get(cache_key), otp)
            self.assertTrue(WorkerPIN.objects.get(membership=self.membership).check_pin("1357"))
            self.assertEqual(self.attendance_snapshot(), before)
            with self.captureOnCommitCallbacks(execute=True):
                confirmed = self.post_kiosk({**body, "confirm_opposite": True}, view=KioskWorkerSetupPinView)
            self.assertEqual(confirmed.status_code, 201, confirmed.data)
            self.assertEqual(confirmed.data["action"], "CLOCKED_IN")
            self.assertIsNone(cache.get(cache_key))
            self.assertEqual(AttendanceEvent.objects.count(), len(before[1]) + 1)


class MobileQRDoubleClockGuardTests(OppositeActionContracts, DoubleClockFixture):
    channel = "qr"


class OfflineDoubleClockExemptionTests(DoubleClockFixture):
    channel = "kiosk"

    def test_signed_native_batch_keeps_rapid_clock_out_and_reentry_and_replays_unchanged(self):
        private_key = Ed25519PrivateKey.generate()
        public_key = private_key.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
        device, token = activate_kiosk_device(
            self.owner, self.pharmacy, "Native counter", client_kind="NATIVE_OFFLINE",
            public_signing_key=base64.b64encode(public_key).decode("ascii"),
        )
        start = self.now
        events, previous_hash = [], ""
        for sequence, (kind, seconds) in enumerate((("CLOCK_IN", 0), ("CLOCK_OUT", 30), ("CLOCK_IN", 45)), 1):
            payload = {
                "protocol_version": 1, "event_id": str(uuid4()), "device_id": str(device.installation_id),
                "device_seq": sequence, "employee_id": self.worker.pk, "shift_id": None,
                "event_type": kind, "device_timestamp": (start + timedelta(seconds=seconds)).isoformat(),
                "trusted_time_estimate": (start + timedelta(seconds=seconds)).isoformat(),
                "monotonic_elapsed_ms": (seconds + 1) * 1000, "boot_session_id": "clock-test-boot",
                "previous_event_hash": previous_hash,
            }
            digest = calculate_event_hash(payload)
            events.append({**payload, "event_hash": digest,
                           "signature": base64.b64encode(private_key.sign(digest.encode("ascii"))).decode("ascii")})
            previous_hash = digest
        self.now = start + timedelta(seconds=46)
        response = self.post_kiosk({"events": events}, token=token, view=KioskOfflineSyncView)
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual([row["result"] for row in response.data["results"]], ["accepted"] * 3)
        self.assertEqual(response.data["acknowledged_through"], 3)
        self.assertEqual(AttendanceEvent.objects.count(), 3)
        self.assertEqual(AttendanceSession.objects.filter(ended_at__isnull=True).count(), 1)
        before = self.attendance_snapshot()
        for submitted in events:
            evidence = KioskAttendanceEvent.objects.get(event_id=submitted["event_id"])
            self.assertEqual(evidence.canonical_payload, {k: v for k, v in submitted.items() if k not in ("event_hash", "signature")})
            self.assertEqual(evidence.integrity_flags, [])
            self.assertEqual(evidence.attendance_event.source, "OFFLINE_KIOSK")
            self.assertEqual(evidence.attendance_event.occurred_at, parse_datetime(submitted["device_timestamp"]))
        replay = self.post_kiosk({"events": events}, token=token, view=KioskOfflineSyncView)
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertEqual([row["result"] for row in replay.data["results"]], ["already_received"] * 3)
        self.assertEqual(KioskAttendanceEvent.objects.count(), 3)
        self.assertEqual(self.attendance_snapshot(), before)



class LiteralConfirmationParserTests(SimpleTestCase):
    def test_only_json_true_and_exact_lowercase_string_true_confirm(self):
        for value, expected in (
            (True, True), ("true", True),
            ("True", False), ("TRUE", False), ("false", False),
            ("1", False), (1, False), (None, False), (False, False),
            (" true", False), ("true ", False), ("", False),
        ):
            with self.subTest(value=repr(value)):
                self.assertIs(_confirm_opposite(SimpleNamespace(data={"confirm_opposite": value})), expected)

    def test_missing_confirmation_does_not_confirm(self):
        self.assertIs(_confirm_opposite(SimpleNamespace(data={})), False)
