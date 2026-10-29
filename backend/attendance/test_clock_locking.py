"""E13 lock-order/setup races on the migrated PostgreSQL schema; never skipped.

Run: manage.py test attendance.test_clock_locking --settings core.postgres_test_settings
"""
import base64
import json
import subprocess
import sys
from contextlib import contextmanager
from datetime import timedelta
from pathlib import Path
from queue import Queue
from threading import Event, Thread, current_thread
from time import monotonic
from unittest.mock import patch
from uuid import uuid4

from django.core.cache.backends.locmem import LocMemCache
from django.db import IntegrityError, OperationalError, close_old_connections, connection, transaction
from django.test import TransactionTestCase
from django.test.utils import CaptureQueriesContext
from rest_framework.test import APIRequestFactory, force_authenticate

from attendance import credentials, kiosk_api, kiosk_review
from attendance.credentials import generate_signed_pharmacy_qr, set_worker_personal_code
from attendance.kiosk_api import KioskWorkerSetupPinView
from attendance.models import AttendanceEvent, AttendanceSession, KioskAttendanceReview, KioskDevice, WorkerPIN
from attendance.protocol import calculate_event_hash, sync_offline_batch
from attendance.test_kiosk_review import KioskReviewFixture
from attendance.transitions import clock_in, clock_out
from attendance.worker_api import WorkerClockOutView
from memberships.models import Membership
from notifications.models import Notification
from users.models import User
from workforce.models import ManagerAttendanceEventAudit, Timesheet, TimesheetPeriod
from workforce.views import TimesheetMissingPunchView


class ClockLockOrderPostgresTests(KioskReviewFixture, TransactionTestCase):
    def setUp(self):
        super().setUp()
        self.assertEqual(connection.vendor, "postgresql", "PostgreSQL row locks are required; no SQLite fallback.")
        self.sql_errors = []
        frozen = patch("django.utils.timezone.now", side_effect=lambda: self.now)
        frozen.start()
        self.addCleanup(frozen.stop)

    def signed(self, worker, kind, when=None):
        self.sequence += 1
        when = when or self.now
        payload = {
            "protocol_version": 1, "event_id": str(uuid4()),
            "device_id": str(self.device.installation_id), "device_seq": self.sequence,
            "employee_id": worker.pk, "shift_id": None, "event_type": kind,
            "device_timestamp": when.isoformat(), "trusted_time_estimate": when.isoformat(),
            "monotonic_elapsed_ms": self.sequence * 1000, "boot_session_id": "review-boot",
            "previous_event_hash": self.previous_hash,
        }
        digest = calculate_event_hash(payload)
        self.previous_hash = digest
        return {**payload, "event_hash": digest,
                "signature": base64.b64encode(self.private_key.sign(digest.encode("ascii"))).decode("ascii")}

    def start(self, name, operation, hook=None):
        result, pid = Queue(), Queue()
        finished = Event()

        def run():
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                    cursor.execute("SET statement_timeout = '10s'")
                    cursor.execute("SELECT pg_backend_pid()")
                    pid.put(cursor.fetchone()[0])

                def observe(execute, sql, params, many, context):
                    try:
                        if hook:
                            return hook(execute, sql, params, many, context)
                        return execute(sql, params, many, context)
                    except OperationalError as exc:
                        cause = exc.__cause__
                        self.sql_errors.append((name, getattr(cause, "sqlstate", None) or getattr(cause, "pgcode", None), sql))
                        raise

                with connection.execute_wrapper(observe):
                    result.put(("ok", operation()))
            except Exception as exc:
                if isinstance(exc, OperationalError):
                    cause = exc.__cause__
                    self.sql_errors.append((name, getattr(cause, "sqlstate", None) or getattr(cause, "pgcode", None), "transaction/commit"))
                result.put(("error", repr(exc)))
            finally:
                finished.set()
                connection.close()

        thread = Thread(target=run, name=name, daemon=True)
        thread.start()
        return thread, result, pid.get(timeout=10), finished

    def finish(self, task):
        thread, result, _, _ = task
        thread.join(timeout=15)
        self.assertFalse(thread.is_alive(), f"{thread.name} did not finish within its database timeouts.")
        return result.get(timeout=2)

    def wait_until_blocked_or_done(self, task, blocker):
        # Observe the actual database wait rather than guessing scheduler timing.
        deadline = monotonic() + 10
        while monotonic() < deadline:
            if task[3].is_set():
                return
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_blocking_pids(%s)", [task[2]])
                if blocker in cursor.fetchone()[0]:
                    return
        self.fail("Contender neither finished nor reached the expected database lock.")

    def test_online_clock_in_racing_review_and_sync_finishes_without_deadlock(self):
        worker, _ = self.prepare_worker()
        membership = Membership.objects.get(user=worker, pharmacy=self.pharmacy)
        set_worker_personal_code(self.owner, membership, "1357")
        self.corrected = self.now - timedelta(seconds=15)
        session = AttendanceSession.objects.create(
            user=worker, pharmacy=self.pharmacy, started_at=self.now - timedelta(seconds=20),
        )
        original_event = AttendanceEvent.objects.create(
            session=session, event_type="CLOCK_IN", occurred_at=session.started_at,
            source="KIOSK_PIN", device=self.device,
        )
        evidence = self.queue(worker)
        original = self.snapshot(evidence)
        batch = self.signed(worker, "BREAK_START")
        review_ready, release = Event(), Event()
        apply = kiosk_review._apply_business_event

        def hold_review(*args, **kwargs):
            if current_thread().name == "clock-in-review":
                review_ready.set()
                if not release.wait(timeout=12):
                    raise AssertionError("Review checkpoint was not released.")
            return apply(*args, **kwargs)

        tasks = []
        with patch.object(kiosk_review, "_apply_business_event", side_effect=hold_review):
            try:
                review = self.start("clock-in-review", lambda: self.decide(evidence))
                tasks.append(review)
                self.assertTrue(review_ready.wait(timeout=10))
                online = self.start("online-clock-in", lambda: clock_in(
                    worker, self.pharmacy, kiosk_device=self.device, raw_pin="1357", confirm_opposite=True,
                ))
                tasks.append(online)
                self.wait_until_blocked_or_done(online, review[2])
                synced = self.start("clock-in-sync", lambda: sync_offline_batch(self.device, [batch]))
                tasks.append(synced)
                self.wait_until_blocked_or_done(synced, review[2])
            finally:
                release.set()
                outcomes = [self.finish(task) for task in tasks]
        self.assertNotIn("40P01", [state for _, state, _ in self.sql_errors], (outcomes, self.sql_errors))
        self.assertFalse(self.sql_errors, (outcomes, self.sql_errors))
        self.assertTrue(all(kind == "ok" for kind, _ in outcomes), outcomes)
        response, (online_session, online_event), synced = [value for _, value in outcomes]
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(online_session.pk, session.pk)
        self.assertEqual(online_event.pk, original_event.pk)
        self.assertEqual(synced["results"][0]["result"], "accepted", synced)
        self.assertEqual(AttendanceSession.objects.filter(user=worker).count(), 1)
        self.assertEqual(session.events.count(), 2)
        self.assertEqual(KioskAttendanceReview.objects.filter(evidence=evidence).count(), 1)
        self.assertEqual(self.snapshot(evidence), original)

    def test_online_clock_out_racing_sync_and_review_finishes_without_join_or_fk_deadlock(self):
        worker, session = self.prepare_worker("CLOCK_OUT")
        # Reuse the real PIN verifier; this is an online kiosk transition.
        membership = Membership.objects.get(user=worker, pharmacy=self.pharmacy)
        set_worker_personal_code(self.owner, membership, "1357")
        evidence = self.queue(worker, "CLOCK_OUT")
        original = self.snapshot(evidence)
        before = session.events.count()
        batch = self.signed(worker, "CLOCK_OUT")
        sync_ready, release = Event(), Event()
        device_table = connection.ops.quote_name(KioskDevice._meta.db_table)

        def hold_sync(execute, sql, params, many, context):
            result = execute(sql, params, many, context)
            if device_table in sql and ("FOR UPDATE" in sql or "FOR NO KEY UPDATE" in sql) and not sync_ready.is_set():
                sync_ready.set()
                if not release.wait(timeout=12):
                    raise AssertionError("Sync checkpoint was not released.")
            return result

        tasks = []
        try:
            synced = self.start("clock-out-sync", lambda: sync_offline_batch(self.device, [batch]), hold_sync)
            tasks.append(synced)
            self.assertTrue(sync_ready.wait(timeout=10))
            online = self.start("online-clock-out", lambda: clock_out(
                worker, kiosk_device=self.device, raw_pin="1357", user_identifier=worker.email,
                occurred_at=self.now, confirm_opposite=True,
            ))
            tasks.append(online)
            self.wait_until_blocked_or_done(online, synced[2])
            review = self.start("clock-out-review", lambda: self.decide(evidence))
            tasks.append(review)
            self.wait_until_blocked_or_done(review, synced[2])
        finally:
            release.set()
            outcomes = [self.finish(task) for task in tasks]
        self.assertNotIn("40P01", [state for _, state, _ in self.sql_errors], (outcomes, self.sql_errors))
        self.assertFalse(self.sql_errors, (outcomes, self.sql_errors))
        self.assertTrue(all(kind == "ok" for kind, _ in outcomes), outcomes)
        synced_result, (closed, event), response = [value for _, value in outcomes]
        self.assertEqual(synced_result["results"][0]["result"], "accepted", synced_result)
        self.assertEqual(closed.pk, session.pk)
        self.assertEqual(event.event_type, "CLOCK_OUT")
        self.assertIn(response.status_code, (400, 409), response.data)
        session.refresh_from_db()
        self.assertEqual(session.ended_at, self.now)
        self.assertEqual(session.events.count(), before + 1)
        self.assertEqual(session.events.filter(event_type="CLOCK_OUT").count(), 1)
        self.assert_no_decision(evidence, before + 1)
        self.assertEqual(self.snapshot(evidence), original)

    @contextmanager
    def user_no_key_lock_in_another_process(self, worker):
        script = """
import json, os, sys
os.environ['DJANGO_SETTINGS_MODULE'] = 'core.postgres_test_settings'
import django
django.setup()
from django.db import connection, transaction
from users.models import User
from workforce.models import ManagerAttendanceEventAudit, Timesheet, TimesheetPeriod
from workforce.views import TimesheetMissingPunchView
connection.close()
connection.settings_dict.update(json.loads(sys.stdin.readline()))
with transaction.atomic():
    with connection.cursor() as cursor:
        cursor.execute("SET LOCAL lock_timeout = '5s'")
    User.objects.select_for_update(no_key=True).get(pk=sys.argv[1])
    print('LOCKED', flush=True)
    assert sys.stdin.readline().strip() == 'RELEASE'
connection.close()
"""
        process = subprocess.Popen(
            [sys.executable, "-c", script, str(worker.pk)], cwd=Path(__file__).resolve().parents[1],
            stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True,
        )
        ready, output, errors = Queue(), [], []

        def read_stdout():
            locked = False
            for line in process.stdout:
                if line.strip() == "LOCKED":
                    locked = True
                    ready.put("LOCKED")
                else:
                    output.append(line)  # Django/import logging is not the readiness protocol.
            if not locked:
                ready.put("".join(output))

        readers = [Thread(target=read_stdout, daemon=True),
                   Thread(target=lambda: errors.append(process.stderr.read()), daemon=True)]
        try:
            for reader in readers:
                reader.start()
            process.stdin.write(json.dumps(connection.settings_dict) + "\n")
            process.stdin.flush()
            self.assertEqual(ready.get(timeout=15), "LOCKED", "Child never acquired the User lock.")
            with connection.cursor() as cursor:
                cursor.execute("SET lock_timeout = '2s'")
                cursor.execute("SET statement_timeout = '5s'")
            yield
        finally:
            with connection.cursor() as cursor:
                cursor.execute("RESET lock_timeout")
                cursor.execute("RESET statement_timeout")
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
                process.wait(timeout=5)
                self.fail("Child User lock holder did not exit.")
            finally:
                for reader in readers:
                    reader.join(timeout=5)
                process.stdin.close()
                process.stdout.close()
                process.stderr.close()
            self.assertEqual(process.returncode, 0, "".join(output + errors))

    def assert_no_user_lock(self, captured):
        table = connection.ops.quote_name(User._meta.db_table)
        for query in captured.captured_queries:
            sql = query["sql"]
            if "FOR UPDATE" in sql or "FOR NO KEY UPDATE" in sql:
                if " OF " in sql:
                    self.assertNotIn(table, sql.split(" OF ", 1)[1].split(" NOWAIT", 1)[0], sql)
                else:
                    self.assertNotIn(table, sql, "Verified evidence must not lock User, including joined rows.")

    def test_verified_sync_clock_in_and_out_take_no_user_lock(self):
        worker, _ = self.prepare_worker()
        for kind in ("CLOCK_IN", "CLOCK_OUT"):
            with self.subTest(kind=kind):
                batch = self.signed(worker, kind)
                with self.user_no_key_lock_in_another_process(worker), CaptureQueriesContext(connection) as captured:
                    result = sync_offline_batch(self.device, [batch])
                self.assertEqual(result["results"][0]["result"], "accepted", result)
                self.assert_no_user_lock(captured)
        self.assertEqual(AttendanceEvent.objects.filter(session__user=worker).count(), 2)
        self.assertFalse(AttendanceSession.objects.filter(user=worker, ended_at__isnull=True).exists())

    def test_verified_review_clock_in_and_out_take_no_user_lock(self):
        for kind in ("CLOCK_IN", "CLOCK_OUT"):
            with self.subTest(kind=kind):
                worker, _ = self.prepare_worker(kind)
                evidence = self.queue(worker, kind)
                with self.user_no_key_lock_in_another_process(worker), CaptureQueriesContext(connection) as captured:
                    response = self.decide(evidence)
                self.assertEqual(response.status_code, 200, response.data)
                self.assert_no_user_lock(captured)
                self.assertEqual(KioskAttendanceReview.objects.filter(evidence=evidence).count(), 1)

    def test_concurrent_clock_out_after_setup_precheck_cannot_consume_otp_then_reject(self):
        worker, _ = self.prepare_worker()
        membership = Membership.objects.get(user=worker, pharmacy=self.pharmacy)
        set_worker_personal_code(self.owner, membership, "1357")
        session = AttendanceSession.objects.create(
            user=worker, pharmacy=self.pharmacy, started_at=self.now - timedelta(seconds=10),
        )
        AttendanceEvent.objects.create(
            session=session, event_type="CLOCK_IN", occurred_at=session.started_at,
            source="KIOSK_PIN", device=self.device,
        )
        cache = LocMemCache("clock-setup-race", {})
        cache_key = f"{credentials.WORKER_PIN_OTP_CACHE_PREFIX}{worker.pk}"
        otp = {"otp": "123456", "membership_id": membership.pk, "pharmacy_id": self.pharmacy.pk}
        cache.set(cache_key, otp)
        qr = generate_signed_pharmacy_qr(self.device)["signed_token"]
        prechecked, release = Event(), Event()
        guard = kiosk_api.check_clock_in_double_guard

        def after_precheck(*args, **kwargs):
            result = guard(*args, **kwargs)
            if current_thread().name == "pin-setup":
                prechecked.set()
                if not release.wait(timeout=12):
                    raise AssertionError("Setup precheck was not released.")
            return result

        def setup():
            request = APIRequestFactory().post(
                "/api/v1/attendance/kiosk/worker-pin/setup/",
                {"identifier": worker.email, "verification_code": "123456", "new_pin": "2468"},
                format="json", HTTP_X_DEVICE_TOKEN=self.device.device_token,
            )
            return KioskWorkerSetupPinView.as_view()(request)

        tasks = []
        with patch.object(credentials, "security_cache", cache), patch("users.tasks.send_async_email"), \
             patch.object(kiosk_api, "check_clock_in_double_guard", side_effect=after_precheck):
            try:
                setup_task = self.start("pin-setup", setup)
                tasks.append(setup_task)
                self.assertTrue(prechecked.wait(timeout=10))
                out_task = self.start("concurrent-clock-out", lambda: clock_out(
                    worker, signed_qr_token=qr, confirm_opposite=True,
                ))
                tasks.append(out_task)
                # Serialized code blocks here; buggy code commits the clock-out before setup resumes.
                self.wait_until_blocked_or_done(out_task, setup_task[2])
            finally:
                release.set()
                outcomes = [self.finish(task) for task in tasks]
        self.assertFalse(self.sql_errors, (outcomes, self.sql_errors))
        self.assertTrue(all(kind == "ok" for kind, _ in outcomes), outcomes)
        response, (_, out_event) = [value for _, value in outcomes]
        pin = WorkerPIN.objects.get(membership=membership)
        if response.status_code != 201:
            self.assertEqual(cache.get(cache_key), otp, "Rejected setup consumed the still-valid OTP.")
            self.assertTrue(pin.check_pin("1357"), "Rejected setup replaced the original PIN.")
            self.assertEqual(response.status_code, 409, response.data)
            self.assertEqual(response.data.get("code"), "CONFIRM_OPPOSITE_ACTION")
        else:
            self.assertIsNone(cache.get(cache_key))
            self.assertTrue(pin.check_pin("2468"))
            self.assertEqual(response.data["action"], "CLOCKED_IN")
        self.assertEqual(out_event.event_type, "CLOCK_OUT")
        self.assertEqual(session.events.filter(event_type="CLOCK_OUT").count(), 1)
        self.assertEqual(session.events.count(), 2)
        session.refresh_from_db()
        self.assertIsNotNone(session.ended_at)


    def assert_only_table_locked(self, sql, model):
        table = connection.ops.quote_name(model._meta.db_table)
        self.assertIn(" OF ", sql, f"Joined locking queries must name their lock target: {sql}")
        targets = sql.split(" OF ", 1)[1].split(" NOWAIT", 1)[0].split(" SKIP LOCKED", 1)[0]
        self.assertEqual(targets.strip(), table, sql)

    def race_row_holder_against_online(self, row, operation, online_operation):
        """Force the PIN/session -> User half against the online User -> PIN/session half."""
        ready, release = Event(), Event()

        def hold_row():
            with transaction.atomic():
                # Pin the first row before the joined query to make the lock inversion deterministic.
                type(row).objects.select_for_update(of=("self",)).get(pk=row.pk)
                ready.set()
                if not release.wait(timeout=12):
                    raise AssertionError("Row holder was not released.")
                return operation()

        tasks = []
        try:
            holder = self.start("row-holder", hold_row)
            tasks.append(holder)
            self.assertTrue(ready.wait(timeout=10))
            online = self.start("online-contender", online_operation)
            tasks.append(online)
            self.wait_until_blocked_or_done(online, holder[2])
            self.assertFalse(online[3].is_set(), "Online action must reach the held row, not an idempotent return.")
        finally:
            release.set()
            outcomes = [self.finish(task) for task in tasks]
        self.assertNotIn("40P01", [state for _, state, _ in self.sql_errors], (outcomes, self.sql_errors))
        self.assertFalse(self.sql_errors, (outcomes, self.sql_errors))
        self.assertTrue(all(kind == "ok" for kind, _ in outcomes), outcomes)
        return [value for _, value in outcomes]

    def post_pin_setup(self, worker, *, confirm=False):
        request = APIRequestFactory().post(
            "/api/v1/attendance/kiosk/worker-pin/setup/",
            {"identifier": worker.email, "verification_code": "123456", "new_pin": "2468",
             "confirm_opposite": confirm},
            format="json", HTTP_X_DEVICE_TOKEN=self.device.device_token,
        )
        return KioskWorkerSetupPinView.as_view()(request)

    def seed_setup_otp(self, worker, membership):
        cache = LocMemCache(f"clock-review-setup-{worker.pk}", {})
        key = f"{credentials.WORKER_PIN_OTP_CACHE_PREFIX}{worker.pk}"
        otp = {"otp": "123456", "membership_id": membership.pk, "pharmacy_id": self.pharmacy.pk}
        cache.set(key, otp)
        return cache, key, otp

    @contextmanager
    def observe_pin_confirmation_delivery(self):
        transaction_states = []

        def accept_email(**kwargs):
            transaction_states.append((connection.in_atomic_block, connection.get_autocommit()))
            return 1

        with patch("django.core.mail.send_mail", side_effect=accept_email) as email, \
             patch("notifications.services._deliver_notification") as notification:
            yield email, notification, transaction_states

    def test_pin_setup_commit_failure_keeps_otp_usable_and_rolls_back_pin_and_attendance(self):
        worker, _ = self.prepare_worker()
        membership = Membership.objects.get(user=worker, pharmacy=self.pharmacy)
        pin = set_worker_personal_code(self.owner, membership, "1357")
        pin_before = WorkerPIN.objects.filter(pk=pin.pk).values().get()
        cache, key, otp = self.seed_setup_otp(worker, membership)

        writes_before_commit = []

        def fail_commit():
            writes_before_commit.append((
                WorkerPIN.objects.get(pk=pin.pk).check_pin("2468"),
                AttendanceSession.objects.filter(user=worker).count(),
                AttendanceEvent.objects.filter(session__user=worker).count(),
            ))
            raise IntegrityError("Forced failure after PIN/session writes, before commit.")

        with patch.object(credentials, "security_cache", cache), \
             patch("users.tasks.send_async_email") as confirmation:
            with patch.object(connection, "_commit", side_effect=fail_commit) as commit:
                response = self.post_pin_setup(worker)
            commit.assert_called_once_with()
            self.assertEqual(writes_before_commit, [(True, 1, 1)])
            self.assertEqual(response.status_code, 400, response.data)
            self.assertEqual(WorkerPIN.objects.filter(pk=pin.pk).values().get(), pin_before)
            self.assertFalse(AttendanceSession.objects.filter(user=worker).exists())
            self.assertFalse(AttendanceEvent.objects.filter(session__user=worker).exists())
            confirmation.assert_not_called()
            cached_after_rollback = cache.get(key)
            retry = self.post_pin_setup(worker)
            self.assertEqual(retry.status_code, 201, retry.data)
            confirmation.assert_called_once()
            self.assertEqual(cached_after_rollback, otp)
            self.assertIsNone(cache.get(key), "Successful retry must consume the OTP on commit.")
            self.assertTrue(WorkerPIN.objects.get(pk=pin.pk).check_pin("2468"))
            self.assertEqual(AttendanceSession.objects.filter(user=worker).count(), 1)
            self.assertEqual(AttendanceEvent.objects.filter(session__user=worker).count(), 1)

    def test_pin_setup_enclosing_transaction_rollback_keeps_otp_usable(self):
        worker, _ = self.prepare_worker()
        membership = Membership.objects.get(user=worker, pharmacy=self.pharmacy)
        cache, key, otp = self.seed_setup_otp(worker, membership)
        with patch.object(credentials, "security_cache", cache), \
             patch("users.tasks.send_async_email") as confirmation:
            with self.assertRaisesMessage(IntegrityError, "Forced outer rollback"):
                with transaction.atomic():
                    response = self.post_pin_setup(worker)
                    self.assertEqual(response.status_code, 201, response.data)
                    self.assertTrue(WorkerPIN.objects.get(membership=membership).check_pin("2468"))
                    self.assertEqual(AttendanceEvent.objects.filter(session__user=worker).count(), 1)
                    confirmation.assert_not_called()
                    raise IntegrityError("Forced outer rollback")
            self.assertFalse(WorkerPIN.objects.filter(membership=membership).exists())
            self.assertFalse(AttendanceSession.objects.filter(user=worker).exists())
            self.assertFalse(AttendanceEvent.objects.filter(session__user=worker).exists())
            confirmation.assert_not_called()
            cached_after_rollback = cache.get(key)
            retry = self.post_pin_setup(worker)
            self.assertEqual(retry.status_code, 201, retry.data)
            confirmation.assert_called_once()
            self.assertEqual(cached_after_rollback, otp)
            self.assertIsNone(cache.get(key))

    def test_successful_pin_setup_commit_consumes_otp_and_rejects_reuse(self):
        worker, _ = self.prepare_worker()
        membership = Membership.objects.get(user=worker, pharmacy=self.pharmacy)
        cache, key, _ = self.seed_setup_otp(worker, membership)
        with patch.object(credentials, "security_cache", cache), \
             self.observe_pin_confirmation_delivery() as (email, notification, transaction_states):
            response = self.post_pin_setup(worker)
            self.assertEqual(response.status_code, 201, response.data)
            self.assertFalse(connection.in_atomic_block, "This proof requires a real commit, including callbacks.")
            self.assertIsNone(cache.get(key))
            email.assert_called_once()
            self.assertEqual(email.call_args.kwargs["recipient_list"], [worker.email])
            self.assertEqual(email.call_args.kwargs["subject"], "ChemistTasker - Attendance PIN Created")
            self.assertIn(self.pharmacy.name, email.call_args.kwargs["message"])
            self.assertEqual(transaction_states, [(False, True)])
            notification.assert_called_once()
            notice = Notification.objects.get(user=worker, title="ChemistTasker - Attendance PIN Created")
            self.assertEqual(notification.call_args.args[0].pk, notice.pk)
            before = WorkerPIN.objects.filter(membership=membership).values().get()
            reuse = self.post_pin_setup(worker)
            self.assertEqual(reuse.status_code, 400, reuse.data)
            self.assertIn("code", reuse.data["error"].lower())
            self.assertEqual(WorkerPIN.objects.filter(membership=membership).values().get(), before)
            self.assertEqual(AttendanceSession.objects.filter(user=worker).count(), 1)
            self.assertEqual(AttendanceEvent.objects.filter(session__user=worker).count(), 1)
            email.assert_called_once()
            notification.assert_called_once()

    def test_pin_setup_clock_in_validation_400_commits_pin_and_confirmation(self):
        worker, session = self.prepare_worker("CLOCK_OUT")
        membership = Membership.objects.get(user=worker, pharmacy=self.pharmacy)
        cache, key, otp = self.seed_setup_otp(worker, membership)
        events_before = list(session.events.order_by("pk").values())

        with patch.object(credentials, "security_cache", cache), \
             self.observe_pin_confirmation_delivery() as (email, notification, transaction_states):
            with transaction.atomic():
                response = self.post_pin_setup(worker)
                self.assertEqual(response.status_code, 400, response.data)
                self.assertIn("already has an open attendance session", response.data["error"])
                self.assertTrue(WorkerPIN.objects.get(membership=membership).check_pin("2468"))
                self.assertEqual(cache.get(key), otp)
                email.assert_not_called()
                notification.assert_not_called()
                self.assertFalse(Notification.objects.filter(user=worker).exists())

            self.assertFalse(connection.in_atomic_block)
            self.assertIsNone(cache.get(key))
            self.assertTrue(WorkerPIN.objects.get(membership=membership).check_pin("2468"))
            self.assertEqual(list(session.events.order_by("pk").values()), events_before)
            self.assertEqual(AttendanceSession.objects.filter(user=worker).count(), 1)
            email.assert_called_once()
            self.assertEqual(transaction_states, [(False, True)])
            notification.assert_called_once()
            self.assertEqual(Notification.objects.filter(user=worker).count(), 1)

    def test_pin_setup_confirmation_failure_preserves_committed_pin_and_attendance(self):
        for failure in ("not_accepted", "provider_error", "unexpected_error"):
            with self.subTest(failure=failure):
                worker, _ = self.prepare_worker()
                membership = Membership.objects.get(user=worker, pharmacy=self.pharmacy)
                cache, key, _ = self.seed_setup_otp(worker, membership)
                if failure == "unexpected_error":
                    delivery = patch("users.tasks.send_async_email", side_effect=RuntimeError("Confirmation failed"))
                elif failure == "provider_error":
                    delivery = patch("django.core.mail.send_mail", side_effect=RuntimeError("Mail backend failed"))
                else:
                    delivery = patch("django.core.mail.send_mail", return_value=0)

                with patch.object(credentials, "security_cache", cache), delivery as send, \
                     patch("notifications.services._deliver_notification"), \
                     self.assertLogs("attendance.credentials", level="WARNING"):
                    response = self.post_pin_setup(worker)

                self.assertEqual(response.status_code, 201, response.data)
                self.assertFalse(connection.in_atomic_block)
                self.assertIsNone(cache.get(key))
                self.assertTrue(WorkerPIN.objects.get(membership=membership).check_pin("2468"))
                self.assertEqual(AttendanceSession.objects.filter(user=worker).count(), 1)
                self.assertEqual(AttendanceEvent.objects.filter(session__user=worker).count(), 1)
                send.assert_called_once()

    def test_concurrent_pin_setups_cannot_reuse_otp_between_commit_and_callbacks(self):
        worker, _ = self.prepare_worker()
        membership = Membership.objects.get(user=worker, pharmacy=self.pharmacy)
        cache, key, _ = self.seed_setup_otp(worker, membership)
        committed, release = Event(), Event()

        def first_setup():
            commit = connection._commit

            def commit_before_callbacks():
                commit()
                committed.set()
                if not release.wait(timeout=12):
                    raise AssertionError("Post-commit checkpoint was not released.")

            # The database has released User locks, but on_commit callbacks have not run yet.
            with patch.object(connection, "_commit", side_effect=commit_before_callbacks):
                return self.post_pin_setup(worker)

        tasks = []
        with patch.object(credentials, "security_cache", cache), patch("users.tasks.send_async_email"):
            try:
                first = self.start("first-otp-setup", first_setup)
                tasks.append(first)
                self.assertTrue(committed.wait(timeout=10), "First setup never reached the real commit.")
                second = self.start("second-otp-setup", lambda: self.post_pin_setup(worker))
                tasks.append(second)
                self.wait_until_blocked_or_done(second, first[2])
            finally:
                release.set()
                outcomes = [self.finish(task) for task in tasks]
        self.assertFalse(self.sql_errors, (outcomes, self.sql_errors))
        self.assertTrue(all(kind == "ok" for kind, _ in outcomes), outcomes)
        first_response, second_response = [value for _, value in outcomes]
        self.assertEqual(first_response.status_code, 201, first_response.data)
        self.assertEqual(second_response.status_code, 400, second_response.data)
        self.assertIn("code", second_response.data["error"].lower())
        self.assertIsNone(cache.get(key))
        self.assertTrue(WorkerPIN.objects.get(membership=membership).check_pin("2468"))
        self.assertEqual(AttendanceSession.objects.filter(user=worker).count(), 1)
        self.assertEqual(AttendanceEvent.objects.filter(session__user=worker).count(), 1)

    def test_pin_verification_takes_no_user_lock_and_locks_only_pin(self):
        worker, _ = self.prepare_worker()
        membership = Membership.objects.get(user=worker, pharmacy=self.pharmacy)
        set_worker_personal_code(self.owner, membership, "1357")
        with self.user_no_key_lock_in_another_process(worker), CaptureQueriesContext(connection) as captured:
            valid, verified_membership, reason = credentials.verify_kiosk_worker_pin(self.device, worker.email, "1357")
        self.assertTrue(valid, reason)
        self.assertEqual(verified_membership.pk, membership.pk)
        self.assertIsNone(reason)
        self.assert_no_user_lock(captured)
        locks = [q["sql"] for q in captured.captured_queries if "FOR UPDATE" in q["sql"]]
        self.assertEqual(len(locks), 1, locks)
        self.assert_only_table_locked(locks[0], WorkerPIN)

    def check_pin_verification_race(self, online_kind):
        worker, _ = self.prepare_worker()
        membership = Membership.objects.get(user=worker, pharmacy=self.pharmacy)
        pin = set_worker_personal_code(self.owner, membership, "1357")
        cache, key, _ = self.seed_setup_otp(worker, membership)
        with patch.object(credentials, "security_cache", cache), patch("users.tasks.send_async_email"):
            verified, result = self.race_row_holder_against_online(
                pin,
                lambda: credentials.verify_kiosk_worker_pin(self.device, worker.email, "1357"),
                (lambda: clock_in(worker, self.pharmacy, kiosk_device=self.device, raw_pin="1357"))
                if online_kind == "clock" else lambda: self.post_pin_setup(worker),
            )
        self.assertTrue(verified[0], verified)
        self.assertEqual(verified[1].pk, membership.pk)
        self.assertIsNone(verified[2])
        if online_kind == "clock":
            session, event = result
            self.assertEqual(event.event_type, "CLOCK_IN")
            self.assertEqual(session.user_id, worker.pk)
            pin.refresh_from_db()
            self.assertTrue(pin.check_pin("1357"))
        else:
            self.assertEqual(result.status_code, 201, result.data)
            self.assertEqual(result.data["action"], "CLOCKED_IN")
            self.assertIsNone(cache.get(key))
            pin.refresh_from_db()
            self.assertTrue(pin.check_pin("2468"))
        self.assertEqual(AttendanceSession.objects.filter(user=worker).count(), 1)
        self.assertEqual(AttendanceEvent.objects.filter(session__user=worker, event_type="CLOCK_IN").count(), 1)

    def test_pin_verification_racing_online_pin_clock_in_finishes_without_deadlock(self):
        self.check_pin_verification_race("clock")

    def test_pin_verification_racing_online_pin_setup_finishes_without_deadlock(self):
        self.check_pin_verification_race("setup")

    def prepare_missing_punch(self):
        worker, _ = self.prepare_worker()
        membership = Membership.objects.get(user=worker, pharmacy=self.pharmacy)
        session = AttendanceSession.objects.create(
            user=worker, pharmacy=self.pharmacy, started_at=self.now - timedelta(hours=3),
            source_membership=membership,
        )
        # The projection exists, but its CLOCK_IN evidence is missing; both writers may succeed.
        period, _ = TimesheetPeriod.objects.get_or_create(
            pharmacy=self.pharmacy, start_date=session.started_at.date() - timedelta(days=1),
            end_date=self.now.date() + timedelta(days=1),
            defaults={"timezone": "Australia/Brisbane", "created_by": self.manager},
        )
        timesheet = Timesheet.objects.create(period=period, user=worker, membership=membership)
        return worker, session, timesheet

    def post_missing_punch(self, timesheet, session):
        request = APIRequestFactory().post(
            f"/api/v1/workforce/timesheets/{timesheet.pk}/missing-punch/",
            {"session_id": session.pk, "event_type": "CLOCK_IN",
             "occurred_at": session.started_at.isoformat(), "reason": "Verified the missing opening punch."},
            format="json",
        )
        force_authenticate(request, user=self.manager)
        return TimesheetMissingPunchView.as_view()(request, pk=timesheet.pk)

    def test_manager_missing_punch_query_locks_only_session(self):
        worker, session, timesheet = self.prepare_missing_punch()
        with self.user_no_key_lock_in_another_process(worker), CaptureQueriesContext(connection) as captured:
            response = self.post_missing_punch(timesheet, session)
        self.assertEqual(response.status_code, 201, response.data)
        table = connection.ops.quote_name(AttendanceSession._meta.db_table)
        locks = [q["sql"] for q in captured.captured_queries if table in q["sql"] and "FOR UPDATE" in q["sql"]]
        self.assertEqual(len(locks), 1, locks)
        self.assert_only_table_locked(locks[0], AttendanceSession)
        self.assertTrue(ManagerAttendanceEventAudit.objects.filter(
            event_id=response.data["created_event_id"], created_by=self.manager,
        ).exists())

    def test_manager_missing_punch_post_racing_online_qr_clock_out_finishes_without_deadlock(self):
        worker, session, timesheet = self.prepare_missing_punch()
        qr = generate_signed_pharmacy_qr(self.device)["signed_token"]

        def online_clock_out():
            request = APIRequestFactory().post(
                "/api/v1/attendance/worker/clock-out/", {"qr_token": qr},
                format="json", HTTP_X_CLIENT_PLATFORM="mobile",
            )
            force_authenticate(request, user=worker)
            return WorkerClockOutView.as_view()(request)

        response, online = self.race_row_holder_against_online(
            session, lambda: self.post_missing_punch(timesheet, session), online_clock_out,
        )
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(online.status_code, 200, online.data)
        self.assertEqual(online.data["status"], "CLOCKED_OUT")
        self.assertEqual(online.data["session_id"], session.pk)
        session.refresh_from_db()
        self.assertEqual(session.ended_at, self.now)
        self.assertEqual(session.events.count(), 2)
        self.assertEqual(session.events.get(event_type="CLOCK_IN").source, "MANAGER")
        self.assertEqual(session.events.get(event_type="CLOCK_OUT").source, "MOBILE_QR")
        self.assertTrue(ManagerAttendanceEventAudit.objects.filter(
            event_id=response.data["created_event_id"], created_by=self.manager,
        ).exists())

    def check_timesheet_rebuild_clock_out_fk_race(self, *, manager_after_commit):
        """Force the later period/timesheet/FK cycle, after the session lock is released."""
        from workforce.tasks import rebuild_timesheet_task

        worker, session, timesheet = self.prepare_missing_punch()
        qr = generate_signed_pharmacy_qr(self.device)["signed_token"]
        period_table = connection.ops.quote_name(TimesheetPeriod._meta.db_table)
        timesheet_table = connection.ops.quote_name(Timesheet._meta.db_table)
        pharmacy_table = connection.ops.quote_name(self.pharmacy._meta.db_table)
        session_held, release_manager, manager_committed = Event(), Event(), Event()
        period_held, timesheet_updated, release_clock_out = Event(), Event(), Event()
        observed = {"period_locked": False, "invalidations": 0, "invalidation_rows": [], "builder_waited": False}
        original = {}

        def manager_post():
            response = self.post_missing_punch(timesheet, session)
            if response.status_code == 201:
                event_id = response.data["created_event_id"]
                original["event"] = AttendanceEvent.objects.filter(pk=event_id).values().get()
                original["audit"] = ManagerAttendanceEventAudit.objects.filter(event_id=event_id).values().get()
            return response

        def manager_request_with_callbacks():
            with transaction.atomic():
                AttendanceSession.objects.select_for_update(of=("self",)).get(pk=session.pk)
                # Registered before the real signal callbacks so the hook ignores
                # the view's initial build and stops only its after-commit rebuild.
                transaction.on_commit(manager_committed.set)
                session_held.set()
                if not release_manager.wait(timeout=10):
                    raise AssertionError("Manager request was not released.")
                return manager_post()

        def hold_builder_period(execute, sql, params, many, context):
            result = execute(sql, params, many, context)
            if (
                manager_committed.is_set() and not observed["period_locked"]
                and f"FROM {period_table}" in sql and f"JOIN {pharmacy_table}" in sql
                and ("FOR UPDATE" in sql or "FOR NO KEY UPDATE" in sql)
            ):
                observed["period_locked"] = True
                period_held.set()
                if not timesheet_updated.wait(timeout=10):
                    raise AssertionError("Clock-out did not invalidate the timesheet.")
            return result

        def hold_clock_out_invalidation(execute, sql, params, many, context):
            invalidation = (
                sql.startswith(f"UPDATE {timesheet_table} SET")
                and '"needs_rebuild"' in sql and params and params[0] is True
            )
            if invalidation and observed["invalidations"] == 0:
                if not period_held.wait(timeout=10):
                    raise AssertionError("Rebuild did not acquire its period lock.")
            result = execute(sql, params, many, context)
            if invalidation:
                observed["invalidations"] += 1
                observed["invalidation_rows"].append(context["cursor"].rowcount)
                if observed["invalidations"] == 1:
                    timesheet_updated.set()
                    if not release_clock_out.wait(timeout=10):
                        raise AssertionError("Clock-out was not released for its second invalidation and commit.")
            return result

        def online_clock_out():
            request = APIRequestFactory().post(
                "/api/v1/attendance/worker/clock-out/", {"qr_token": qr},
                format="json", HTTP_X_CLIENT_PLATFORM="mobile",
            )
            force_authenticate(request, user=worker)
            return WorkerClockOutView.as_view()(request)

        if not manager_after_commit:
            response = manager_post()
            self.assertEqual(response.status_code, 201, response.data)
            manager_committed.set()

        tasks = []
        try:
            rebuild = self.start(
                "manager-after-commit-rebuild" if manager_after_commit else "separate-timesheet-rebuild",
                manager_request_with_callbacks if manager_after_commit else
                lambda: rebuild_timesheet_task.run(timesheet.period_id, worker.pk),
                hold_builder_period,
            )
            tasks.append(rebuild)
            self.assertTrue((session_held if manager_after_commit else period_held).wait(timeout=10))
            online = self.start("qr-clock-out-with-invalidation", online_clock_out, hold_clock_out_invalidation)
            tasks.append(online)
            if manager_after_commit:
                self.wait_until_blocked_or_done(online, rebuild[2])
                self.assertFalse(online[3].is_set(), "Clock-out must wait for the manager's session lock.")
                release_manager.set()
            self.assertTrue(period_held.wait(timeout=10))
            self.assertTrue(timesheet_updated.wait(timeout=10))
            self.wait_until_blocked_or_done(rebuild, online[2])
            self.assertFalse(rebuild[3].is_set(), "Rebuild must reach the timesheet held by clock-out.")
            observed["builder_waited"] = True
        finally:
            # Release every gate before joining either connection, including a
            # failed setup/assertion path. Observations are recorded separately.
            release_manager.set()
            period_held.set()
            timesheet_updated.set()
            release_clock_out.set()
            for thread, *_ in tasks:
                thread.join(timeout=15)
            outcomes = [self.finish(task) for task in tasks]

        self.assertTrue(observed["period_locked"] and observed["builder_waited"], observed)
        self.assertGreaterEqual(observed["invalidations"], 2, observed)
        self.assertEqual(observed["invalidation_rows"][:2], [1, 1], observed)
        self.assertFalse(self.sql_errors, (outcomes, self.sql_errors))
        self.assertTrue(all(kind == "ok" for kind, _ in outcomes), outcomes)
        rebuilt, online_response = [value for _, value in outcomes]
        if manager_after_commit:
            self.assertEqual(rebuilt.status_code, 201, rebuilt.data)
        else:
            self.assertEqual((rebuilt["status"], rebuilt["timesheet_id"]), ("rebuilt", timesheet.pk))
        self.assertEqual(online_response.status_code, 200, online_response.data)
        self.assertEqual((online_response.data["status"], online_response.data["session_id"]),
                         ("CLOCKED_OUT", session.pk))
        session.refresh_from_db()
        self.assertEqual(session.ended_at, self.now)
        self.assertEqual(session.events.count(), 2)
        self.assertEqual(AttendanceEvent.objects.filter(pk=original["event"]["id"]).values().get(), original["event"])
        self.assertEqual(ManagerAttendanceEventAudit.objects.filter(pk=original["audit"]["id"]).values().get(),
                         original["audit"])
        self.assertEqual(session.events.get(event_type="CLOCK_IN").source, "MANAGER")
        clock_out_event = session.events.get(event_type="CLOCK_OUT")
        self.assertEqual((clock_out_event.source, clock_out_event.occurred_at), ("MOBILE_QR", self.now))
        timesheet.refresh_from_db()
        self.assertEqual(timesheet.worked_minutes, 180)
        self.assertFalse(timesheet.needs_rebuild)
        latest = timesheet.revisions.order_by("-revision_number").first()
        self.assertEqual((latest.worked_minutes, latest.snapshot["totals"]["worked_minutes"]), (180, 180))
        self.assertFalse(latest.checks.filter(code__in=["MISSING_CLOCK_IN", "MISSING_CLOCK_OUT"]).exists())

    def test_manager_after_commit_rebuild_racing_qr_clock_out_finishes_without_fk_deadlock(self):
        self.check_timesheet_rebuild_clock_out_fk_race(manager_after_commit=True)

    def test_separate_timesheet_rebuild_racing_qr_clock_out_finishes_without_fk_deadlock(self):
        self.check_timesheet_rebuild_clock_out_fk_race(manager_after_commit=False)

    def check_verified_close_preserves_setup_otp(self, channel):
        worker, _ = self.prepare_worker()
        membership = Membership.objects.get(user=worker, pharmacy=self.pharmacy)
        pin = set_worker_personal_code(self.owner, membership, "1357")
        pin_before = WorkerPIN.objects.filter(pk=pin.pk).values().get()
        session = AttendanceSession.objects.create(
            user=worker, pharmacy=self.pharmacy, started_at=self.now - timedelta(seconds=10),
        )
        AttendanceEvent.objects.create(
            session=session, event_type="CLOCK_IN", occurred_at=session.started_at,
            source="KIOSK_PIN", device=self.device,
        )
        self.corrected = self.now
        evidence = self.queue(worker, "CLOCK_OUT") if channel == "review" else None
        batch = self.signed(worker, "CLOCK_OUT") if channel == "sync" else None
        cache, key, otp = self.seed_setup_otp(worker, membership)
        prechecked, release = Event(), Event()
        guard = kiosk_api.check_clock_in_double_guard

        def after_precheck(*args, **kwargs):
            result = guard(*args, **kwargs)
            if current_thread().name == "verified-race-setup":
                prechecked.set()
                if not release.wait(timeout=12):
                    raise AssertionError("Setup precheck was not released.")
            return result

        tasks = []
        with patch.object(credentials, "security_cache", cache), patch("users.tasks.send_async_email") as confirmation, \
             patch.object(kiosk_api, "check_clock_in_double_guard", side_effect=after_precheck):
            try:
                setup = self.start("verified-race-setup", lambda: self.post_pin_setup(worker))
                tasks.append(setup)
                self.assertTrue(prechecked.wait(timeout=10))
                close = self.start(
                    "verified-close", lambda: self.decide(evidence) if channel == "review"
                    else sync_offline_batch(self.device, [batch]),
                )
                tasks.append(close)
                self.assertTrue(close[3].wait(timeout=10), "Verified close must commit while setup holds User.")
            finally:
                release.set()
                outcomes = [self.finish(task) for task in tasks]
            self.assertFalse(self.sql_errors, (outcomes, self.sql_errors))
            self.assertTrue(all(kind == "ok" for kind, _ in outcomes), outcomes)
            response, closed = [value for _, value in outcomes]
            if channel == "review":
                self.assertEqual(closed.status_code, 200, closed.data)
                self.assertEqual(KioskAttendanceReview.objects.filter(evidence=evidence).count(), 1)
            else:
                self.assertEqual(closed["results"][0]["result"], "accepted", closed)
            self.assertEqual(response.status_code, 409, response.data)
            self.assertEqual(response.data.get("code"), "CONFIRM_OPPOSITE_ACTION")
            confirmation.assert_not_called()
            self.assertEqual(cache.get(key), otp, "409 consumed an OTP validated before the concurrent close.")
            self.assertEqual(WorkerPIN.objects.filter(pk=pin.pk).values().get(), pin_before)
            self.assertTrue(WorkerPIN.objects.get(pk=pin.pk).check_pin("1357"))
            session.refresh_from_db()
            self.assertEqual(session.ended_at, self.now)
            self.assertEqual(session.events.count(), 2)
            self.assertEqual(session.events.get(event_type="CLOCK_OUT").source, "OFFLINE_KIOSK")
            self.assertEqual(AttendanceSession.objects.filter(user=worker).count(), 1)
            # Prove usable, rather than merely present in the cache, with the same code and explicit confirmation.
            retry = self.post_pin_setup(worker, confirm=True)
            self.assertEqual(retry.status_code, 201, retry.data)
            self.assertEqual(retry.data["action"], "CLOCKED_IN")
            confirmation.assert_called_once()
            self.assertIsNone(cache.get(key))
            self.assertTrue(WorkerPIN.objects.get(pk=pin.pk).check_pin("2468"))
            self.assertEqual(AttendanceSession.objects.filter(user=worker).count(), 2)
            self.assertEqual(AttendanceEvent.objects.filter(session__user=worker).count(), 3)

    def test_verified_sync_close_after_setup_precheck_keeps_otp_usable_and_pin_unchanged_on_409(self):
        self.check_verified_close_preserves_setup_otp("sync")

    def test_verified_review_close_after_setup_precheck_keeps_otp_usable_and_pin_unchanged_on_409(self):
        self.check_verified_close_preserves_setup_otp("review")
