"""PIN toggle and explicit retry identity regressions."""
from datetime import timedelta
from unittest.mock import patch
from uuid import uuid4

from django.test import RequestFactory, TestCase
from django.utils import timezone

from client_profile.characterization_support import make_owner_with_pharmacy, make_user


class KioskPinClockTests(TestCase):
    def setUp(self):
        from attendance.credentials import activate_kiosk_device, set_worker_personal_code
        from attendance.kiosk_api import KioskPinClockView
        from client_profile.models import Membership
        self.owner, self.pharmacy = make_owner_with_pharmacy("Kiosk203")
        self.worker = make_user("PHARMACIST")
        membership = Membership.objects.create(
            user=self.worker, pharmacy=self.pharmacy, role="PHARMACIST", employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED, is_active=True,
        )
        _, self.token = activate_kiosk_device(self.owner, self.pharmacy, "Front")
        set_worker_personal_code(self.owner, membership, "1357")
        p = patch.object(KioskPinClockView, "throttle_classes", [])
        p.start()
        self.addCleanup(p.stop)
        self.view = KioskPinClockView.as_view()

    def submit(self, request_id=None):
        body = {"identifier": self.worker.email, "pin": "1357"}
        if request_id is not None:
            body["request_id"] = request_id
        req = RequestFactory().post("/api/v1/attendance/kiosk/pin-clock/",
                                    body,
                                    content_type="application/json", HTTP_X_DEVICE_TOKEN=self.token)
        r = self.view(req)
        self.assertEqual(r.status_code, 200, r.data)
        return r.data

    def age_sessions(self, seconds=60):
        from attendance.models import AttendanceSession
        past = timezone.now() - timedelta(seconds=seconds)
        for s in AttendanceSession.objects.filter(user=self.worker):
            s.started_at = past - timedelta(seconds=5)
            if s.ended_at:
                s.ended_at = past
            s.save()

    def test_claim4_clock_out_right_after_clock_in_bug(self):
        from attendance.models import AttendanceSession
        self.assertEqual(self.submit()["action"], "CLOCKED_IN")
        second = self.submit()  # worker clocked in by mistake and now wants out
        self.assertEqual(second["action"], "CLOCKED_OUT", "immediate second submit did not clock out")

    def test_claim4_clock_in_right_after_clock_out_bug(self):
        self.assertEqual(self.submit()["action"], "CLOCKED_IN")
        self.age_sessions()
        self.assertEqual(self.submit()["action"], "CLOCKED_OUT")
        third = self.submit()  # wants to clock straight back in
        self.assertEqual(third["action"], "CLOCKED_IN", "immediate submit after clock-out did not clock in")

    def test_claim4_toggle_outside_window_control(self):
        from attendance.models import AttendanceSession
        self.assertEqual(self.submit()["action"], "CLOCKED_IN")
        self.age_sessions()
        self.assertEqual(self.submit()["action"], "CLOCKED_OUT")
        self.assertFalse(AttendanceSession.objects.filter(user=self.worker, ended_at__isnull=True).exists())

    def test_request_id_replays_each_result_without_an_extra_event(self):
        from attendance.models import AttendanceEvent
        in_id, out_id = str(uuid4()), str(uuid4())
        first = self.submit(in_id)
        self.assertEqual(first["action"], "CLOCKED_IN")
        self.assertEqual(self.submit(in_id), first)
        self.assertEqual(AttendanceEvent.objects.filter(session__user=self.worker).count(), 1)

        second = self.submit(out_id)
        self.assertEqual(second["action"], "CLOCKED_OUT")
        self.assertEqual(self.submit(out_id), second)
        self.assertEqual(self.submit(in_id), first)
        self.assertEqual(AttendanceEvent.objects.filter(session__user=self.worker).count(), 2)
        self.assertEqual(AttendanceEvent.objects.filter(
            session__user=self.worker, request_id=in_id,
        ).count(), 1)

    def test_request_id_is_scoped_to_worker_and_kiosk(self):
        from attendance.credentials import activate_kiosk_device, set_worker_personal_code
        from attendance.models import AttendanceEvent
        from client_profile.models import Membership
        request_id = str(uuid4())
        self.assertEqual(self.submit(request_id)["action"], "CLOCKED_IN")
        original_worker = self.worker
        self.worker = make_user("PHARMACIST")
        membership = Membership.objects.create(
            user=self.worker, pharmacy=self.pharmacy, role="PHARMACIST", employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED, is_active=True,
        )
        set_worker_personal_code(self.owner, membership, "1357")
        self.assertEqual(self.submit(request_id)["action"], "CLOCKED_IN")
        self.worker = original_worker
        _, self.token = activate_kiosk_device(self.owner, self.pharmacy, "Other counter")
        self.assertEqual(self.submit(request_id)["action"], "CLOCKED_OUT")
        self.assertEqual(AttendanceEvent.objects.filter(request_id=request_id).count(), 3)
