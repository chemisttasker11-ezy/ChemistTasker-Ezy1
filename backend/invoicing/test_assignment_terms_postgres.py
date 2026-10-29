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
        record = save_draft(self.worker, prefill)
        [evidence] = record.source_snapshot["accepted_terms"]
        expected_times = (occurrence["start_time"][:5], occurrence["end_time"][:5])

        with self.subTest(consumer="legacy_preview"):
            self.assertEqual((legacy["start_time"][:5], legacy["end_time"][:5]), expected_times)
            self.assertEqual((legacy["quantity"], legacy["unit_price"], legacy["total"]), (1.0, 73.5, 73.5))
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
