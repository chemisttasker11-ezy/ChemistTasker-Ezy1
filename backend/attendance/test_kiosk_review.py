"""PR-B contracts for manage.py test --settings core.postgres_test_settings.

Uses Django's migrated schema, without standalone harnesses or skip guards.
"""
import base64
import json
import subprocess
import sys
import uuid
from contextlib import nullcontext
from datetime import timedelta
from pathlib import Path
from queue import Queue
from threading import Event, Thread, current_thread
from unittest.mock import patch

from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
from django.db import OperationalError, close_old_connections, connection, transaction
from django.test import TestCase, TransactionTestCase
from django.utils import timezone

from attendance.models import (
    AttendanceEvent, AttendanceSession, KioskAttendanceEvent, KioskAttendanceReview, KioskDevice,
)
from attendance.protocol import calculate_event_hash, sync_offline_batch
from attendance import kiosk_review
from attendance.credentials import revoke_kiosk_device, set_worker_personal_code
from attendance.transitions import clock_out, start_break
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from memberships.models import Membership
from organizations.models import PharmacyAdmin


PENDING = "/api/v1/attendance/manager/kiosk-review/pending/"
DECIDE = "/api/v1/attendance/manager/kiosk-review/decide/"
# Independent of production: removing a blocked flag must not weaken coverage.
BLOCKED_FLAGS = (
    "HASH_CHAIN_MISMATCH", "SEQUENCE_GAP", "UNEXPECTED_INITIAL_HASH",
    "DEVICE_REVOKED_DRAIN", "MONOTONIC_ROLLBACK",
)


class KioskReviewFixture:
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Evidence Review Pharmacy")
        self.pharmacy.timezone = "Australia/Brisbane"
        self.pharmacy.save(update_fields=["timezone"])
        self.manager = make_user("PHARMACIST")
        PharmacyAdmin.objects.create(pharmacy=self.pharmacy, user=self.manager, admin_level="MANAGER")
        self.private_key = Ed25519PrivateKey.generate()
        public_key = self.private_key.public_key().public_bytes(
            serialization.Encoding.Raw, serialization.PublicFormat.Raw,
        )
        self.device = KioskDevice.objects.create(
            pharmacy=self.pharmacy, device_name="Windows Counter", device_token="private-device-token",
            client_kind="NATIVE_OFFLINE", activated_by=self.owner,
            public_signing_key=base64.b64encode(public_key).decode("ascii"),
        )
        self.now = timezone.now()
        self.corrected = self.now - timedelta(minutes=15)
        self.sequence = 0
        self.previous_hash = ""
        self.api = client_for(self.manager)

    def prepare_worker(self, event_type="CLOCK_IN"):
        worker = make_user("PHARMACIST", first_name="Casey", last_name="Worker")
        Membership.objects.create(
            pharmacy=self.pharmacy, user=worker, role="PHARMACIST",
            employment_type="FULL_TIME", status="ACCEPTED", is_active=True,
        )
        if event_type == "CLOCK_IN":
            return worker, None
        session = AttendanceSession.objects.create(
            pharmacy=self.pharmacy, user=worker, started_at=self.now - timedelta(hours=3),
        )
        for kind, stamp in [
            ("CLOCK_IN", session.started_at), ("BREAK_START", self.now - timedelta(hours=2)),
        ] + ([] if event_type == "BREAK_END" else [("BREAK_END", self.now - timedelta(hours=1))]):
            AttendanceEvent.objects.create(
                session=session, event_type=kind, occurred_at=stamp,
                source="OFFLINE_KIOSK", device=self.device,
            )
        return worker, session

    def queue(self, worker, event_type="CLOCK_IN", blocked_flag=None):
        self.sequence += 1
        payload = {
            "protocol_version": 1, "event_id": str(uuid.uuid4()),
            "device_id": str(self.device.installation_id), "device_seq": self.sequence,
            "employee_id": worker.pk, "shift_id": None, "event_type": event_type,
            "device_timestamp": (self.now - timedelta(minutes=30)).isoformat(),
            "trusted_time_estimate": self.corrected.isoformat(),
            "monotonic_elapsed_ms": self.sequence * 1000,
            "boot_session_id": "review-boot", "previous_event_hash": self.previous_hash,
        }
        digest = calculate_event_hash(payload)
        signature = base64.b64encode(self.private_key.sign(digest.encode("ascii"))).decode("ascii")
        self.previous_hash = digest
        if blocked_flag:
            # Seed the protocol assessment to isolate each decision-time denial.
            return KioskAttendanceEvent.objects.create(
                event_id=payload["event_id"], device=self.device, device_sequence=self.sequence,
                employee=worker, submitted_employee_id=worker.pk, event_type=event_type,
                device_timestamp=payload["device_timestamp"], trusted_time_estimate=payload["trusted_time_estimate"],
                monotonic_elapsed_ms=payload["monotonic_elapsed_ms"], boot_session_id=payload["boot_session_id"],
                previous_event_hash=payload["previous_event_hash"], event_hash=digest,
                device_signature=signature, canonical_payload=payload,
                integrity_flags=[blocked_flag], processing_status="NEEDS_REVIEW",
            )
        before = AttendanceEvent.objects.count()
        result = sync_offline_batch(self.device, [{**payload, "event_hash": digest, "signature": signature}])
        self.assertEqual(result["results"][0]["result"], "needs_review", result)
        self.assertEqual(AttendanceEvent.objects.count(), before)
        evidence = KioskAttendanceEvent.objects.get(event_id=payload["event_id"])
        self.assertIn("CLOCK_ANCHOR_DRIFT", evidence.integrity_flags)
        self.assertIsNone(evidence.attendance_event_id)
        return evidence

    def decide(self, evidence, decision="APPROVED", **changes):
        return self.api.post(DECIDE, {
            "event_id": str(evidence.event_id), "decision": decision,
            "reason": "Checked the original shift record.",
            "corrected_timestamp": self.corrected.isoformat(), **changes,
        }, format="json")

    def snapshot(self, evidence):
        return KioskAttendanceEvent.objects.filter(pk=evidence.pk).values().get()

    def assert_no_decision(self, evidence, before):
        self.assertEqual(AttendanceEvent.objects.count(), before)
        self.assertFalse(KioskAttendanceReview.objects.filter(evidence=evidence).exists())
        evidence.refresh_from_db()
        self.assertIsNone(evidence.attendance_event_id)
        self.assertEqual(evidence.processing_status, "NEEDS_REVIEW")


class KioskReviewContracts(KioskReviewFixture, TestCase):
    def test_same_manager_changed_payload_conflicts_but_identical_replay_succeeds(self):
        for decision in ("APPROVED", "REJECTED"):
            with self.subTest(decision=decision):
                worker, _ = self.prepare_worker()
                evidence = self.queue(worker)
                original = self.snapshot(evidence)
                first = self.decide(evidence, decision)
                self.assertEqual(first.status_code, 200, first.data)
                before = AttendanceEvent.objects.count()
                review_before = KioskAttendanceReview.objects.filter(evidence=evidence).values().get()
                changes = [{"reason": "A different justification."}]
                if decision == "APPROVED":
                    changes.append({"corrected_timestamp": (self.corrected + timedelta(minutes=1)).isoformat()})
                for change in changes:
                    with self.subTest(change=change):
                        response = self.decide(evidence, decision, **change)
                        self.assertEqual(response.status_code, 409, response.data)
                        self.assertEqual(AttendanceEvent.objects.count(), before)
                        self.assertEqual(
                            KioskAttendanceReview.objects.filter(evidence=evidence).values().get(), review_before,
                        )
                replay = self.decide(evidence, decision)
                self.assertEqual(replay.status_code, 200, replay.data)
                self.assertEqual(replay.data, first.data)
                normalized = self.decide(
                    evidence, decision, reason="  Checked the original shift record.  ",
                    corrected_timestamp=(
                        self.corrected.astimezone(timezone.get_fixed_timezone(600)).isoformat()
                        if decision == "APPROVED" else None
                    ),
                )
                self.assertEqual(normalized.status_code, 200, normalized.data)
                self.assertEqual(normalized.data, first.data)
                self.assertEqual(AttendanceEvent.objects.count(), before)
                self.assertEqual(KioskAttendanceReview.objects.filter(evidence=evidence).values().get(), review_before)
                self.assertEqual(self.snapshot(evidence), original)

    def test_valid_drift_approval_applies_each_event_once_and_preserves_signed_evidence(self):
        for event_type in AttendanceEvent.EventType.values:
            with self.subTest(event_type=event_type):
                worker, session = self.prepare_worker(event_type)
                evidence = self.queue(worker, event_type)
                original = self.snapshot(evidence)
                before = AttendanceEvent.objects.count()
                response = self.decide(evidence)
                self.assertEqual(response.status_code, 200, response.data)
                review = KioskAttendanceReview.objects.get(evidence=evidence)
                live = review.attendance_event
                self.assertEqual(live.event_type, event_type)
                self.assertEqual(live.occurred_at, self.corrected)
                self.assertEqual(live.session.user_id, worker.pk)
                self.assertEqual(live.session.pharmacy_id, self.pharmacy.pk)
                if session:
                    self.assertEqual(live.session_id, session.pk)
                self.assertEqual(review.manager_id, self.manager.pk)
                self.assertEqual(review.reason, "Checked the original shift record.")
                self.assertEqual(review.effective_timestamp, self.corrected)
                repeated = self.decide(evidence)
                self.assertEqual(repeated.status_code, 200, repeated.data)
                self.assertEqual(repeated.data, response.data)
                self.assertEqual(AttendanceEvent.objects.count(), before + 1)
                self.assertEqual(KioskAttendanceReview.objects.filter(evidence=evidence).count(), 1)
                self.assertEqual(self.snapshot(evidence), original)
                pending = self.api.get(PENDING, {"pharmacy_id": self.pharmacy.pk})
                self.assertEqual(pending.status_code, 200, pending.data)
                self.assertNotIn(str(evidence.event_id), [row["event_id"] for row in pending.data])

    def test_revoked_after_queue_refuses_all_event_types_with_device_revoked_conflict(self):
        for event_type in AttendanceEvent.EventType.values:
            for inactive, revoked_at in [(True, None), (False, self.now), (True, self.now)]:
                with self.subTest(event_type=event_type, inactive=inactive, revoked_at=revoked_at):
                    KioskDevice.objects.filter(pk=self.device.pk).update(is_active=True, revoked_at=None)
                    self.device.refresh_from_db()
                    worker, session = self.prepare_worker(event_type)
                    evidence = self.queue(worker, event_type)
                    before = AttendanceEvent.objects.count()
                    original = self.snapshot(evidence)
                    KioskDevice.objects.filter(pk=self.device.pk).update(is_active=not inactive, revoked_at=revoked_at)
                    response = self.decide(evidence)
                    self.assertEqual(response.status_code, 409, response.data)
                    self.assertEqual(response.data["code"], "DEVICE_REVOKED")
                    self.assert_no_decision(evidence, before)
                    self.assertEqual(self.snapshot(evidence), original)
                    if session:
                        session.refresh_from_db()
                        self.assertIsNone(session.ended_at)

    def test_future_corrected_time_refuses_each_event_without_creating_attendance(self):
        for event_type in AttendanceEvent.EventType.values:
            with self.subTest(event_type=event_type):
                worker, _ = self.prepare_worker(event_type)
                evidence = self.queue(worker, event_type)
                before = AttendanceEvent.objects.count()
                response = self.decide(evidence, corrected_timestamp=(self.now + timedelta(days=1)).isoformat())
                self.assertIn(response.status_code, (400, 409), response.data)
                self.assert_no_decision(evidence, before)

    def test_corrected_time_cannot_precede_latest_event_even_when_after_session_start(self):
        for event_type in ("CLOCK_OUT", "BREAK_START", "BREAK_END"):
            with self.subTest(event_type=event_type):
                worker, session = self.prepare_worker(event_type)
                latest = session.events.order_by("-occurred_at", "-id").first()
                evidence = self.queue(worker, event_type)
                before = AttendanceEvent.objects.count()
                response = self.decide(evidence, corrected_timestamp=(latest.occurred_at - timedelta(seconds=1)).isoformat())
                self.assertIn(response.status_code, (400, 409), response.data)
                self.assert_no_decision(evidence, before)
                session.refresh_from_db()
                self.assertIsNone(session.ended_at)

    def test_each_blocked_flag_refuses_approval_but_allows_audited_rejection(self):
        for flag in BLOCKED_FLAGS:
            with self.subTest(flag=flag):
                worker, _ = self.prepare_worker()
                evidence = self.queue(worker, blocked_flag=flag)
                original = self.snapshot(evidence)
                before = AttendanceEvent.objects.count()
                response = self.decide(evidence)
                self.assertEqual(response.status_code, 409, response.data)
                self.assertEqual(response.data["code"], "UNTRUSTWORTHY_DEVICE_EVIDENCE")
                self.assert_no_decision(evidence, before)
                rejected = self.decide(evidence, "REJECTED", corrected_timestamp=None)
                self.assertEqual(rejected.status_code, 200, rejected.data)
                review = KioskAttendanceReview.objects.get(evidence=evidence)
                self.assertEqual(review.decision, "REJECTED")
                self.assertIsNone(review.attendance_event_id)
                self.assertIsNone(review.effective_timestamp)
                self.assertEqual(AttendanceEvent.objects.count(), before)
                self.assertEqual(self.snapshot(evidence), original)

    def test_revoked_evidence_can_be_rejected_without_live_attendance(self):
        worker, _ = self.prepare_worker()
        evidence = self.queue(worker)
        original = self.snapshot(evidence)
        KioskDevice.objects.filter(pk=self.device.pk).update(is_active=False, revoked_at=self.now)
        response = self.decide(evidence, "REJECTED", corrected_timestamp=None)
        self.assertEqual(response.status_code, 200, response.data)
        review = KioskAttendanceReview.objects.get(evidence=evidence)
        self.assertEqual(review.decision, "REJECTED")
        self.assertEqual(review.manager_id, self.manager.pk)
        self.assertEqual(review.reason, "Checked the original shift record.")
        self.assertIsNone(review.attendance_event_id)
        self.assertFalse(AttendanceSession.objects.exists())
        self.assertFalse(AttendanceEvent.objects.exists())
        self.assertEqual(self.snapshot(evidence), original)

    def test_decisions_require_a_reason_and_approval_requires_an_aware_corrected_time(self):
        worker, _ = self.prepare_worker()
        evidence = self.queue(worker)
        for decision in ("APPROVED", "REJECTED"):
            with self.subTest(decision=decision):
                response = self.decide(evidence, decision, reason="   ")
                self.assertEqual(response.status_code, 400, response.data)
                self.assert_no_decision(evidence, 0)
        for timestamp in (None, "", "2026-01-05T08:00:00"):
            with self.subTest(timestamp=timestamp):
                response = self.decide(evidence, corrected_timestamp=timestamp)
                self.assertEqual(response.status_code, 400, response.data)
                self.assert_no_decision(evidence, 0)

    def test_worker_and_other_site_manager_cannot_list_or_decide_evidence(self):
        worker, _ = self.prepare_worker()
        evidence = self.queue(worker)
        foreign_owner, _ = make_owner_with_pharmacy("Foreign Review Pharmacy")
        for actor in (worker, foreign_owner):
            with self.subTest(actor=actor.pk):
                self.api = client_for(actor)
                pending = self.api.get(PENDING, {"pharmacy_id": self.pharmacy.pk})
                self.assertEqual(pending.status_code, 403, pending.data)
                for decision in ("APPROVED", "REJECTED"):
                    response = self.decide(evidence, decision)
                    self.assertEqual(response.status_code, 403, response.data)
                self.assert_no_decision(evidence, 0)

    def test_pending_projection_is_scoped_safe_and_reports_approval_availability(self):
        worker, _ = self.prepare_worker()
        evidence = self.queue(worker)
        blocked = self.queue(worker, blocked_flag="MONOTONIC_ROLLBACK")
        _, foreign_pharmacy = make_owner_with_pharmacy("Other Evidence Pharmacy")
        own_device = self.device
        self.device = KioskDevice.objects.create(
            pharmacy=foreign_pharmacy, device_name="Other Counter", device_token="other-private-token",
            client_kind="NATIVE_OFFLINE", public_signing_key=own_device.public_signing_key,
        )
        self.queue(worker)
        self.device = own_device
        response = self.api.get(PENDING, {"pharmacy_id": self.pharmacy.pk})
        self.assertEqual(response.status_code, 200, response.data)
        rows = {row["event_id"]: row for row in response.data}
        self.assertEqual(set(rows), {str(evidence.event_id), str(blocked.event_id)})
        row = rows[str(evidence.event_id)]
        self.assertEqual(row["employee_id"], worker.pk)
        self.assertEqual(row["worker_name"], "Casey Worker")
        self.assertEqual(row["device_id"], self.device.pk)
        self.assertEqual(row["device_name"], self.device.device_name)
        self.assertEqual(row["pharmacy_timezone"], "Australia/Brisbane")
        self.assertIs(row["can_approve"], True)
        self.assertIs(rows[str(blocked.event_id)]["can_approve"], False)
        self.assertTrue(rows[str(blocked.event_id)]["approval_block_reason"])
        for item in rows.values():
            for private in ("device_token", "public_signing_key", "device_signature", "canonical_payload"):
                self.assertNotIn(private, item)
        KioskDevice.objects.filter(pk=self.device.pk).update(revoked_at=self.now)
        refreshed = self.api.get(PENDING, {"pharmacy_id": self.pharmacy.pk})
        self.assertEqual(refreshed.status_code, 200, refreshed.data)
        self.assertTrue(all(row["can_approve"] is False for row in refreshed.data))
        self.assertTrue(all(row["approval_block_reason"] for row in refreshed.data))


class KioskReviewPostgresRaceContracts(KioskReviewFixture, TransactionTestCase):
    def setUp(self):
        super().setUp()
        self.assertEqual(connection.vendor, "postgresql", "Run with --settings core.postgres_test_settings")

    def start_request(self, evidence, outcomes, *, decision="APPROVED", manager=None, sql_hook=None, name=None):
        manager_pk = (manager or self.manager).pk

        def decide():
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout = '3s'")
                    cursor.execute("SET statement_timeout = '10s'")
                api = client_for(type(self.manager).objects.get(pk=manager_pk))
                with connection.execute_wrapper(sql_hook) if sql_hook else nullcontext():
                    response = api.post(DECIDE, {
                        "event_id": str(evidence.event_id), "decision": decision,
                        "reason": "Concurrent manager review.", "corrected_timestamp": self.corrected.isoformat(),
                    }, format="json")
                outcomes.put((response.status_code, response.data))
            except Exception as exc:
                outcomes.put(("unexpected", repr(exc)))
            finally:
                connection.close()

        thread = Thread(target=decide, daemon=True, name=name)
        thread.start()
        return thread

    def finish_request(self, thread, outcomes):
        thread.join(timeout=15)
        self.assertFalse(thread.is_alive(), "Review request did not finish.")
        return outcomes.get(timeout=2)

    def lock_attempt_observer(self, model, reached):
        table = connection.ops.quote_name(model._meta.db_table)

        def observe(execute, sql, params, many, context):
            if table in sql and "FOR UPDATE" in sql:
                lock_clause = sql.split("FOR UPDATE", 1)[1]
                # Joined evidence reads lock OF evidence only, not device.
                if not lock_clause.lstrip().startswith("OF ") or table in lock_clause:
                    reached.set()
            return execute(sql, params, many, context)

        return observe

    def race(self, decisions, *, distinct_managers=False):
        worker, _ = self.prepare_worker()
        evidence = self.queue(worker)
        original = self.snapshot(evidence)
        second_manager = self.manager
        if distinct_managers:
            second_manager = make_user("PHARMACIST")
            PharmacyAdmin.objects.create(pharmacy=self.pharmacy, user=second_manager, admin_level="MANAGER")
            self.assertNotEqual(second_manager.pk, self.manager.pk)
        locked, release = Event(), Event()
        first_results, second_results = Queue(), Queue()
        apply_event = kiosk_review._apply_business_event

        def hold_inside_transaction(*args, **kwargs):
            if current_thread().name == "held-kiosk-review":
                self.assertTrue(connection.in_atomic_block)
                locked.set()
                self.assertTrue(release.wait(timeout=15), "First decision was not released.")
            return apply_event(*args, **kwargs)

        with patch.object(kiosk_review, "_apply_business_event", side_effect=hold_inside_transaction):
            first = self.start_request(evidence, first_results, decision=decisions[0], name="held-kiosk-review")
            second = None
            try:
                self.assertTrue(locked.wait(timeout=10), "First approval never reached application under its lock.")
                second = self.start_request(evidence, second_results, decision=decisions[1], manager=second_manager)
                # The contender must conflict while the winning transaction still owns the row.
                second_outcome = self.finish_request(second, second_results)
            finally:
                release.set()
                first_outcome = self.finish_request(first, first_results)
                if second is not None:
                    second.join(timeout=15)
        outcomes = [first_outcome, second_outcome]
        self.assertEqual(sorted(str(status) for status, _ in outcomes), ["200", "409"], outcomes)
        self.assertEqual(KioskAttendanceReview.objects.filter(evidence=evidence).count(), 1)
        review = KioskAttendanceReview.objects.get(evidence=evidence)
        self.assertEqual(AttendanceEvent.objects.count(), int(review.decision == "APPROVED"))
        self.assertEqual(AttendanceSession.objects.count(), int(review.decision == "APPROVED"))
        self.assertEqual(self.snapshot(evidence), original)

    def test_simultaneous_approvals_commit_once_and_return_one_conflict(self):
        self.race(("APPROVED", "APPROVED"))

    def test_distinct_authorized_managers_simultaneous_approvals_commit_once(self):
        self.race(("APPROVED", "APPROVED"), distinct_managers=True)

    def test_simultaneous_conflicting_decisions_commit_only_the_winner(self):
        self.race(("APPROVED", "REJECTED"))

    def test_concurrent_break_committed_during_approval_prevents_earlier_clock_out(self):
        worker, session = self.prepare_worker("CLOCK_OUT")
        evidence = self.queue(worker, "CLOCK_OUT")
        original = self.snapshot(evidence)
        before = AttendanceEvent.objects.count()
        reached_lock, outcomes = Event(), Queue()
        thread = None
        try:
            with transaction.atomic():
                AttendanceSession.objects.select_for_update().get(pk=session.pk)
                thread = self.start_request(
                    evidence, outcomes,
                    sql_hook=self.lock_attempt_observer(AttendanceSession, reached_lock),
                )
                self.assertTrue(reached_lock.wait(timeout=10), "Approval never tried to lock the open session.")
                # On the buggy path validation passed before application waits on our lock.
                later_break = start_break(worker, occurred_at=self.corrected + timedelta(minutes=1))
            status, data = self.finish_request(thread, outcomes)
        finally:
            if thread is not None:
                thread.join(timeout=15)
        self.assertIn(status, (400, 409), data)
        self.assert_no_decision(evidence, before + 1)
        session.refresh_from_db()
        self.assertIsNone(session.ended_at)
        self.assertTrue(session.events.filter(pk=later_break.pk, event_type="BREAK_START").exists())
        self.assertFalse(session.events.filter(event_type="CLOCK_OUT").exists())
        self.assertEqual(self.snapshot(evidence), original)

    def test_revocation_committing_while_approval_is_in_flight_refuses_attendance(self):
        worker, _ = self.prepare_worker()
        evidence = self.queue(worker)
        original = self.snapshot(evidence)
        reached, release = Event(), Event()
        outcomes = Queue()
        parse_timestamp = kiosk_review._parse_aware_datetime

        def after_stale_device_check(*args, **kwargs):
            # The old implementation reads an active device without taking its lock.
            reached.set()
            self.assertTrue(release.wait(timeout=15), "Revocation was not released.")
            return parse_timestamp(*args, **kwargs)

        with patch.object(kiosk_review, "_parse_aware_datetime", side_effect=after_stale_device_check):
            thread = None
            try:
                with transaction.atomic():
                    device = KioskDevice.objects.select_for_update().get(pk=self.device.pk)
                    thread = self.start_request(
                        evidence, outcomes, sql_hook=self.lock_attempt_observer(KioskDevice, reached),
                    )
                    self.assertTrue(reached.wait(timeout=10), "Approval never reached device locking/validation.")
                    revoke_kiosk_device(self.owner, device)
                release.set()
                status, data = self.finish_request(thread, outcomes)
            finally:
                release.set()
                if thread is not None:
                    thread.join(timeout=15)
        self.assertEqual(status, 409, data)
        self.assertEqual(data["code"], "DEVICE_REVOKED")
        self.assert_no_decision(evidence, 0)
        self.assertFalse(AttendanceSession.objects.exists())
        self.device.refresh_from_db()
        self.assertFalse(self.device.is_active)
        self.assertIsNotNone(self.device.revoked_at)
        self.assertEqual(self.snapshot(evidence), original)

    def test_separate_process_evidence_lock_returns_conflict_without_local_in_flight_state(self):
        worker, _ = self.prepare_worker()
        evidence = self.queue(worker)
        original = self.snapshot(evidence)
        # A real interpreter has no shared Python set/lock with the API worker.
        script = """
import json, os, sys
os.environ['DJANGO_SETTINGS_MODULE'] = 'core.postgres_test_settings'
import django
django.setup()
from django.db import connection, transaction
from attendance.models import KioskAttendanceEvent
connection.close()
connection.settings_dict.update(json.loads(sys.stdin.readline()))
with transaction.atomic():
    KioskAttendanceEvent.objects.select_for_update().get(event_id=sys.argv[1])
    print('LOCKED', flush=True)
    assert sys.stdin.readline().strip() == 'RELEASE'
connection.close()
"""
        process = subprocess.Popen(
            [sys.executable, "-c", script, str(evidence.event_id)],
            cwd=Path(__file__).resolve().parents[1], stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        ready = Queue()
        stdout_lines, stderr_output = [], []

        def read_stdout():
            locked = False
            for line in process.stdout:
                if line.strip() == "LOCKED":
                    locked = True
                    ready.put("LOCKED")
                else:
                    stdout_lines.append(line)
            if not locked:
                ready.put("".join(stdout_lines))

        reader = Thread(target=read_stdout, daemon=True)
        stderr_reader = Thread(target=lambda: stderr_output.append(process.stderr.read()), daemon=True)
        try:
            reader.start()
            stderr_reader.start()
            process.stdin.write(json.dumps(connection.settings_dict) + "\n")
            process.stdin.flush()
            self.assertEqual(ready.get(timeout=15), "LOCKED", "Separate process failed before acquiring the row lock.")
            with connection.cursor() as cursor:
                cursor.execute("SET lock_timeout = '3s'")
            try:
                response = self.decide(evidence)
            finally:
                with connection.cursor() as cursor:
                    cursor.execute("RESET lock_timeout")
            self.assertEqual(response.status_code, 409, response.data)
            self.assertIsNone(process.poll(), "Lock holder must stay alive until after the conflict response.")
            self.assert_no_decision(evidence, 0)
            self.assertFalse(AttendanceSession.objects.exists())
            self.assertEqual(self.snapshot(evidence), original)
        finally:
            if process.poll() is None:
                try:
                    process.stdin.write("RELEASE\n")
                    process.stdin.flush()
                except BrokenPipeError:
                    pass
            try:
                process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
                self.fail("Separate-process lock holder did not exit.")
            finally:
                reader.join(timeout=15)
                stderr_reader.join(timeout=15)
            output, errors = "".join(stdout_lines), "".join(stderr_output)
        self.assertEqual(process.returncode, 0, output + errors)
        # Once database contention ends, first submission and exact retry both work.
        first = self.decide(evidence)
        self.assertEqual(first.status_code, 200, first.data)
        replay = self.decide(evidence)
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertEqual(replay.data, first.data)
        self.assertEqual(AttendanceEvent.objects.count(), 1)
        self.assertEqual(AttendanceSession.objects.count(), 1)
        self.assertEqual(KioskAttendanceReview.objects.filter(evidence=evidence).count(), 1)


    def test_pin_clock_out_and_review_complete_without_device_fk_deadlock(self):
        worker, session = self.prepare_worker("CLOCK_OUT")
        evidence = self.queue(worker, "CLOCK_OUT")
        original = self.snapshot(evidence)
        before = AttendanceEvent.objects.count()
        membership = Membership.objects.get(user=worker, pharmacy=self.pharmacy)
        set_worker_personal_code(self.owner, membership, "123456")
        reached_session, outcomes = Event(), Queue()
        observe_session = self.lock_attempt_observer(AttendanceSession, reached_session)
        review_errors = []

        def observe_review(execute, sql, params, many, context):
            try:
                return observe_session(execute, sql, params, many, context)
            except OperationalError as exc:
                cause = exc.__cause__
                review_errors.append(getattr(cause, "sqlstate", None) or getattr(cause, "pgcode", None))
                raise

        thread, pin_error = None, None
        try:
            try:
                with transaction.atomic():
                    with connection.cursor() as cursor:
                        cursor.execute("SET LOCAL lock_timeout = '3s'")
                        cursor.execute("SET LOCAL statement_timeout = '10s'")
                    AttendanceSession.objects.select_for_update().get(pk=session.pk)
                    thread = self.start_request(evidence, outcomes, sql_hook=observe_review)
                    self.assertTrue(reached_session.wait(timeout=10), "Review never reached the locked session.")
                    # Review owns the device; the real PIN path now inserts its device FK.
                    _, pin_event = clock_out(
                        worker, kiosk_device=self.device, raw_pin="123456",
                        user_identifier=worker.email, occurred_at=self.now,
                    )
                pin_outcome = "committed"
            except OperationalError as exc:
                cause = exc.__cause__
                pin_error = getattr(cause, "sqlstate", None) or getattr(cause, "pgcode", None)
                pin_outcome = repr(exc)
            status, data = self.finish_request(thread, outcomes)
        finally:
            if thread is not None:
                thread.join(timeout=15)

        self.assertNotIn("40P01", [pin_error, *review_errors], (pin_outcome, status, data))
        self.assertEqual(pin_outcome, "committed", (pin_error, pin_outcome))
        self.assertFalse(review_errors, (review_errors, status, data))
        # PIN has closed the session, so the stale approval must fail business validation.
        self.assertEqual(status, 400, data)
        session.refresh_from_db()
        self.assertEqual(session.ended_at, self.now)
        self.assertEqual(pin_event.source, "KIOSK_PIN")
        self.assertEqual(pin_event.device_id, self.device.pk)
        self.assertEqual(session.events.filter(event_type="CLOCK_OUT").count(), 1)
        self.assert_no_decision(evidence, before + 1)
        self.assertEqual(self.snapshot(evidence), original)

    def assert_later_lock_timeout_returns_conflict(self, model, event_type):
        worker, session = self.prepare_worker(event_type)
        evidence = self.queue(worker, event_type)
        original = self.snapshot(evidence)
        before = AttendanceEvent.objects.count()
        row = self.device if model is KioskDevice else session
        outcomes, lock_errors = Queue(), []

        def observe_timeout(execute, sql, params, many, context):
            try:
                return execute(sql, params, many, context)
            except OperationalError as exc:
                cause = exc.__cause__
                lock_errors.append((
                    sql, getattr(cause, "sqlstate", None) or getattr(cause, "pgcode", None),
                ))
                raise

        thread = None
        try:
            with transaction.atomic():
                model.objects.select_for_update().get(pk=row.pk)
                thread = self.start_request(evidence, outcomes, sql_hook=observe_timeout)
                # Keep the unrelated row locked until the endpoint has handled the timeout.
                status, data = self.finish_request(thread, outcomes)
        finally:
            if thread is not None:
                thread.join(timeout=15)

        self.assertEqual(len(lock_errors), 1, (lock_errors, status, data))
        sql, sqlstate = lock_errors[0]
        self.assertEqual(sqlstate, "55P03", (sql, status, data))
        self.assertIn(connection.ops.quote_name(model._meta.db_table), sql)
        self.assertNotIn("NOWAIT", sql)
        with self.subTest(check="retryable conflict"):
            self.assertEqual((status, data), (409, {
                "code": "CONCURRENT_REVIEW",
                "detail": "Another review is in progress for this event.",
            }))
        self.assert_no_decision(evidence, before)
        self.assertEqual(self.snapshot(evidence), original)
        # Releasing the unrelated lock leaves a valid first decision and exact replay.
        first = self.decide(evidence)
        self.assertEqual(first.status_code, 200, first.data)
        replay = self.decide(evidence)
        self.assertEqual(replay.status_code, 200, replay.data)
        self.assertEqual(replay.data, first.data)
        self.assertEqual(AttendanceEvent.objects.count(), before + 1)
        self.assertEqual(KioskAttendanceReview.objects.filter(evidence=evidence).count(), 1)
        self.assertEqual(self.snapshot(evidence), original)

    def test_device_lock_timeout_returns_retryable_conflict(self):
        self.assert_later_lock_timeout_returns_conflict(KioskDevice, "CLOCK_IN")

    def test_session_lock_timeout_returns_retryable_conflict(self):
        self.assert_later_lock_timeout_returns_conflict(AttendanceSession, "CLOCK_OUT")
