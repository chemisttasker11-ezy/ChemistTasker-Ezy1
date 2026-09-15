"""SQLite checks for the attendance session/event foundation.

Run directly so Django's test database setup cannot discover production
settings or migration modules::

    python -m unittest attendance_tests.test_model_foundation
"""

import importlib
import os
import unittest
from datetime import timedelta
from unittest.mock import patch

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "attendance_tests.settings")

import django

django.setup()

from django.core.exceptions import ValidationError
from django.db import IntegrityError, connection
from django.utils import timezone

from client_profile.models import (
    AttendanceCorrection,
    AttendanceEvent,
    AttendanceSession,
    PharmacyQRSession,
    ProvisionalAttendance,
    WorkerPIN,
)


SCHEMA_MODELS = (
    AttendanceSession,
    AttendanceEvent,
    ProvisionalAttendance,
    AttendanceCorrection,
)


class TemporaryAttendanceSchemaTests(unittest.TestCase):
    """Creates only the new attendance tables in disposable in-memory SQLite."""

    @classmethod
    def setUpClass(cls):
        super().setUpClass()
        with connection.schema_editor() as editor:
            for model in SCHEMA_MODELS:
                editor.create_model(model)
        connection.disable_constraint_checking()

    @classmethod
    def tearDownClass(cls):
        connection.disable_constraint_checking()
        with connection.schema_editor() as editor:
            for model in reversed(SCHEMA_MODELS):
                editor.delete_model(model)
        connection.enable_constraint_checking()
        super().tearDownClass()

    def test_only_one_open_session_per_worker_across_pharmacies(self):
        now = timezone.now()
        AttendanceSession.objects.create(
            pharmacy_id=11,
            user_id=101,
            started_at=now,
        )

        with self.assertRaises(IntegrityError):
            AttendanceSession.objects.create(
                pharmacy_id=12,
                user_id=101,
                started_at=now + timedelta(minutes=1),
            )

        AttendanceSession.objects.create(
            pharmacy_id=11,
            user_id=102,
            started_at=now - timedelta(hours=9),
            ended_at=now - timedelta(hours=1),
        )
        AttendanceSession.objects.create(
            pharmacy_id=12,
            user_id=102,
            started_at=now,
        )

    def test_session_end_cannot_precede_start(self):
        now = timezone.now()
        with self.assertRaises(IntegrityError):
            AttendanceSession.objects.create(
                pharmacy_id=21,
                user_id=201,
                started_at=now,
                ended_at=now - timedelta(seconds=1),
            )

    def test_events_are_append_only_through_instance_and_queryset(self):
        now = timezone.now()
        session = AttendanceSession.objects.create(
            pharmacy_id=31,
            user_id=301,
            started_at=now,
        )
        event = AttendanceEvent.objects.create(
            session=session,
            event_type=AttendanceEvent.EventType.CLOCK_IN,
            occurred_at=now,
            source=AttendanceEvent.Source.MOBILE_QR,
        )

        event.occurred_at = now + timedelta(minutes=5)
        with self.assertRaises(ValidationError):
            event.save()
        with self.assertRaises(ValidationError):
            AttendanceEvent.objects.filter(pk=event.pk).update(
                occurred_at=now + timedelta(minutes=5)
            )
        with self.assertRaises(ValidationError):
            event.delete()
        with self.assertRaises(ValidationError):
            AttendanceEvent.objects.filter(pk=event.pk).delete()

    def test_provisional_review_is_unique_to_session_and_has_valid_decision_state(self):
        now = timezone.now()
        session = AttendanceSession.objects.create(
            pharmacy_id=41,
            user_id=401,
            started_at=now,
            is_provisional=True,
        )
        ProvisionalAttendance.objects.create(
            session=session,
            cover_type=ProvisionalAttendance.CoverType.UNROSTERED_LOCAL,
        )

        with self.assertRaises(IntegrityError):
            ProvisionalAttendance.objects.create(
                session=session,
                cover_type=ProvisionalAttendance.CoverType.CROSS_SITE_CHAIN,
            )

        decided_session = AttendanceSession.objects.create(
            pharmacy_id=41,
            user_id=402,
            started_at=now,
            is_provisional=True,
        )
        with self.assertRaises(IntegrityError):
            ProvisionalAttendance.objects.create(
                session=decided_session,
                cover_type=ProvisionalAttendance.CoverType.UNROSTERED_LOCAL,
                status=ProvisionalAttendance.Status.APPROVED,
                decided_at=None,
            )

    def test_corrections_are_append_only_and_preserve_the_original_event(self):
        now = timezone.now()
        session = AttendanceSession.objects.create(
            pharmacy_id=51,
            user_id=501,
            started_at=now,
        )
        event = AttendanceEvent.objects.create(
            session=session,
            event_type=AttendanceEvent.EventType.CLOCK_IN,
            occurred_at=now,
            source=AttendanceEvent.Source.MANAGER,
        )
        correction = AttendanceCorrection.objects.create(
            original_event=event,
            corrected_timestamp=now - timedelta(minutes=2),
            reason="Manager verified the written arrival record.",
        )

        correction.reason = "changed"
        with self.assertRaises(ValidationError):
            correction.save()
        self.assertEqual(
            AttendanceEvent.objects.get(pk=event.pk).occurred_at,
            now,
        )


class CredentialBoundaryTests(unittest.TestCase):
    def test_qr_expires_at_exact_deadline(self):
        deadline = timezone.now()
        qr = PharmacyQRSession(expires_at=deadline)
        with patch("client_profile.models.timezone.now", return_value=deadline):
            self.assertTrue(qr.is_expired)
        with patch(
            "client_profile.models.timezone.now",
            return_value=deadline - timedelta(microseconds=1),
        ):
            self.assertFalse(qr.is_expired)

    def test_personal_code_keeps_leading_zeroes_and_is_hashed(self):
        worker_pin = WorkerPIN()
        worker_pin.set_pin("012345")
        self.assertNotEqual(worker_pin.pin_hash, "012345")
        self.assertTrue(worker_pin.check_pin("012345"))
        self.assertFalse(worker_pin.check_pin("12345"))


class MigrationQuarantineTests(unittest.TestCase):
    def test_active_migration_has_no_schema_operation_and_fails_clearly(self):
        migration = importlib.import_module(
            "client_profile.migrations.0044_roster_v2_and_attendance_v1"
        )
        self.assertEqual(len(migration.Migration.operations), 1)
        with self.assertRaisesRegex(RuntimeError, "quarantined"):
            migration.stop_quarantined_migration(None, None)
        with self.assertRaisesRegex(RuntimeError, "quarantined"):
            migration.Migration.operations[0].reverse_code(None, None)


if __name__ == "__main__":
    unittest.main()
