"""Accepted emergency-cover source facts and mixed invoice-route contention."""
from copy import deepcopy
from datetime import time
from decimal import Decimal
from queue import Queue
from threading import Event, Thread
from time import monotonic
from unittest import skipUnless

from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import close_old_connections, connection, transaction
from django.test import TestCase, TransactionTestCase
from rest_framework.exceptions import ValidationError as FinanceValidationError

from attendance.test_cover_terms_acceptance import CoverTermsFixture
from client_profile.characterization_support import client_for
from invoicing.models import Invoice, InvoiceLineItem
from invoicing.services import generate_invoice_from_shifts, generate_preview_invoice_lines
from shifts.models import ShiftSlot, ShiftSlotAssignment
from worker_finance.models import InvoiceRevision
from worker_finance.services import internal_invoice_prefill, internal_invoice_sources, save_draft


POSTGRES_ONLY = skipUnless(connection.vendor == "postgresql", "Requires migrated PostgreSQL cover and row locks.")


class AcceptedCoverInvoiceFixture(CoverTermsFixture):
    def accepted_cover(self):
        review = self.cover()
        assignment = review.backfill_assignment
        self.assert_unaccepted(assignment)
        self.assertEqual(internal_invoice_sources(self.worker), [])
        with self.assertRaises(FinanceValidationError):
            internal_invoice_prefill(self.worker, [assignment.pk])
        with self.assertRaises(DjangoValidationError):
            generate_preview_invoice_lines(assignment.shift, self.worker)
        response = self.accept(assignment)
        self.assertEqual(response.status_code, 200, response.content[:300])
        self.assert_accepted(assignment, review)
        self.assertIsNone(assignment.source_offer_id)
        return review, assignment

    def billing_data(self):
        return {
            "bank_account_name": "Cover Provider", "bsb": "123456", "account_number": "12345678",
            "super_rate_snapshot": "0", "gst_registered": False,
        }


@POSTGRES_ONLY
class AcceptedCoverInvoiceFactsTests(AcceptedCoverInvoiceFixture, TestCase):
    def test_accepted_no_offer_cover_retains_original_facts_across_all_invoice_consumers(self):
        review, assignment = self.accepted_cover()
        original_terms = deepcopy(assignment.engagement_terms_snapshot)
        accepted_at = assignment.engagement_terms_accepted_at
        occurrence = original_terms["occurrences"][0]

        # Simulate independently changed records; this does not assert that an
        # ordinary roster editor is allowed to change accepted agreements.
        ShiftSlot.objects.filter(pk=assignment.slot_id).update(start_time=time(11), end_time=time(16))
        ShiftSlotAssignment.objects.filter(pk=assignment.pk).update(unit_rate=Decimal("135.00"))
        type(self.profile).objects.filter(pk=self.profile.pk).update(
            gst_registered=False, abn_gst_registered=False,
            payment_preference="TFN", abn_entity_name="Later business name",
        )

        [legacy] = generate_preview_invoice_lines(assignment.shift, self.worker)
        [source] = internal_invoice_sources(self.worker)
        prefill = internal_invoice_prefill(self.worker, [assignment.pk])
        preview_response = client_for(self.worker).post("/api/v1/invoices/generate/preview/", {
            "external": False, "pharmacy": self.pharmacy.pk, "shift_ids": [assignment.shift_id],
            "line_items": [], "gst_registered": False, "super_rate_snapshot": "0.00",
        }, format="json")
        self.assertEqual(preview_response.status_code, 200, preview_response.data)
        self.assertEqual((Invoice.objects.count(), InvoiceLineItem.objects.count(), InvoiceRevision.objects.count()), (0, 0, 0))
        record = save_draft(self.worker, prefill)
        [evidence] = record.source_snapshot["accepted_terms"]
        expected_times = (occurrence["start_time"][:5], occurrence["end_time"][:5])

        with self.subTest(consumer="legacy_preview"):
            self.assertEqual((legacy["start_time"][:5], legacy["end_time"][:5]), expected_times)
            self.assertEqual((legacy["quantity"], legacy["unit_price"], legacy["total"]), (1.0, 73.5, 73.5))
        with self.subTest(consumer="generation_preview"):
            preview = preview_response.data
            [line] = preview["line_items"]
            self.assertEqual((line["start_time"][:5], line["end_time"][:5]), expected_times)
            self.assertEqual((line["quantity"], line["unit_price"], line["total"]), ("1.00", "73.50", "73.50"))
            self.assertEqual(line["assignmentId"], assignment.pk)
            self.assertEqual((line["origin"], line["locked"], line["was_modified"]), ("assignment", True, False))
            self.assertTrue(line["gst_applicable"])
            self.assertFalse(line["super_applicable"])
            self.assertEqual((preview["subtotal"], preview["gst_amount"], preview["super_amount"], preview["total"]),
                             ("73.50", "0.00", "0.00", "73.50"))
        with self.subTest(consumer="finance_sources"):
            self.assertEqual((source["start_time"], source["end_time"]), expected_times)
            self.assertEqual((source["hours"], source["rate"]), ("1.00", "73.50"))
        with self.subTest(consumer="finance_prefill"):
            [line] = prefill["lines"]
            self.assertEqual((line["quantity"], line["unit_price"]), ("1.00", "73.50"))
            self.assertIn("-".join(expected_times), line["description"])
            self.assertEqual(line["worked_on"], str(assignment.slot_date))
        with self.subTest(consumer="original_source_snapshot"):
            self.assertEqual((evidence["original_hours"], evidence["original_rate"]), ("1.00", "73.50"))

        # Accepted tax evidence and current finance defaults remain separate.
        self.assertTrue(legacy["gst_applicable"])
        self.assertFalse(prefill["gst_registered"])
        self.assertEqual(prefill["lines"][0]["tax_code"], "OUT_OF_SCOPE")
        self.assertFalse(prefill["lines"][0]["super_eligible"])
        self.assertEqual(evidence["terms"], original_terms)
        self.assertIsNone(evidence["source_offer_id"])
        self.assertEqual(evidence["accepted_at"], accepted_at.isoformat())
        self.assertEqual(evidence["terms"]["accepted_by_user_id"], self.worker.pk)
        self.assertEqual(evidence["terms"]["source"], "COVER_TERMS_ACCEPTANCE")
        self.assertEqual(evidence["terms"]["provisional_id"], review.pk)
        self.assertEqual(evidence["terms"]["cover_type"], review.cover_type)
        self.assertTrue(evidence["terms"]["gst_registered"])
        self.assertTrue(evidence["terms"]["super_review_required"])
        self.assertFalse(evidence["terms"]["super_payable_confirmed"])
        self.assertEqual(record.revisions.get().source_snapshot, record.source_snapshot)
        assignment.refresh_from_db()
        self.assertEqual(assignment.engagement_terms_snapshot, original_terms)
        self.assertEqual(assignment.engagement_terms_accepted_at, accepted_at)
        self.assert_no_payment()


@POSTGRES_ONLY
class MixedInvoiceRouteConcurrencyTests(AcceptedCoverInvoiceFixture, TransactionTestCase):
    def start_invoice(self, route, assignment, prefill, reached, finished, pids, outcomes):
        user_model, worker_pk = type(self.worker), self.worker.pk
        user_table = connection.ops.quote_name(user_model._meta.db_table)

        def observe(execute, sql, params, many, context):
            if "FOR UPDATE" in sql and user_table in sql:
                reached.set()
            return execute(sql, params, many, context)

        def create():
            close_old_connections()
            try:
                with connection.cursor() as cursor:
                    cursor.execute("SET lock_timeout = '6s'")
                    cursor.execute("SET statement_timeout = '12s'")
                    cursor.execute("SELECT pg_backend_pid()")
                    pids.put(cursor.fetchone()[0])
                worker = user_model.objects.get(pk=worker_pk)
                with connection.execute_wrapper(observe):
                    if route == "finance":
                        invoice = save_draft(worker, deepcopy(prefill))
                    else:
                        invoice = generate_invoice_from_shifts(
                            worker, pharmacy_id=self.pharmacy.pk, shift_ids=[assignment.shift_id],
                            billing_data=self.billing_data(),
                        )
                outcomes.put((route, "created", invoice.pk))
            except (DjangoValidationError, FinanceValidationError) as exc:
                outcomes.put((route, "validation", str(exc)))
            except Exception as exc:
                outcomes.put((route, "error", repr(exc)))
            finally:
                finished.set()
                connection.close()

        thread = Thread(target=create, daemon=True)
        thread.start()
        return thread

    def assert_waiting_on_owner_queue(self, pid, earlier_pids, finished):
        # Query the actual lock graph so finance is queued first, rather than
        # relying on thread-start timing or sleeps to expose opposite lock order.
        # PostgreSQL can name an earlier waiter instead of the holder itself.
        deadline = monotonic() + 3
        blockers = []
        while monotonic() < deadline and not finished.is_set():
            with connection.cursor() as cursor:
                cursor.execute("SELECT pg_blocking_pids(%s)", [pid])
                blockers = cursor.fetchone()[0]
                if set(blockers).intersection(earlier_pids):
                    return
        self.fail(f"Invoice request {pid} never joined the held worker queue; blockers={blockers}")

    def test_legacy_and_finance_racing_for_accepted_cover_create_one_invoice_without_deadlock(self):
        _, assignment = self.accepted_cover()
        prefill = internal_invoice_prefill(self.worker, [assignment.pk])
        outcomes, threads = Queue(), []
        try:
            with transaction.atomic():
                with connection.cursor() as cursor:
                    cursor.execute("SET LOCAL lock_timeout = '6s'")
                    cursor.execute("SET LOCAL statement_timeout = '12s'")
                    cursor.execute("SELECT pg_backend_pid()")
                    parent_pid = cursor.fetchone()[0]
                type(self.worker).objects.select_for_update().get(pk=self.worker.pk)
                # Both routes contend for the same accepted assignment. Finance
                # queues first on the worker row; legacy must not hold an
                # assignment row while waiting for that same worker.
                earlier_pids = [parent_pid]
                for route in ("finance", "legacy"):
                    reached, finished, pids = Event(), Event(), Queue()
                    threads.append(self.start_invoice(route, assignment, prefill, reached, finished, pids, outcomes))
                    self.assertTrue(reached.wait(3), f"{route} never attempted the worker lock")
                    pid = pids.get(timeout=2)
                    self.assert_waiting_on_owner_queue(pid, earlier_pids, finished)
                    earlier_pids.append(pid)
            for thread in threads:
                thread.join(15)
                self.assertFalse(thread.is_alive(), "Invoice request exceeded bounded PostgreSQL timeouts")
            results = [outcomes.get(timeout=2) for _ in threads]
            self.assertEqual(sorted(kind for _, kind, _ in results), ["created", "validation"], results)
            self.assertEqual(Invoice.objects.count(), 1)
            self.assertEqual(InvoiceLineItem.objects.filter(source_assignment=assignment).count(), 1)
            self.assertEqual(InvoiceRevision.objects.count(), 1)
            invoice = Invoice.objects.get()
            self.assertEqual((invoice.version, invoice.status), (1, "draft"))
            self.assertEqual(invoice.source_snapshot["assignment_ids"], [assignment.pk])
            self.assertIsNone(invoice.source_snapshot["accepted_terms"][0]["source_offer_id"])
            self.assert_no_payment()
        finally:
            for thread in threads:
                thread.join(15)
