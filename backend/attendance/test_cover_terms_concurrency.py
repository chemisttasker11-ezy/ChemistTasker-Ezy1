"""E17 row-lock contention using committed PostgreSQL rows; no sleeps."""
from queue import Queue
from threading import Event, Thread

from django.db import close_old_connections, connection, transaction
from django.test import TransactionTestCase

from attendance.models import AttendanceSession, ProvisionalAttendance
from attendance.test_cover_terms_acceptance import CONSENT, LIST, CoverTermsFixture
from client_profile.characterization_support import client_for, make_user
from shifts.models import ShiftSlotAssignment


class CoverTermsConcurrencyTests(CoverTermsFixture, TransactionTestCase):
    def start_accept(self, assignment, reached, outcomes, writes):
        worker_pk = self.worker.pk
        tables = [connection.ops.quote_name(model._meta.db_table) for model in
                  (ProvisionalAttendance, AttendanceSession, ShiftSlotAssignment)]

        def observe(execute, sql, params, many, context):
            if "FOR UPDATE" in sql and any(table in sql for table in tables):
                reached.set()
            if sql.startswith("UPDATE ") and tables[-1] in sql and '"engagement_terms_accepted_at"' in sql:
                writes.put(sql)
            return execute(sql, params, many, context)

        def request():
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                    cursor.execute("SET statement_timeout = '12s'")
                worker = type(self.worker).objects.get(pk=worker_pk)
                with connection.execute_wrapper(observe):
                    response = client_for(worker).post(LIST + f"{assignment.pk}/accept/", CONSENT, format="json")
                outcomes.put((response.status_code, getattr(response, "data", response.content[:300])))
            except Exception as exc:
                outcomes.put(("ERROR", repr(exc)))
            finally:
                reached.set()  # Missing endpoint exits immediately; the status assertion proves why.
                connection.close()

        thread = Thread(target=request, daemon=True)
        thread.start()
        return thread

    def test_concurrent_accepts_freeze_one_snapshot_under_held_postgres_locks(self):
        review = self.cover()
        assignment = review.backfill_assignment
        first, second, outcomes, writes = Event(), Event(), Queue(), Queue()
        threads = []
        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("SET LOCAL lock_timeout = '5s'")
                    cursor.execute("SET LOCAL statement_timeout = '12s'")
                # Same order as approval: review -> session -> assignment.
                ProvisionalAttendance.objects.select_for_update().get(pk=review.pk)
                AttendanceSession.objects.select_for_update().get(pk=review.session_id)
                ShiftSlotAssignment.objects.select_for_update().get(pk=assignment.pk)
                threads.append(self.start_accept(assignment, first, outcomes, writes))
                threads.append(self.start_accept(assignment, second, outcomes, writes))
                self.assertTrue(first.wait(3), "First request never attempted a protected row lock or completed")
                self.assertTrue(second.wait(3), "Second request never attempted a protected row lock or completed")
                self.assertIsNone(ShiftSlotAssignment.objects.get(pk=assignment.pk).engagement_terms_accepted_at)
            results = []
            for thread in threads:
                thread.join(15)
                self.assertFalse(thread.is_alive(), "Acceptance exceeded bounded PostgreSQL timeouts")
                results.append(outcomes.get(timeout=2))
            self.assertEqual([status for status, _ in results], [200, 200], results)
            self.assertEqual(results[0][1], results[1][1], "Both requests must replay the same acceptance")
            self.assertEqual(writes.qsize(), 1, "Only one SQL update may stamp worker consent")
            self.assert_accepted(assignment, review)
            self.assertEqual(ShiftSlotAssignment.objects.count(), 1)
        finally:
            for thread in threads:
                thread.join(15)

    def mutation_overlapping_acceptance(self, assignment, operation):
        """Hold acceptance's row, let a real writer reach its lock/write, then accept.

        An unlocked reader sees the pre-consent row; a correct locking writer waits
        and reloads the accepted row. PostgreSQL, rather than timing, orders them.
        """
        reached, outcomes = Event(), Queue()
        table = connection.ops.quote_name(ShiftSlotAssignment._meta.db_table)

        def observe(execute, sql, params, many, context):
            if table in sql and ("FOR UPDATE" in sql or "FOR NO KEY UPDATE" in sql or sql.startswith("UPDATE ")):
                reached.set()
            return execute(sql, params, many, context)

        def mutate():
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                    cursor.execute("SET statement_timeout = '12s'")
                with connection.execute_wrapper(observe):
                    result = operation()
                outcomes.put(result)
            except Exception as exc:
                outcomes.put(("ERROR", repr(exc)))
            finally:
                connection.close()

        thread = Thread(target=mutate, daemon=True)
        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("SET LOCAL lock_timeout = '5s'")
                    cursor.execute("SET LOCAL statement_timeout = '12s'")
                ProvisionalAttendance.objects.select_for_update().get(pk=self.racing_review.pk)
                AttendanceSession.objects.select_for_update().get(pk=self.racing_review.session_id)
                ShiftSlotAssignment.objects.select_for_update().get(pk=assignment.pk)
                thread.start()
                self.assertTrue(reached.wait(3), "Writer never reached the assignment lock/write checkpoint")
                response = self.accept(assignment)
                self.assertEqual(response.status_code, 200, response.content[:300])
                assignment.refresh_from_db()
                original = (assignment.user_id, assignment.engagement_terms_accepted_at,
                            assignment.engagement_terms_snapshot, assignment.unit_rate, assignment.rate_reason)
            thread.join(15)
            self.assertFalse(thread.is_alive(), "Writer exceeded bounded PostgreSQL timeouts")
            result = outcomes.get(timeout=2)
            self.assertNotEqual(result[0], "ERROR", result)
            assignment.refresh_from_db()
            self.assertEqual((assignment.user_id, assignment.engagement_terms_accepted_at,
                              assignment.engagement_terms_snapshot, assignment.unit_rate, assignment.rate_reason),
                             original, "A stale writer erased or repriced accepted worker terms")
            self.assert_sources(assignment, True)
            return result
        finally:
            if thread.ident is not None:
                thread.join(15)

    def test_a1_manager_patch_overlapping_acceptance_keeps_frozen_consent(self):
        self.racing_review = self.cover()
        assignment = self.racing_review.backfill_assignment
        def operation():
            manager = type(self.manager).objects.get(pk=self.manager.pk)
            response = client_for(manager).patch(f"/api/v1/roster-owner/{assignment.pk}/", {
                "is_rostered": True,
            }, format="json")
            return response.status_code, getattr(response, "data", response.content[:300])
        self.assertEqual(self.mutation_overlapping_acceptance(assignment, operation)[0], 200)
        assignment.refresh_from_db()
        self.assertTrue(assignment.is_rostered, "The allowed manager edit must still be applied")

    def test_a1_manager_transfer_overlapping_acceptance_is_refused(self):
        self.racing_review = self.cover()
        assignment = self.racing_review.backfill_assignment
        other = make_user("PHARMACIST")
        def operation():
            manager = type(self.manager).objects.get(pk=self.manager.pk)
            response = client_for(manager).patch(f"/api/v1/roster-owner/{assignment.pk}/", {
                "user": other.pk,
            }, format="json")
            return response.status_code, getattr(response, "data", response.content[:300])
        self.assertEqual(self.mutation_overlapping_acceptance(assignment, operation)[0], 400)

    def test_a1_rate_refresh_from_stale_instance_cannot_reprice_after_acceptance(self):
        from decimal import Decimal
        from workforce.roster.assignment_rates import refresh_assignment_rate
        self.racing_review = self.cover()
        assignment = self.racing_review.backfill_assignment
        self.pharmacy.default_rate_type = "FIXED"
        self.pharmacy.default_fixed_rate = Decimal("110")
        self.pharmacy.rate_weekday = Decimal("110")
        self.pharmacy.state = "QLD"
        self.pharmacy.save()
        shift = assignment.shift
        shift.rate_type = "FIXED"
        shift.fixed_rate = Decimal("110")
        shift.save(update_fields=["rate_type", "fixed_rate"])
        def operation():
            stale = ShiftSlotAssignment.objects.get(pk=assignment.pk)
            refresh_assignment_rate(stale)
            return 200, None
        self.assertEqual(self.mutation_overlapping_acceptance(assignment, operation)[0], 200)
        assignment.refresh_from_db()
        self.assertEqual(assignment.unit_rate, Decimal("73.50"))

    def defaults_overlapping_uncommitted_acceptance(self, route):
        from workforce.tests.test_cover_terms_authority import CoverTermsRosterReviewTests

        review = self.cover()
        assignment = review.backfill_assignment
        if route in ("assign_worker", "move_shift"):
            assignment.is_rostered = True
            assignment.save(update_fields=["is_rostered"])
        reached, outcomes = Event(), Queue()
        table = connection.ops.quote_name(ShiftSlotAssignment._meta.db_table)

        def observe(execute, sql, params, many, context):
            if table in sql and ("FOR UPDATE" in sql or "FOR NO KEY UPDATE" in sql or sql.startswith("UPDATE ")):
                reached.set()
            return execute(sql, params, many, context)

        def roster():
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout = '5s'")
                    cursor.execute("SET statement_timeout = '12s'")
                # Acceptance has already computed external terms. This independent
                # commit now makes staff defaults reachable while consent is invisible.
                self.member()
                self.assertIsNone(ShiftSlotAssignment.objects.get(pk=assignment.pk).engagement_terms_accepted_at)
                with connection.execute_wrapper(observe):
                    response = CoverTermsRosterReviewTests.roster_request(self, route, assignment)
                outcomes.put((response.status_code, getattr(response, "data", response.content[:300])))
            except Exception as exc:
                outcomes.put(("ERROR", repr(exc)))
                reached.set()
            finally:
                connection.close()

        thread = Thread(target=roster, daemon=True)
        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("SET LOCAL lock_timeout = '5s'")
                    cursor.execute("SET LOCAL statement_timeout = '12s'")
                # The real acceptance endpoint acquires provisional/session -> assignment.
                response = self.accept(assignment)
                self.assertEqual(response.status_code, 200, response.content[:300])
                assignment.refresh_from_db()
                original = CoverTermsRosterReviewTests.frozen(assignment)
                thread.start()
                self.assertTrue(reached.wait(3), "Roster caller never reached the assignment lock/write checkpoint")
            thread.join(15)
            self.assertFalse(thread.is_alive(), "Roster caller exceeded bounded PostgreSQL timeouts")
            result = outcomes.get(timeout=2)
            self.assertEqual(result[0], 200, result)
            assignment.refresh_from_db()
            self.assertEqual(CoverTermsRosterReviewTests.frozen(assignment), original,
                             f"{route} erased consent committed while its defaults helper was running")
            self.assertTrue(assignment.is_rostered, "The allowed roster edit must still apply")
            self.assert_sources(assignment, True)
            review.refresh_from_db()
            review.session.refresh_from_db()
            self.assertEqual((review.backfill_assignment_id, review.session.assignment_id),
                             (assignment.pk, assignment.pk))
        finally:
            if thread.ident is not None:
                thread.join(15)


def defaults_race(route):
    def test(self):
        self.defaults_overlapping_uncommitted_acceptance(route)
    return test


for _route in ("legacy_shift_patch", "manual_assign", "assign_worker", "move_shift"):
    setattr(CoverTermsConcurrencyTests, f"test_gap1_{_route}_cannot_erase_concurrent_acceptance", defaults_race(_route))
