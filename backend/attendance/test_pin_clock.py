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
        self.device, self.token = activate_kiosk_device(self.owner, self.pharmacy, "Front")
        set_worker_personal_code(self.owner, membership, "1357")
        p = patch.object(KioskPinClockView, "throttle_classes", [])
        p.start()
        self.addCleanup(p.stop)
        self.view = KioskPinClockView.as_view()

    def submit(self, request_id=None, *, confirm_opposite=False, expected_status=200, context=None):
        body = {"identifier": self.worker.email, "pin": "1357"}
        if confirm_opposite:
            # A confirmation echoes the prompt it answers (stale-intent check).
            body.update(confirm_opposite=True, **(self.prompt_context if context is None else context))
        if request_id is not None:
            body["request_id"] = request_id
        req = RequestFactory().post("/api/v1/attendance/kiosk/pin-clock/",
                                    body,
                                    content_type="application/json", HTTP_X_DEVICE_TOKEN=self.token)
        r = self.view(req)
        self.assertEqual(r.status_code, expected_status, r.data)
        if expected_status == 409 and r.data["code"] != "STALE_CONFIRMATION":
            self.assertEqual(r.data["code"], "CONFIRM_OPPOSITE_ACTION")
            self.prompt_context = {"expected_action": r.data["pending_action"],
                                   "observed_session_id": r.data["observed_session_id"]}
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
        from attendance.models import AttendanceEvent, AttendanceSession
        self.assertEqual(self.submit()["action"], "CLOCKED_IN")
        self.submit(expected_status=409)
        self.assertTrue(AttendanceSession.objects.get(user=self.worker).is_open)
        self.assertEqual(AttendanceEvent.objects.count(), 1)
        second = self.submit(confirm_opposite=True)
        self.assertEqual(second["action"], "CLOCKED_OUT", "immediate second submit did not clock out")

    def test_claim4_clock_in_right_after_clock_out_bug(self):
        from attendance.models import AttendanceEvent, AttendanceSession
        self.assertEqual(self.submit()["action"], "CLOCKED_IN")
        self.age_sessions()
        self.assertEqual(self.submit()["action"], "CLOCKED_OUT")
        before = AttendanceEvent.objects.count()
        self.submit(expected_status=409)
        self.assertEqual(AttendanceEvent.objects.count(), before)
        self.assertFalse(AttendanceSession.objects.filter(user=self.worker, ended_at__isnull=True).exists())
        third = self.submit(confirm_opposite=True)
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

        self.submit(out_id, expected_status=409)
        self.assertEqual(AttendanceEvent.objects.filter(session__user=self.worker).count(), 1)
        second = self.submit(out_id, confirm_opposite=True)
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
        self.submit(request_id, expected_status=409)
        self.assertEqual(AttendanceEvent.objects.filter(request_id=request_id).count(), 2)
        self.assertEqual(self.submit(request_id, confirm_opposite=True)["action"], "CLOCKED_OUT")
        self.assertEqual(AttendanceEvent.objects.filter(request_id=request_id).count(), 3)

    # R2: a confirmation authorizes only the prompted action against the session it was computed from.
    def assert_stale(self, context=None):
        from attendance.models import AttendanceEvent
        before = AttendanceEvent.objects.count()
        response = self.submit(confirm_opposite=True, expected_status=409, context=context)
        self.assertEqual(response["code"], "STALE_CONFIRMATION")
        self.assertEqual(AttendanceEvent.objects.count(), before)

    def test_confirmation_is_refused_after_another_device_clocked_the_worker_out(self):
        from attendance.models import AttendanceSession
        self.assertEqual(self.submit()["action"], "CLOCKED_IN")
        self.submit(expected_status=409)  # Kiosk A: "Clock out now?"
        AttendanceSession.objects.filter(user=self.worker).update(ended_at=timezone.now())  # Kiosk B clocked out.
        self.assert_stale()
        self.assertFalse(AttendanceSession.objects.filter(user=self.worker, ended_at__isnull=True).exists())

    def test_same_action_on_a_new_session_is_refused(self):
        from attendance.models import AttendanceSession
        self.assertEqual(self.submit()["action"], "CLOCKED_IN")
        self.submit(expected_status=409)
        old = AttendanceSession.objects.get(user=self.worker)
        old.ended_at = timezone.now()
        old.save()
        AttendanceSession.objects.create(user=self.worker, pharmacy=self.pharmacy, started_at=timezone.now())
        self.assert_stale()  # Still "clock out", but not of the session the worker was shown.

    def test_confirmation_without_prompt_context_is_refused(self):
        self.assertEqual(self.submit()["action"], "CLOCKED_IN")
        self.submit(expected_status=409)
        self.assert_stale(context={})
        self.assertEqual(self.submit(confirm_opposite=True)["action"], "CLOCKED_OUT")  # Fresh context still works.

    def test_confirmation_without_any_session_history_is_refused(self):
        from attendance.models import AttendanceSession
        self.assert_stale(context={"expected_action": "CLOCK_IN"})  # No prompt was ever possible here.
        self.assertFalse(AttendanceSession.objects.filter(user=self.worker).exists())

    def test_clock_out_rechecks_the_confirmed_session_under_its_own_lock(self):
        from attendance.models import AttendanceEvent, AttendanceSession
        from attendance.transitions import StaleConfirmation, clock_out
        self.assertEqual(self.submit()["action"], "CLOCKED_IN")
        session = AttendanceSession.objects.get(user=self.worker)
        before = AttendanceEvent.objects.count()
        # Verified sync replaced the session after the view validated the prompt.
        with self.assertRaises(StaleConfirmation):
            clock_out(user=self.worker, kiosk_device=self.device, raw_pin="1357", user_identifier=self.worker.email,
                      confirm_opposite=True, expected_session_id=session.pk + 1)
        self.assertEqual(AttendanceEvent.objects.count(), before)
        self.assertTrue(AttendanceSession.objects.get(pk=session.pk).is_open)

    def test_clock_in_rechecks_the_last_closed_session_under_its_lock(self):
        from attendance.models import AttendanceSession
        from attendance.transitions import StaleConfirmation, clock_in
        self.assertEqual(self.submit()["action"], "CLOCKED_IN")
        self.age_sessions()
        self.assertEqual(self.submit()["action"], "CLOCKED_OUT")
        closed = AttendanceSession.objects.get(user=self.worker)
        with self.assertRaises(StaleConfirmation):  # Verified sync closed another session after validation.
            clock_in(user=self.worker, pharmacy=self.pharmacy, kiosk_device=self.device, raw_pin="1357",
                     user_identifier=self.worker.email, confirm_opposite=True,
                     expected_closed_session_id=closed.pk + 1)
        self.assertFalse(AttendanceSession.objects.filter(user=self.worker, ended_at__isnull=True).exists())

    def test_clock_in_rolls_back_when_sync_changed_history_during_the_insert(self):
        from unittest.mock import patch
        from attendance.models import AttendanceEvent, AttendanceSession
        from attendance.transitions import StaleConfirmation, clock_in
        self.assertEqual(self.submit()["action"], "CLOCKED_IN")
        self.age_sessions()
        self.assertEqual(self.submit()["action"], "CLOCKED_OUT")
        closed = AttendanceSession.objects.get(user=self.worker).pk
        before = AttendanceEvent.objects.count()
        # The check before the insert sees the prompt's session; sync then opens and closes another one.
        with patch("attendance.transitions._last_closed_id", side_effect=[closed, closed + 1]):
            with self.assertRaises(StaleConfirmation):
                clock_in(user=self.worker, pharmacy=self.pharmacy, kiosk_device=self.device, raw_pin="1357",
                         user_identifier=self.worker.email, confirm_opposite=True, expected_closed_session_id=closed)
        self.assertFalse(AttendanceSession.objects.filter(user=self.worker, ended_at__isnull=True).exists())
        self.assertEqual(AttendanceEvent.objects.count(), before)
