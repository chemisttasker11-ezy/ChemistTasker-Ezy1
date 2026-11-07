"""M4-01: worker correction requests are comments, not manager-only events."""
from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from django.test import TestCase
from django.utils import timezone

from attendance.models import AttendanceEvent, AttendanceSession
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_staff_member
from workforce.models import ManagerAttendanceEventAudit, Timesheet, TimesheetComment, TimesheetPeriod

BASE = "/api/v1/workforce/"
TZ = ZoneInfo("Australia/Brisbane")


class M4WorkerCorrectionContracts(TestCase):
    def setUp(self):
        self.tom, self.pharmacy = make_owner_with_pharmacy("M4 Timesheet A")
        self.nadia, self.other = make_owner_with_pharmacy("M4 Timesheet B")
        self.pharmacy.time_zone = TZ.key
        self.pharmacy.save(update_fields=["time_zone"])
        self.worker, membership = make_staff_member(self.pharmacy, role="ASSISTANT")
        self.membership = membership
        day = timezone.localtime(timezone.now(), TZ).date() - timedelta(days=8)
        self.day = day
        self.local_in = datetime.combine(day, time(9, 0), tzinfo=TZ)
        self.local_out = datetime.combine(day, time(17, 0), tzinfo=TZ)
        self.period = TimesheetPeriod.objects.create(
            pharmacy=self.pharmacy, start_date=day, end_date=day,
            timezone=TZ.key, created_by=self.tom,
        )
        self.timesheet = Timesheet.objects.create(
            period=self.period, user=self.worker, membership=membership,
        )
        self.session = AttendanceSession.objects.create(
            pharmacy=self.pharmacy, user=self.worker,
            source_membership=membership, started_at=self.local_in,
            is_provisional=False,
        )
        self.clock_in = AttendanceEvent.objects.create(
            session=self.session, event_type=AttendanceEvent.EventType.CLOCK_IN,
            occurred_at=self.local_in, source=AttendanceEvent.Source.QR_KIOSK,
        )

    def url(self, action):
        return f"{BASE}timesheets/{self.timesheet.pk}/{action}/"

    def test_owner_can_submit_worker_visible_request_but_foreign_user_cannot(self):
        body = "Missing CLOCK_OUT, 2026-07-10 17:00, because the QR kiosk was offline."
        own = client_for(self.worker).post(
            self.url("comments"), {"body": body, "worker_visible": False}, format="json",
        )
        self.assertEqual(own.status_code, 201, own.data)
        row = TimesheetComment.objects.get(pk=own.data["id"])
        self.assertEqual(row.body, body)
        self.assertEqual(row.author_id, self.worker.pk)
        self.assertTrue(row.worker_visible, "workers cannot hide their own comment")
        self.assertEqual(AttendanceEvent.objects.filter(session=self.session).count(), 1)
        foreign = client_for(self.nadia).post(
            self.url("comments"), {"body": body}, format="json",
        )
        self.assertEqual(foreign.status_code, 403, foreign.data)
        self.assertEqual(TimesheetComment.objects.count(), 1)
        self.assertEqual(client_for(self.worker).post(
            self.url("comments"), {"body": " "}, format="json",
        ).status_code, 400)
        self.assertEqual(client_for(self.worker).post(
            f"{BASE}timesheets/999999/comments/", {"body": body}, format="json",
        ).status_code, 404)
        self.assertEqual(client_for().post(
            self.url("comments"), {"body": body}, format="json",
        ).status_code, 401)

    def test_worker_cannot_inject_attendance_event_even_on_own_timesheet(self):
        request = {
            "session_id": self.session.pk, "event_type": "CLOCK_OUT",
            "occurred_at_local": f"{self.day}T17:00", "reason": "Missed kiosk clock out",
        }
        for actor in (self.worker, self.nadia):
            with self.subTest(actor=actor.email):
                response = client_for(actor).post(
                    self.url("missing-punch"), request, format="json",
                )
                self.assertEqual(response.status_code, 403, response.data)
        self.assertEqual(AttendanceEvent.objects.filter(session=self.session).count(), 1)
        self.assertFalse(ManagerAttendanceEventAudit.objects.exists())

    def test_manager_local_missing_punch_preserves_original_and_creates_audit(self):
        original = self.clock_in.occurred_at
        response = client_for(self.tom).post(
            self.url("missing-punch"), {
                "session_id": self.session.pk, "event_type": "CLOCK_OUT",
                "occurred_at_local": f"{self.day}T17:00",
                "reason": "Checked against roster and kiosk outage",
            }, format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertIn("created_event_id", response.data)
        appended = AttendanceEvent.objects.get(pk=response.data["created_event_id"])
        self.assertEqual(appended.event_type, "CLOCK_OUT")
        self.assertEqual(appended.occurred_at, self.local_out)
        self.assertEqual(appended.source, AttendanceEvent.Source.MANAGER)
        self.assertTrue(ManagerAttendanceEventAudit.objects.filter(event=appended).exists())
        self.clock_in.refresh_from_db()
        self.assertEqual(self.clock_in.occurred_at, original)
        again = client_for(self.tom).post(
            self.url("missing-punch"), {
                "session_id": self.session.pk, "event_type": "CLOCK_OUT",
                "occurred_at_local": f"{self.day}T17:00",
                "reason": "Duplicate correction",
            }, format="json",
        )
        self.assertEqual(again.status_code, 400)

    def test_local_offset_and_invalid_sessions_are_rejected(self):
        client = client_for(self.tom)
        payload = {
            "session_id": self.session.pk, "event_type": "CLOCK_OUT",
            "occurred_at_local": f"{self.day}T17:00+10:00", "reason": "bad local offset",
        }
        self.assertEqual(client.post(
            self.url("missing-punch"), payload, format="json",
        ).status_code, 400)
        payload.update(occurred_at_local=f"{self.day}T17:00", session_id=999999)
        self.assertEqual(client.post(
            self.url("missing-punch"), payload, format="json",
        ).status_code, 404)
        self.assertEqual(AttendanceEvent.objects.filter(session=self.session).count(), 1)

    def test_my_hours_are_own_user_scoped_even_for_managers(self):
        mine = client_for(self.worker).get(BASE + "my-hours/")
        self.assertEqual(mine.status_code, 200, mine.data)
        self.assertEqual([row["id"] for row in mine.data], [self.timesheet.pk])
        manager = client_for(self.tom).get(BASE + "my-hours/")
        self.assertEqual(manager.status_code, 200, manager.data)
        self.assertEqual(manager.data, [])
        other = client_for(self.nadia).get(BASE + "my-hours/")
        self.assertEqual(other.status_code, 200, other.data)
        self.assertEqual(other.data, [])
