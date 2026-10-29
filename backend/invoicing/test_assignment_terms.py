"""Accepted source facts agree across invoice adapters without freezing editable invoices."""
from copy import deepcopy
from datetime import date, time, timedelta
from decimal import Decimal

from django.core.exceptions import ValidationError as DjangoValidationError
from django.test import TestCase
from django.utils import timezone
from rest_framework.exceptions import ValidationError as FinanceValidationError

from client_profile.characterization_support import client_for, make_assignment, make_owner_with_pharmacy, make_user
from invoicing.models import Invoice
from invoicing.services import generate_preview_invoice_lines
from onboarding.models import OtherStaffOnboarding
from shifts.models import ShiftSlotAssignment
from worker_finance.models import Customer, InvoiceRevision
from worker_finance.services import internal_invoice_prefill, internal_invoice_sources, save_draft


class AcceptedAssignmentSourceTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("Accepted source pharmacy")
        self.worker = make_user("OTHER_STAFF")
        self.profile = OtherStaffOnboarding.objects.create(
            user=self.worker, role_type="ASSISTANT", payment_preference="ABN",
            abn="51824753556", abn_verified=True, abn_entity_confirmed=True,
            gst_registered=True,
        )
        self.shift, self.slot, self.assignment = make_assignment(
            self.pharmacy, self.owner, self.worker, date(2026, 9, 21),
        )
        self.assignment.unit_rate = Decimal("70.00")
        self.assignment.settlement_channel = "INVOICE"
        self.assignment.engagement_kind = "INDEPENDENT_CONTRACTOR"
        self.assignment.engagement_terms_accepted_at = timezone.now()
        self.assignment.engagement_terms_snapshot = {
            "accepted_at": self.assignment.engagement_terms_accepted_at.isoformat(),
            "accepted_by_user_id": self.worker.pk,
            "gst_registered": True,
            "super_review_required": True,
            "super_payable_confirmed": False,
            "occurrences": [self.occurrence()],
        }
        self.assignment.save()

    def occurrence(self, **overrides):
        return {
            "slot_id": self.slot.pk, "date": str(self.slot.date),
            "start_time": "09:00:00", "end_time": "17:00:00", "agreed_rate": "70.00",
            **overrides,
        }

    def set_occurrences(self, *occurrences):
        self.assignment.engagement_terms_snapshot["occurrences"] = list(occurrences)
        self.assignment.save(update_fields=["engagement_terms_snapshot"])

    def assert_adapters(self, *, start="09:00:00", end="17:00:00", hours="8.00", rate="70.00", assignment=None):
        assignment = assignment or self.assignment
        legacy = next(row for row in generate_preview_invoice_lines(self.shift, self.worker)
                      if row["assignmentId"] == assignment.pk)
        source = next(row for row in internal_invoice_sources(self.worker)
                      if row["assignment_id"] == assignment.pk)
        draft = internal_invoice_prefill(self.worker, [assignment.pk])
        [line] = draft["lines"]
        self.assertEqual((legacy["start_time"], legacy["end_time"]), (start, end))
        self.assertEqual((legacy["quantity"], legacy["unit_price"]), (float(hours), float(rate)))
        self.assertIsInstance(legacy["quantity"], float)
        self.assertIsInstance(legacy["unit_price"], float)
        self.assertEqual((source["start_time"], source["end_time"]), (start[:5], end[:5]))
        self.assertEqual((source["hours"], source["rate"]), (hours, rate))
        self.assertEqual((line["quantity"], line["unit_price"]), (hours, rate))
        self.assertEqual((legacy["date"], source["date"], line["worked_on"]), (str(assignment.slot_date),) * 3)
        self.assertIn(f"{assignment.slot_date} {start[:5]}-{end[:5]}", line["description"])
        return draft

    def test_accepted_times_and_rate_win_over_changed_current_slot_and_rate(self):
        self.set_occurrences(self.occurrence(start_time="10:15:00", end_time="14:30:00", agreed_rate="73.50"))
        self.slot.start_time, self.slot.end_time = time(8), time(19)
        self.slot.save(update_fields=["start_time", "end_time"])
        self.assignment.unit_rate = Decimal("999.00")
        self.assignment.save(update_fields=["unit_rate"])
        draft = self.assert_adapters(start="10:15:00", end="14:30:00", hours="4.25", rate="73.50")
        record = save_draft(self.worker, draft)
        evidence = record.source_snapshot["accepted_terms"][0]
        self.assertEqual((evidence["original_hours"], evidence["original_rate"]), ("4.25", "73.50"))
        self.assertEqual(evidence["terms"], self.assignment.engagement_terms_snapshot)
        self.assertIsNone(evidence["source_offer_id"])
        self.assertEqual(record.line_items.get(source_assignment=self.assignment).quantity, Decimal("4.25"))

    def test_recurring_occurrences_match_both_slot_and_date(self):
        next_date = self.slot.date + timedelta(days=7)
        self.set_occurrences(
            self.occurrence(slot_id=self.slot.pk + 100, start_time="00:00:00", end_time="23:00:00", agreed_rate="999"),
            self.occurrence(date=str(next_date), start_time="12:00:00", end_time="15:30:00", agreed_rate="82.00"),
            self.occurrence(start_time="10:00:00", end_time="14:00:00", agreed_rate="71.00"),
        )
        recurring = ShiftSlotAssignment.objects.create(
            shift=self.shift, slot=self.slot, slot_date=next_date, user=self.worker,
            unit_rate=Decimal("20.00"), settlement_channel="INVOICE", engagement_kind="INDEPENDENT_CONTRACTOR",
            engagement_terms_accepted_at=self.assignment.engagement_terms_accepted_at,
            engagement_terms_snapshot=deepcopy(self.assignment.engagement_terms_snapshot),
        )
        self.assert_adapters(start="10:00:00", end="14:00:00", hours="4.00", rate="71.00")
        self.assert_adapters(start="12:00:00", end="15:30:00", hours="3.50", rate="82.00", assignment=recurring)

    def test_missing_matching_occurrence_keeps_current_slot_and_assignment_fallback(self):
        self.set_occurrences(
            self.occurrence(date=str(self.slot.date + timedelta(days=1)), agreed_rate="999.00"),
            self.occurrence(slot_id=self.slot.pk + 100, agreed_rate="888.00"),
        )
        self.assert_adapters()

    def test_missing_one_accepted_time_falls_back_only_for_that_time(self):
        self.set_occurrences(self.occurrence(start_time="10:00:00", end_time=None))
        self.assert_adapters(start="10:00:00", hours="7.00")

    def test_overnight_accepted_times_keep_the_same_billed_duration(self):
        self.set_occurrences(self.occurrence(start_time="22:30:00", end_time="02:15:00"))
        self.assert_adapters(start="22:30:00", end="02:15:00", hours="3.75")

    def test_exact_half_hundredth_hour_uses_half_up_in_every_source(self):
        # 3,618 seconds is exactly 1.005 hours; finance previously rounded it down.
        self.slot.end_time = time(10, 0, 18)
        self.slot.save(update_fields=["end_time"])
        self.set_occurrences(self.occurrence(end_time="10:00:18"))
        draft = self.assert_adapters(end="10:00:18", hours="1.01")
        record = save_draft(self.worker, draft)
        self.assertEqual(record.source_snapshot["accepted_terms"][0]["original_hours"], "1.01")
        self.assertEqual(record.line_items.get(source_assignment=self.assignment).total, Decimal("70.70"))

    def test_existing_intermediate_duration_precision_is_preserved(self):
        # Canonical invoicing first rounds 1.004972... to 1.0050 hours, then 1.01.
        # A direct two-place quantize would silently change this established result.
        self.slot.end_time = time(10, 0, 17, 900000)
        self.slot.save(update_fields=["end_time"])
        self.set_occurrences(self.occurrence(end_time="10:00:17.900000"))
        self.assert_adapters(end="10:00:17", hours="1.01")

    def test_missing_or_nonpositive_accepted_rate_uses_positive_assignment_fallback(self):
        for rate in (None, "", "0.00", "-1.00"):
            with self.subTest(rate=rate):
                self.set_occurrences(self.occurrence(agreed_rate=rate))
                self.assert_adapters()

    def test_absent_or_nonpositive_rates_are_controlled_errors_in_each_adapter(self):
        for accepted_rate, fallback in ((None, None), ("0", Decimal("0")), ("-1", Decimal("-2"))):
            self.set_occurrences(self.occurrence(agreed_rate=accepted_rate))
            self.assignment.unit_rate = fallback
            self.assignment.save(update_fields=["unit_rate"])
            for label, call, error in (
                ("legacy", lambda: generate_preview_invoice_lines(self.shift, self.worker), DjangoValidationError),
                ("sources", lambda: internal_invoice_sources(self.worker), FinanceValidationError),
                ("prefill", lambda: internal_invoice_prefill(self.worker, [self.assignment.pk]), FinanceValidationError),
            ):
                with self.subTest(rate=accepted_rate, fallback=fallback, adapter=label):
                    with self.assertRaises(error) as caught:
                        call()
                    self.assertIn("rate", caught.exception.message_dict if error is DjangoValidationError else caught.exception.detail)

    def test_malformed_or_nonfinite_accepted_rate_does_not_escape_as_a_server_error(self):
        for rate in ("not-a-rate", "NaN", "Infinity", "-Infinity"):
            self.set_occurrences(self.occurrence(agreed_rate=rate))
            for label, call, error in (
                ("legacy", lambda: generate_preview_invoice_lines(self.shift, self.worker), DjangoValidationError),
                ("sources", lambda: internal_invoice_sources(self.worker), FinanceValidationError),
                ("prefill", lambda: internal_invoice_prefill(self.worker, [self.assignment.pk]), FinanceValidationError),
            ):
                with self.subTest(rate=rate, adapter=label):
                    with self.assertRaises(error) as caught:
                        call()
                    self.assertIn("rate", caught.exception.message_dict if error is DjangoValidationError else caught.exception.detail)

    def test_invalid_source_rate_remains_a_field_error_at_both_http_boundaries(self):
        self.set_occurrences(self.occurrence(agreed_rate="0"))
        self.assignment.unit_rate = Decimal("0")
        self.assignment.save(update_fields=["unit_rate"])
        client = client_for(self.worker)
        for url in (f"/api/v1/invoices/preview/{self.shift.pk}/", "/api/v1/finance/invoices/internal-sources/"):
            with self.subTest(url=url):
                response = client.get(url)
                self.assertEqual(response.status_code, 400, response.content)
                self.assertIn("rate", response.data)
        response = client.post("/api/v1/finance/invoices/internal-prefill/", {"assignment_ids": [self.assignment.pk]}, format="json")
        self.assertEqual(response.status_code, 400, response.content)
        self.assertIn("rate", response.data)

    def test_save_rechecks_original_rate_without_trusting_a_previous_prefill(self):
        draft = internal_invoice_prefill(self.worker, [self.assignment.pk])
        self.set_occurrences(self.occurrence(agreed_rate="0"))
        self.assignment.unit_rate = None
        self.assignment.save(update_fields=["unit_rate"])
        with self.assertRaises(FinanceValidationError) as caught:
            save_draft(self.worker, draft)
        self.assertIn("rate", caught.exception.detail)
        self.assertEqual(Invoice.objects.count(), 0)
        self.assertEqual(InvoiceRevision.objects.count(), 0)
        self.assertEqual(Customer.objects.count(), 0)

    def test_current_gst_default_remains_separate_from_accepted_tax_and_super_evidence(self):
        self.profile.gst_registered = False
        self.profile.save(update_fields=["gst_registered"])
        self.assignment.engagement_terms_snapshot["super_payable_confirmed"] = True
        self.assignment.save(update_fields=["engagement_terms_snapshot"])
        [legacy] = generate_preview_invoice_lines(self.shift, self.worker)
        draft = internal_invoice_prefill(self.worker, [self.assignment.pk])
        self.assertTrue(legacy["gst_applicable"])
        self.assertTrue(legacy["super_applicable"])
        self.assertFalse(draft["gst_registered"])
        self.assertEqual(draft["lines"][0]["tax_code"], "OUT_OF_SCOPE")
        self.assertTrue(draft["lines"][0]["super_eligible"])
        self.assertEqual(draft["super_mode"], "none")
        self.assertFalse(draft["super_confirmed"])
        record = save_draft(self.worker, draft)
        accepted = record.source_snapshot["accepted_terms"][0]["terms"]
        self.assertTrue(accepted["gst_registered"])
        self.assertTrue(accepted["super_review_required"])
        self.assertTrue(accepted["super_payable_confirmed"])

    def test_initial_and_later_corrections_preserve_original_source_evidence(self):
        self.set_occurrences(self.occurrence(start_time="10:15:00", end_time="14:30:00", agreed_rate="73.50"))
        draft = internal_invoice_prefill(self.worker, [self.assignment.pk])
        corrected_date = str(self.slot.date + timedelta(days=1))
        draft["lines"][0].update(
            quantity="3.00", unit_price="80.00", worked_on=corrected_date,
            description="Corrected actual services", tax_code="GST_FREE",
        )
        record = save_draft(self.worker, draft)
        evidence = deepcopy(record.source_snapshot)
        original = evidence["accepted_terms"][0]
        self.assertEqual((original["original_hours"], original["original_rate"]), ("4.25", "73.50"))
        self.assertEqual(original["terms"], self.assignment.engagement_terms_snapshot)
        self.assertEqual(record.payload["lines"][0]["worked_on"], corrected_date)
        self.assertEqual(record.payload["lines"][0]["description"], "Corrected actual services")
        self.assertEqual(record.payload["lines"][0]["tax_code"], "GST_FREE")
        first_line = record.line_items.get(source_assignment=self.assignment)
        self.assertEqual((first_line.quantity, first_line.unit_price, first_line.total), (Decimal("3"), Decimal("80"), Decimal("240")))

        self.pharmacy.name = "Renamed after first invoice"
        self.pharmacy.save(update_fields=["name"])
        updated_payload = deepcopy(record.payload)
        updated_payload["version"] = record.version
        updated_payload["lines"][0].update(quantity="3.50", unit_price="81.00", description="Second correction")
        updated = save_draft(self.worker, updated_payload, record.pk)
        self.assertEqual(updated.version, 2)
        self.assertEqual(updated.source_snapshot, evidence)
        self.assertEqual(updated.line_items.get(source_assignment=self.assignment).total, Decimal("283.50"))
        revisions = list(InvoiceRevision.objects.filter(invoice=updated).order_by("version"))
        self.assertEqual([row.source_snapshot for row in revisions], [evidence, evidence])
        self.assertEqual([row.payload["lines"][0]["quantity"] for row in revisions], ["3.00", "3.50"])
