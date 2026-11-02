"""Tests proving rostered attendance correction and approval locking behavior.

Core rules proven:
1. A manager's correction is audited and never edits the raw event.
2. Workers and other pharmacies' managers cannot correct attendance.
3. Positive controls: destination pharmacy owner and scoped manager can correct.
4. Correction chronology validates against effective timestamps.
"""
from datetime import datetime, time, timedelta
from queue import Queue
from threading import Barrier, Thread
from unittest import skipUnless
from zoneinfo import ZoneInfo

from django.core.exceptions import PermissionDenied, ValidationError
from django.db import close_old_connections, connection
from django.test import TestCase, TransactionTestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework import status
from rest_framework.test import APIRequestFactory, force_authenticate

from attendance.approvals import create_attendance_correction, get_effective_session_timeline
from attendance.models import AttendanceCorrection, AttendanceEvent, AttendanceSession
from attendance.views import ManagerCreateCorrectionView
from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from memberships.models import Membership
from organizations.models import Organization
from shifts.models import Shift, ShiftSlot, ShiftSlotAssignment
from users.models import OrganizationMembership, User
from workforce.models import RosterPeriod


class RosteredCorrectionFixture:
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Rostered Attendance Pharmacy")
        if not getattr(self.pharmacy, "organization", None):
            self.org = Organization.objects.create(name="Rostered Attendance Org")
            self.pharmacy.organization = self.org
            self.pharmacy.save(update_fields=["organization"])
        else:
            self.org = self.pharmacy.organization

        self.worker = make_user("PHARMACIST")
        self.membership = Membership.objects.create(
            pharmacy=self.pharmacy,
            user=self.worker,
            role="PHARMACIST",
            employment_type="FULL_TIME",
            status=Membership.Status.ACCEPTED,
            is_active=True,
        )

        self.tz = ZoneInfo("Australia/Brisbane")
        now_local = timezone.now().astimezone(self.tz)
        # Anchor work_date in the past so events and corrections precede current time
        self.work_date = (now_local - timedelta(days=7)).date()
        monday = self.work_date - timedelta(days=self.work_date.weekday())

        self.roster_period = RosterPeriod.objects.create(
            pharmacy=self.pharmacy,
            week_start=monday,
            status=RosterPeriod.Status.DRAFT,
            created_by=self.owner,
        )
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            created_by=self.owner,
            dedicated_user=self.worker,
            role_needed="PHARMACIST",
            employment_type="FULL_TIME",
            min_hourly_rate=50,
            max_hourly_rate=50,
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift,
            date=self.work_date,
            start_time=time(8, 0),
            end_time=time(16, 0),
            planned_break_minutes=30,
            roster_period=self.roster_period,
        )
        self.assignment = ShiftSlotAssignment.objects.create(
            shift=self.shift,
            slot=self.slot,
            slot_date=self.work_date,
            user=self.worker,
            is_rostered=True,
        )
        self.roster_period.status = RosterPeriod.Status.PUBLISHED
        self.roster_period.save(update_fields=["status"])

        # Baseline raw attendance: 08:05 clock-in, 12:00 break start, 12:30 break end, 16:00 clock-out
        self.start_dt = datetime.combine(self.work_date, time(8, 5), tzinfo=self.tz)
        self.break_start_dt = datetime.combine(self.work_date, time(12, 0), tzinfo=self.tz)
        self.break_end_dt = datetime.combine(self.work_date, time(12, 30), tzinfo=self.tz)
        self.end_dt = datetime.combine(self.work_date, time(16, 0), tzinfo=self.tz)

        self.session = AttendanceSession.objects.create(
            pharmacy=self.pharmacy,
            user=self.worker,
            assignment=self.assignment,
            source_membership=self.membership,
            started_at=self.start_dt,
            ended_at=self.end_dt,
            is_provisional=False,
        )
        self.clock_in = AttendanceEvent.objects.create(
            session=self.session,
            event_type=AttendanceEvent.EventType.CLOCK_IN,
            occurred_at=self.start_dt,
            source=AttendanceEvent.Source.QR_KIOSK,
        )
        self.break_start = AttendanceEvent.objects.create(
            session=self.session,
            event_type=AttendanceEvent.EventType.BREAK_START,
            occurred_at=self.break_start_dt,
            source=AttendanceEvent.Source.QR_KIOSK,
        )
        self.break_end = AttendanceEvent.objects.create(
            session=self.session,
            event_type=AttendanceEvent.EventType.BREAK_END,
            occurred_at=self.break_end_dt,
            source=AttendanceEvent.Source.QR_KIOSK,
        )
        self.clock_out = AttendanceEvent.objects.create(
            session=self.session,
            event_type=AttendanceEvent.EventType.CLOCK_OUT,
            occurred_at=self.end_dt,
            source=AttendanceEvent.Source.QR_KIOSK,
        )


class RosteredCorrectionContracts(RosteredCorrectionFixture, TestCase):
    def test_manager_correction_is_audited_and_never_edits_raw_event(self):
        """Rule 1: a manager's correction is audited and never edits the raw event."""
        raw_occurred = self.clock_in.occurred_at
        raw_recorded = self.clock_in.recorded_at
        corrected_dt = datetime.combine(self.work_date, time(8, 0), tzinfo=self.tz)
        reason_text = "Align clock in to scheduled roster start"

        # Apply initial manager correction
        correction = create_attendance_correction(
            self.owner,
            self.clock_in.pk,
            corrected_timestamp=corrected_dt,
            reason=reason_text,
        )

        # 1. Assert raw event record remains unmodified
        self.clock_in.refresh_from_db()
        self.assertEqual(self.clock_in.occurred_at, raw_occurred)
        self.assertEqual(self.clock_in.recorded_at, raw_recorded)
        self.assertEqual(self.clock_in.event_type, AttendanceEvent.EventType.CLOCK_IN)
        self.assertEqual(self.clock_in.source, AttendanceEvent.Source.QR_KIOSK)

        # 2. Assert audit correction record exists with exact metadata
        self.assertEqual(correction.original_event_id, self.clock_in.pk)
        self.assertEqual(correction.corrected_timestamp, corrected_dt)
        self.assertEqual(correction.reason, reason_text)
        self.assertEqual(correction.corrected_by_id, self.owner.pk)
        self.assertIsNotNone(correction.corrected_at)

        # 3. Assert timeline resolution computes effective timestamp while preserving raw timestamp
        timeline = get_effective_session_timeline(self.session)
        self.assertEqual(len(timeline), 4)
        clock_in_entry = next(entry for entry in timeline if entry["event_id"] == self.clock_in.pk)
        self.assertTrue(clock_in_entry["is_corrected"])
        self.assertEqual(clock_in_entry["original_timestamp"], raw_occurred)
        self.assertEqual(clock_in_entry["effective_timestamp"], corrected_dt)
        self.assertEqual(clock_in_entry["correction_id"], correction.pk)
        self.assertEqual(clock_in_entry["correction_reason"], reason_text)
        self.assertEqual(clock_in_entry["corrected_by_id"], self.owner.pk)

        # 4. Sequential second correction: appends another audit row without mutating raw event
        corrected_dt_2 = datetime.combine(self.work_date, time(7, 55), tzinfo=self.tz)
        correction2 = create_attendance_correction(
            self.owner,
            self.clock_in.pk,
            corrected_timestamp=corrected_dt_2,
            reason="Second adjustment before shift opening duties",
        )
        self.clock_in.refresh_from_db()
        self.assertEqual(self.clock_in.occurred_at, raw_occurred)
        self.assertEqual(self.clock_in.corrections.count(), 2)

        updated_timeline = get_effective_session_timeline(self.session)
        updated_clock_in = next(entry for entry in updated_timeline if entry["event_id"] == self.clock_in.pk)
        self.assertEqual(updated_clock_in["effective_timestamp"], corrected_dt_2)
        self.assertEqual(updated_clock_in["correction_id"], correction2.pk)

    def test_workers_and_wrong_site_managers_cannot_correct(self):
        """Rule 3: workers and other pharmacies' managers cannot correct."""
        corrected_dt = datetime.combine(self.work_date, time(8, 0), tzinfo=self.tz)

        # Worker cannot correct attendance
        with self.assertRaises(PermissionDenied):
            create_attendance_correction(
                self.worker,
                self.clock_in.pk,
                corrected_timestamp=corrected_dt,
                reason="Worker self adjustment",
            )

        # Wrong-site pharmacy manager cannot correct attendance
        other_owner, _ = make_owner_with_pharmacy("Unrelated Other Pharmacy")
        with self.assertRaises(PermissionDenied):
            create_attendance_correction(
                other_owner,
                self.clock_in.pk,
                corrected_timestamp=corrected_dt,
                reason="Cross-pharmacy unauthorized correction",
            )

        # Ensure no correction records were created
        self.assertEqual(AttendanceCorrection.objects.filter(original_event=self.clock_in).count(), 0)

        # Negative controls via API endpoint
        factory = APIRequestFactory()
        payload = {
            "event_id": self.clock_in.pk,
            "corrected_timestamp": corrected_dt.isoformat(),
            "reason": "API attempt",
        }

        # Worker POST returns 403
        req_worker = factory.post("/api/v1/attendance/manager/correct/", payload, format="json")
        force_authenticate(req_worker, user=self.worker)
        resp_worker = ManagerCreateCorrectionView.as_view()(req_worker)
        self.assertEqual(resp_worker.status_code, status.HTTP_403_FORBIDDEN)

        # Wrong-site manager POST returns 403
        req_other = factory.post("/api/v1/attendance/manager/correct/", payload, format="json")
        force_authenticate(req_other, user=other_owner)
        resp_other = ManagerCreateCorrectionView.as_view()(req_other)
        self.assertEqual(resp_other.status_code, status.HTTP_403_FORBIDDEN)

    def test_positive_controls_owner_and_scoped_manager_can_correct(self):
        """Positive controls: destination pharmacy owner and scoped manager can correct."""
        # Positive control 1: Owner corrects clock-out
        corrected_out = datetime.combine(self.work_date, time(16, 15), tzinfo=self.tz)
        corr_owner = create_attendance_correction(
            self.owner,
            self.clock_out.pk,
            corrected_timestamp=corrected_out,
            reason="Owner verified late handover",
        )
        self.assertIsNotNone(corr_owner.pk)
        self.assertEqual(corr_owner.corrected_by_id, self.owner.pk)

        # Positive control 2: Scoped organization manager with ROSTER_MANAGER authority
        scoped_user = make_user("EXPLORER")
        scoped_membership = OrganizationMembership.objects.create(
            user=scoped_user,
            organization=self.org,
            role="REGION_ADMIN",
            admin_level="ROSTER_MANAGER",
            region="Brisbane",
            job_title="Regional Lead",
        )
        scoped_membership.pharmacies.add(self.pharmacy)

        corrected_break_start = datetime.combine(self.work_date, time(12, 10), tzinfo=self.tz)
        corr_scoped = create_attendance_correction(
            scoped_user,
            self.break_start.pk,
            corrected_timestamp=corrected_break_start,
            reason="Scoped manager adjusted break time",
        )
        self.assertIsNotNone(corr_scoped.pk)
        self.assertEqual(corr_scoped.corrected_by_id, scoped_user.pk)

        # Scoped manager via API endpoint returns 200 with CORRECTED status
        factory = APIRequestFactory()
        corrected_break_end = datetime.combine(self.work_date, time(12, 40), tzinfo=self.tz)
        req_scoped = factory.post(
            "/api/v1/attendance/manager/correct/",
            {
                "event_id": self.break_end.pk,
                "corrected_timestamp": corrected_break_end.isoformat(),
                "reason": "Scoped manager updated break return",
            },
            format="json",
        )
        force_authenticate(req_scoped, user=scoped_user)
        resp_scoped = ManagerCreateCorrectionView.as_view()(req_scoped)
        self.assertEqual(resp_scoped.status_code, status.HTTP_200_OK)
        self.assertEqual(resp_scoped.data["status"], "CORRECTED")

    def test_reason_is_required_and_trimmed(self):
        """Correction requires a non-empty reason and trims whitespace."""
        corrected_dt = datetime.combine(self.work_date, time(8, 0), tzinfo=self.tz)

        # Empty reason refused
        with self.assertRaises(ValidationError):
            create_attendance_correction(
                self.owner,
                self.clock_in.pk,
                corrected_timestamp=corrected_dt,
                reason="",
            )

        # Whitespace-only reason refused
        with self.assertRaises(ValidationError):
            create_attendance_correction(
                self.owner,
                self.clock_in.pk,
                corrected_timestamp=corrected_dt,
                reason="   \t\n  ",
            )

        # Reason with padding is trimmed on persistence
        corr = create_attendance_correction(
            self.owner,
            self.clock_in.pk,
            corrected_timestamp=corrected_dt,
            reason="   Adjusted for inventory check   ",
        )
        self.assertEqual(corr.reason, "Adjusted for inventory check")

    def test_future_timestamp_is_refused(self):
        """Corrected timestamp cannot be in the future."""
        future_dt = timezone.now() + timedelta(hours=3)
        with self.assertRaises(ValidationError) as ctx:
            create_attendance_correction(
                self.owner,
                self.clock_in.pk,
                corrected_timestamp=future_dt,
                reason="Future clock in",
            )
        self.assertIn("future", str(ctx.exception).lower())

    def test_chronology_validation_against_effective_events(self):
        """Session chronology is strictly enforced against effective event timestamps."""
        # 1. Clock-in cannot be corrected to after existing break-start
        after_break = datetime.combine(self.work_date, time(12, 1), tzinfo=self.tz)
        with self.assertRaises(ValidationError):
            create_attendance_correction(
                self.owner,
                self.clock_in.pk,
                corrected_timestamp=after_break,
                reason="Clock in after break start",
            )

        # 2. Clock-out cannot be corrected to before break-end
        before_break_end = datetime.combine(self.work_date, time(12, 29), tzinfo=self.tz)
        with self.assertRaises(ValidationError):
            create_attendance_correction(
                self.owner,
                self.clock_out.pk,
                corrected_timestamp=before_break_end,
                reason="Clock out before break end",
            )

        # 3. Break-start cannot be before clock-in or after break-end
        with self.assertRaises(ValidationError):
            create_attendance_correction(
                self.owner,
                self.break_start.pk,
                corrected_timestamp=datetime.combine(self.work_date, time(8, 0), tzinfo=self.tz),
                reason="Break start before clock in",
            )
        with self.assertRaises(ValidationError):
            create_attendance_correction(
                self.owner,
                self.break_start.pk,
                corrected_timestamp=datetime.combine(self.work_date, time(12, 35), tzinfo=self.tz),
                reason="Break start after break end",
            )

        # 4. Effective chronology check:
        # Extend clock-out to 17:00
        extended_out = datetime.combine(self.work_date, time(17, 0), tzinfo=self.tz)
        create_attendance_correction(
            self.owner,
            self.clock_out.pk,
            corrected_timestamp=extended_out,
            reason="Overtime extension",
        )

        # Now break-end can be corrected to 16:30 (after raw 16:00, but before effective 17:00)
        corr_be = create_attendance_correction(
            self.owner,
            self.break_end.pk,
            corrected_timestamp=datetime.combine(self.work_date, time(16, 30), tzinfo=self.tz),
            reason="Delayed afternoon break",
        )
        self.assertIsNotNone(corr_be.pk)

        # But break-end cannot exceed the effective 17:00 clock-out
        with self.assertRaises(ValidationError):
            create_attendance_correction(
                self.owner,
                self.break_end.pk,
                corrected_timestamp=datetime.combine(self.work_date, time(17, 5), tzinfo=self.tz),
                reason="Break end after effective clock out",
            )


@skipUnless(connection.vendor == "postgresql", "Requires independent PostgreSQL transactions and row locks.")
class RosteredCorrectionPostgresContracts(RosteredCorrectionFixture, TransactionTestCase):
    def test_select_for_update_locks_attendance_event_during_correction(self):
        """Correction queries acquire a row lock targeting AttendanceEvent."""
        corrected_dt = datetime.combine(self.work_date, time(8, 0), tzinfo=self.tz)
        with CaptureQueriesContext(connection) as captured:
            create_attendance_correction(
                self.owner,
                self.clock_in.pk,
                corrected_timestamp=corrected_dt,
                reason="Verify FOR UPDATE lock",
            )
        locking = [q["sql"] for q in captured.captured_queries if "FOR UPDATE" in q["sql"]]
        self.assertTrue(locking, "No FOR UPDATE lock query was executed during correction.")
        self.assertIn(AttendanceEvent._meta.db_table, locking[0])

    def test_concurrent_corrections_serialize_cleanly(self):
        """Concurrent corrections to separate events in a session serialize without corruption."""
        barrier = Barrier(2)
        results = Queue()

        event_targets = [
            (
                self.clock_in.pk,
                datetime.combine(self.work_date, time(8, 0), tzinfo=self.tz),
                "Concurrent clock-in correction",
            ),
            (
                self.clock_out.pk,
                datetime.combine(self.work_date, time(16, 30), tzinfo=self.tz),
                "Concurrent clock-out correction",
            ),
        ]

        def correct_worker(event_id, target_time, reason):
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                    cursor.execute("SET statement_timeout = '10s'")
                manager = User.objects.get(pk=self.owner.pk)
                barrier.wait(timeout=10)
                row = create_attendance_correction(
                    manager,
                    event_id,
                    corrected_timestamp=target_time,
                    reason=reason,
                )
                results.put(("ok", row.pk))
            except Exception as exc:
                results.put(("unexpected", repr(exc)))
            finally:
                connection.close()

        threads = [
            Thread(target=correct_worker, args=target, daemon=True)
            for target in event_targets
        ]
        for t in threads:
            t.start()
        for t in threads:
            t.join(timeout=20)

        self.assertTrue(all(not t.is_alive() for t in threads), "Concurrent correction threads did not finish.")
        outcomes = [results.get(timeout=2) for _ in threads]
        self.assertTrue(all(kind == "ok" for kind, _ in outcomes), outcomes)
        self.assertEqual(AttendanceCorrection.objects.filter(original_event__session=self.session).count(), 2)
