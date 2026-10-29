from copy import deepcopy
from datetime import date, time, timedelta
from decimal import Decimal
import json
from uuid import uuid4

from django.contrib.auth import get_user_model
from django.core.exceptions import ValidationError
from django.db import connection
from django.test import TestCase
from django.test.utils import CaptureQueriesContext
from django.utils import timezone
from rest_framework.test import APIRequestFactory, force_authenticate
from unittest.mock import patch

from client_profile.models import (
    OtherStaffOnboarding,
    OwnerOnboarding,
    Pharmacy,
    Shift,
    ShiftSlot,
    ShiftSlotAssignment,
)
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from invoicing.models import Invoice, InvoiceLineItem, manager_visible_state
from notifications.models import Notification
from invoicing.serializers import InvoiceSerializer
from invoicing.services import generate_invoice_from_shifts, recalculate_invoice_totals
from invoicing.views import InvoiceDetailView, send_invoice_email
from worker_finance.views import InvoiceViewSet, ReceivedInvoiceViewSet
from worker_finance.models import CatalogueItem, Customer, Delivery, InvoiceRevision
from worker_finance.services import internal_invoice_prefill, save_draft, serialize_record, owner_visible_document


User = get_user_model()


class AcceptedShiftInvoiceIntegrityTests(TestCase):
    def test_c021_n2_invoices_use_the_accepted_hours_and_keep_other_occurrences_unchanged(self):
        from invoicing.services import generate_preview_invoice_lines
        occurrence = self.assignment.engagement_terms_snapshot['occurrences'][0]
        occurrence.update(start_time='10:00:00', end_time='14:00:00')
        self.assignment.save(update_fields=['engagement_terms_snapshot'])
        [line] = generate_preview_invoice_lines(self.shift, self.worker)
        self.assertEqual((line['start_time'], line['end_time'], line['quantity'], line['total']),
                         ('10:00:00', '14:00:00', 4.0, 280.0))
        invoice = self._generate()
        self.assertEqual(invoice.line_items.get(category_code='ProfessionalServices').quantity, Decimal('4.00'))
        occurrence.update(date=str(self.slot.date + timedelta(days=1)))
        self.assignment.save(update_fields=['engagement_terms_snapshot'])
        [original] = generate_preview_invoice_lines(self.shift, self.worker)
        self.assertEqual((original['quantity'], original['total']), (8.0, 560.0))

    def test_mark_paid_does_not_publish_an_unsent_internal_draft_or_revision(self):
        record = save_draft(self.worker, internal_invoice_prefill(self.worker, [self.assignment.id]))
        factory = APIRequestFactory()
        for version in (1, 2):
            with self.subTest(version=version):
                request = factory.post(f"/finance/invoices/{record.pk}/mark-paid/", {"version": record.version}, format="json")
                force_authenticate(request, user=self.worker)
                response = InvoiceViewSet.as_view({"post": "mark_paid"})(request, pk=record.pk)
                self.assertEqual(response.status_code, 200, response.data)
                # F07-N2 records the balance once, even for an undelivered draft.
                self.assertEqual(record.payments.count(), 1)
                self.assertEqual(record.payments.get().amount, Decimal(record.calculation["payable"]))
                request = factory.get("/finance/received-invoices/")
                force_authenticate(request, user=self.owner)
                received = ReceivedInvoiceViewSet.as_view({"get": "list"})(request)
                self.assertEqual(received.data["count"], version - 1)
                if version == 2:
                    self.assertEqual(received.data["results"][0]["version"], 1)
                    self.assertEqual([revision["version"] for revision in received.data["results"][0]["revisions"]], [1])
                request = factory.get(f"/invoices/{record.pk}/")
                force_authenticate(request, user=self.owner)
                self.assertEqual(InvoiceDetailView.as_view()(request, pk=record.pk).status_code, 404)
                if version == 1:
                    Delivery.objects.create(invoice=record, version=1, recipient=self.owner.email, status="sent", sent_at=timezone.now())
                    request = factory.get("/finance/received-invoices/")
                    force_authenticate(request, user=self.owner)
                    received = ReceivedInvoiceViewSet.as_view({"get": "list"})(request)
                    self.assertEqual(received.data["count"], 1)
                    self.assertEqual(received.data["results"][0]["version"], 1)
                    record.refresh_from_db()
                    payload = dict(record.payload, version=record.version, notes="Unsent correction")
                    record = save_draft(self.worker, payload, record.pk)

    def setUp(self):
        self.worker = User.objects.create_user(
            email="invoice-integrity@example.com",
            password="test-pass",
            role="OTHER_STAFF",
            first_name="Invoice",
            last_name="Worker",
        )
        OtherStaffOnboarding.objects.create(
            user=self.worker,
            role_type="ASSISTANT",
            payment_preference="ABN",
            abn="51824753556",
            abn_verified=True,
            abn_entity_confirmed=True,
            gst_registered=True,
        )
        self.owner = User.objects.create_user(
            email="invoice-owner@example.com",
            password="test-pass",
            role="OWNER",
            first_name="Invoice",
            last_name="Owner",
        )
        self.owner_onboarding = OwnerOnboarding.objects.create(
            user=self.owner,
            phone_number="0400000000",
            role="MANAGER",
        )
        self.pharmacy = Pharmacy.objects.create(
            name="Invoice Integrity Pharmacy",
            abn="51824753556",
            owner=self.owner_onboarding,
        )
        self.shift = Shift.objects.create(
            pharmacy=self.pharmacy,
            created_by=self.owner,
            role_needed="ASSISTANT",
            employment_type="LOCUM",
        )
        self.slot = ShiftSlot.objects.create(
            shift=self.shift,
            date=date(2026, 9, 21),
            start_time=time(9, 0),
            end_time=time(17, 0),
        )
        self.assignment = ShiftSlotAssignment.objects.create(
            shift=self.shift,
            slot=self.slot,
            slot_date=self.slot.date,
            user=self.worker,
            unit_rate="70.00",
            settlement_channel="INVOICE",
            engagement_kind="INDEPENDENT_CONTRACTOR",
            engagement_terms_accepted_at=timezone.now(),
            engagement_terms_snapshot={
                "gst_registered": True,
                "super_review_required": True,
                "super_payable_confirmed": False,
                "occurrences": [{
                    "slot_id": self.slot.id,
                    "date": str(self.slot.date),
                    "agreed_rate": "70.00",
                }],
            },
        )

    def _billing_data(self):
        return {
            "shift_ids": [self.shift.id],
            "external": False,
            "gst_registered": True,
            "super_rate_snapshot": "12.00",
            "bank_account_name": "Invoice Worker",
            "bsb": "123456",
            "account_number": "12345678",
            "cc_emails": "",
        }

    def _generate(self, custom_lines=None):
        return generate_invoice_from_shifts(
            user=self.worker,
            pharmacy_id=self.pharmacy.id,
            shift_ids=[self.shift.id],
            custom_lines=custom_lines or [],
            external=False,
            billing_data=self._billing_data(),
        )

    def _generate_via_api(self, **overrides):
        data = {
            **self._billing_data(),
            "pharmacy": self.pharmacy.pk,
            "issuer_abn": "51824753556",
            "bill_to_email": self.owner.email,
            **overrides,
        }
        return client_for(self.worker).post("/api/v1/invoices/generate/", data, format="json")

    def _assert_generated_amounts(self, response, *, subtotal, gst, payable, super_amount="0.00"):
        self.assertEqual(response.status_code, 201, response.data)
        invoice = Invoice.objects.get(pk=response.data["id"])
        self.assertEqual((invoice.version, invoice.status, invoice.revisions.count()), (1, "draft", 1))
        revision = invoice.revisions.get(version=1)
        self.assertEqual(revision.calculation, invoice.calculation)
        self.assertEqual(revision.payload, invoice.payload)
        self.assertEqual(revision.source_snapshot, invoice.source_snapshot)
        for field, calculation_key, expected in (
            ("subtotal", "subtotal", subtotal), ("gst_amount", "gst", gst),
            ("total", "payable", payable), ("super_amount", "super", super_amount),
        ):
            for representation, amount in (
                ("generation response", response.data[field]),
                ("canonical invoice", getattr(invoice, field)),
                ("finance calculation", invoice.calculation[calculation_key]),
                ("initial revision", revision.calculation[calculation_key]),
            ):
                with self.subTest(field=field, representation=representation):
                    self.assertEqual(Decimal(str(amount)), Decimal(expected))
        return invoice

    def test_internal_invoice_snapshots_accepted_assignment_and_does_not_assume_super(self):
        invoice = self._generate()
        service_line = invoice.line_items.get(category_code="ProfessionalServices")

        self.assertEqual(service_line.source_assignment_id, self.assignment.id)
        self.assertEqual(service_line.total, Decimal("560.00"))
        self.assertFalse(service_line.super_applicable)
        self.assertEqual(invoice.source_snapshot["source"], "INTERNAL_ABN_SHIFT_ASSIGNMENTS")
        self.assertEqual(invoice.source_snapshot["assignment_ids"], [self.assignment.id])
        self.assertEqual(invoice.subtotal, Decimal("560.00"))
        self.assertEqual(invoice.gst_amount, Decimal("56.00"))
        self.assertEqual(invoice.super_amount, Decimal("0.00"))
        self.assertEqual(invoice.total, Decimal("616.00"))
        self.assertFalse(invoice.line_items.filter(category_code="Superannuation").exists())
        record = invoice
        self.assertEqual(record.source, "internal")
        self.assertEqual(record.id, invoice.id)
        source_line = next(line for line in record.payload["lines"] if line.get("source_assignment_id"))
        self.assertEqual(source_line["source_assignment_id"], self.assignment.id)
        self.assertEqual(serialize_record(record)["source_snapshot"], invoice.source_snapshot)

    def test_internal_prefill_uses_pharmacy_shift_and_worker_onboarding_without_saving_invoice(self):
        self.assertEqual(Customer.objects.count(), 0)
        draft = internal_invoice_prefill(self.worker, [self.assignment.id])

        self.assertEqual(Customer.objects.count(), 0)
        self.assertEqual(draft["customer_id"], 0)
        self.assertEqual(draft["source_assignment_ids"], [self.assignment.id])
        self.assertEqual(draft["customer"]["name"], self.pharmacy.name)
        self.assertEqual(draft["customer"]["abn"], self.pharmacy.abn)
        self.assertEqual(draft["issuer_abn"], "51824753556")
        line = draft["lines"][0]
        self.assertEqual(line["source_assignment_id"], self.assignment.id)
        self.assertEqual(line["worked_on"], str(self.slot.date))
        self.assertEqual(line["quantity"], "8.00")
        self.assertEqual(line["unit_price"], "70.00")
        self.assertEqual(InvoiceRevision.objects.count(), 0)

        record = save_draft(self.worker, draft)
        self.assertEqual(Customer.objects.count(), 1)
        self.assertEqual(record.source, "internal")
        self.assertEqual(record.version, 1)
        self.assertEqual(record.pharmacy_id, self.pharmacy.id)
        self.assertEqual(InvoiceRevision.objects.filter(invoice=record).count(), 1)

    @patch("worker_finance.documents.render_pdf", return_value=b"%PDF-test")
    @patch("worker_finance.views.EmailMessage.send", return_value=1)
    def test_cash_receipts_survive_an_unsent_invoice_revision(self, _send, _render):
        draft = internal_invoice_prefill(self.worker, [self.assignment.id])
        record = save_draft(self.worker, draft)
        client = client_for(self.worker)
        url = f"/api/v1/finance/invoices/{record.pk}/"
        sent = client.post(url + "send/", {"version": 1, "confirmed": True}, format="json")
        self.assertEqual(sent.status_code, 200, sent.data)
        paid = client.post(url + "payments/", {
            "request_key": str(uuid4()),
            "date": timezone.localdate().isoformat(), "amount": "308.00",
        }, format="json")
        self.assertEqual(paid.status_code, 200, paid.data)
        day = timezone.localdate().isoformat()
        worksheet = f"/api/v1/finance/bas-worksheet/?start={day}&end={day}&basis=cash"
        before = client.get(worksheet)
        self.assertEqual(before.status_code, 200, before.data)
        self.assertEqual(Decimal(before.data["G1"]), Decimal("308.00"))
        self.assertEqual(Decimal(before.data["1A"]), Decimal("28.00"))

        revised = save_draft(self.worker, {**record.payload, "version": 1, "notes": "Corrected notes"}, record.pk)
        self.assertEqual(revised.status, "draft")
        after = client.get(worksheet)
        self.assertEqual(after.data["G1"], before.data["G1"])
        self.assertEqual(after.data["1A"], before.data["1A"])
        self.assertEqual(Decimal(client_for(self.owner).get(worksheet).data["G1"]), 0)
        self.assertEqual(Decimal(client.get(worksheet.replace("basis=cash", "basis=accrual")).data["G1"]), 0)

    @patch("worker_finance.documents.render_pdf", return_value=b"%PDF-test")
    def test_finishing_old_email_does_not_publish_a_new_saved_revision(self, _render):
        draft = internal_invoice_prefill(self.worker, [self.assignment.id])
        record = save_draft(self.worker, draft)

        def save_during_send(**kwargs):
            save_draft(self.worker, {**record.payload, "version": 1, "notes": "Unsent revision"}, record.pk)
            return 1

        request = APIRequestFactory().post("/finance/invoices/send/", {"version": 1, "confirmed": True}, format="json")
        force_authenticate(request, user=self.worker)
        with patch("worker_finance.views.EmailMessage.send", side_effect=save_during_send):
            response = InvoiceViewSet.as_view({"post": "send"})(request, pk=record.pk)
        self.assertEqual(response.status_code, 200, response.data)
        record.refresh_from_db()
        self.assertEqual(record.version, 2)
        self.assertEqual(record.status, "draft")
        self.assertEqual(record.deliveries.get(version=1).status, "sent")
        self.assertEqual(record.revisions.get(version=1).invoice_status, "sent")
        self.assertEqual(record.revisions.get(version=2).invoice_status, "draft")
        self.assertEqual(owner_visible_document(record)["version"], 1)
        self.assertNotEqual(owner_visible_document(record)["payload"]["notes"], "Unsent revision")

    @patch("worker_finance.documents.render_pdf", return_value=b"%PDF-test")
    @patch("worker_finance.views.EmailMessage.send", return_value=1)
    def test_finishing_current_email_publishes_that_revision(self, _send, _render):
        record = save_draft(self.worker, internal_invoice_prefill(self.worker, [self.assignment.id]))
        request = APIRequestFactory().post("/finance/invoices/send/", {"version": 1, "confirmed": True}, format="json")
        force_authenticate(request, user=self.worker)
        response = InvoiceViewSet.as_view({"post": "send"})(request, pk=record.pk)
        self.assertEqual(response.status_code, 200, response.data)
        record.refresh_from_db()
        self.assertEqual(record.status, "sent")
        self.assertEqual(record.revisions.get(version=1).invoice_status, "sent")
        self.assertEqual(owner_visible_document(record)["version"], 1)

    def test_internal_invoice_recipient_override_is_invoice_only_and_keeps_pharmacy_provenance(self):
        draft = internal_invoice_prefill(self.worker, [self.assignment.id])
        original_email = draft["customer"]["email"]
        original_address = draft["customer"]["address"]
        draft["customer"] = {
            **draft["customer"],
            "email": "invoice-only@example.invalid",
            "address": "Accounts PO Box 99",
            "contact_name": "Accounts Team",
        }

        record = save_draft(self.worker, draft)
        record.refresh_from_db()
        record.customer.refresh_from_db()

        self.assertEqual(record.payload["customer"]["email"], "invoice-only@example.invalid")
        self.assertEqual(record.payload["customer"]["address"], "Accounts PO Box 99")
        self.assertEqual(record.bill_to_email, "invoice-only@example.invalid")
        self.assertEqual(record.custom_bill_to_address, "Accounts PO Box 99")
        self.assertEqual(record.customer.email, original_email)
        self.assertEqual(record.customer.address, original_address)
        self.assertEqual(record.source_snapshot["version"], 3)
        self.assertEqual(record.source_snapshot["pharmacy"]["id"], self.pharmacy.id)
        self.assertEqual(record.source_snapshot["pharmacy"]["abn"], self.pharmacy.abn)

    def test_owner_payment_approval_is_snapshotted_on_exact_sent_revision(self):
        draft = internal_invoice_prefill(self.worker, [self.assignment.id])
        record = save_draft(self.worker, draft)
        Delivery.objects.create(
            invoice=record,
            version=record.version,
            recipient=self.owner.email,
            status="sent",
            sent_at=timezone.now(),
        )
        record.status = "sent"
        record.save(update_fields=["status"])

        factory = APIRequestFactory()
        request = factory.post(
            f"/finance/received-invoices/{record.id}/approve-payment/",
            {"version": record.version, "note": "Approved after checking the shift."},
            format="json",
        )
        force_authenticate(request, user=self.owner)
        response = ReceivedInvoiceViewSet.as_view({"post": "approve_payment"})(request, pk=record.id)

        self.assertEqual(response.status_code, 200, response.data)
        revision = InvoiceRevision.objects.get(invoice=record, version=1)
        self.assertEqual(revision.review_status, "APPROVED_FOR_PAYMENT")
        self.assertEqual(response.data["last_review_note"], "Approved after checking the shift.")

    def test_owner_can_read_migrated_snapshot_without_new_delivery_row(self):
        record = save_draft(self.worker, internal_invoice_prefill(self.worker, [self.assignment.id]))
        # A migrated paid snapshot is listed only through the legacy rule; an unsent legacy edit is not
        # (LegacySnapshotEditVisibilityTests).
        record.legacy_snapshot = True
        record.status = "paid"
        record.save(update_fields=["legacy_snapshot", "status"])

        request = APIRequestFactory().get("/finance/received-invoices/")
        force_authenticate(request, user=self.owner)
        response = ReceivedInvoiceViewSet.as_view({"get": "list"})(request)

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data["count"], 1)
        self.assertEqual(response.data["results"][0]["id"], record.id)
        self.assertEqual(response.data["results"][0]["version"], record.version)

    def test_finance_revision_visibility_requires_current_successful_delivery(self):
        draft = internal_invoice_prefill(self.worker, [self.assignment.id])
        record = save_draft(self.worker, draft)
        self.assertEqual(InvoiceSerializer(record).data["finance_record_id"], record.id)

        delivery = Delivery.objects.create(
            invoice=record,
            version=record.version,
            recipient=self.owner.email,
            status="failed",
        )
        factory = APIRequestFactory()

        received_request = factory.get("/finance/received-invoices/")
        force_authenticate(received_request, user=self.owner)
        received = ReceivedInvoiceViewSet.as_view({"get": "list"})(received_request)
        self.assertEqual(received.status_code, 200)
        self.assertEqual(received.data["count"], 0)

        legacy_request = factory.get(f"/invoices/{record.pk}/")
        force_authenticate(legacy_request, user=self.owner)
        legacy = InvoiceDetailView.as_view()(legacy_request, pk=record.pk)
        self.assertEqual(legacy.status_code, 404)

        delivery.status = "sent"
        delivery.sent_at = timezone.now()
        delivery.save(update_fields=["status", "sent_at"])

        received_request = factory.get("/finance/received-invoices/")
        force_authenticate(received_request, user=self.owner)
        received = ReceivedInvoiceViewSet.as_view({"get": "list"})(received_request)
        self.assertEqual(received.data["count"], 1)

        legacy_request = factory.get(f"/invoices/{record.pk}/")
        force_authenticate(legacy_request, user=self.owner)
        legacy = InvoiceDetailView.as_view()(legacy_request, pk=record.pk)
        self.assertEqual(legacy.status_code, 200)

        payload = dict(record.payload)
        payload["version"] = record.version
        payload["notes"] = "Saved correction not sent yet"
        revised = save_draft(self.worker, payload, record.id)
        self.assertEqual(revised.version, 2)
        self.assertEqual(revised.status, "draft")

        received_request = factory.get("/finance/received-invoices/")
        force_authenticate(received_request, user=self.owner)
        received = ReceivedInvoiceViewSet.as_view({"get": "list"})(received_request)
        self.assertEqual(received.data["count"], 1)
        visible = received.data["results"][0]
        self.assertEqual(visible["version"], 1)
        self.assertEqual(visible["current_version"], 2)
        self.assertFalse(visible["is_current"])
        self.assertTrue(visible["has_unsent_revision"])
        self.assertEqual([row["version"] for row in visible["revisions"]], [1])

        detail_request = factory.get(f"/finance/received-invoices/{record.id}/")
        force_authenticate(detail_request, user=self.owner)
        detail = ReceivedInvoiceViewSet.as_view({"get": "retrieve"})(detail_request, pk=record.id)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["version"], 1)
        self.assertNotIn(2, [row["version"] for row in detail.data["revisions"]])

        revision_request = factory.get(f"/finance/received-invoices/{record.id}/revisions/1/")
        force_authenticate(revision_request, user=self.owner)
        revision = ReceivedInvoiceViewSet.as_view({"get": "revision"})(revision_request, pk=record.id, version="1")
        self.assertEqual(revision.status_code, 200)
        self.assertEqual(revision.data["version"], 1)
        self.assertTrue(revision.data["has_unsent_revision"])
        self.assertEqual([row["version"] for row in revision.data["revisions"]], [1])

        hidden_revision_request = factory.get(
            f"/finance/received-invoices/{record.id}/revisions/2/"
        )
        force_authenticate(hidden_revision_request, user=self.owner)
        hidden_revision = ReceivedInvoiceViewSet.as_view({"get": "revision"})(
            hidden_revision_request,
            pk=record.id,
            version="2",
        )
        self.assertEqual(hidden_revision.status_code, 404)

        legacy_request = factory.get(f"/invoices/{record.pk}/")
        force_authenticate(legacy_request, user=self.owner)
        legacy = InvoiceDetailView.as_view()(legacy_request, pk=record.pk)
        self.assertEqual(legacy.status_code, 404)

        worker_request = factory.get(f"/invoices/{record.pk}/")
        force_authenticate(worker_request, user=self.worker)
        worker_view = InvoiceDetailView.as_view()(worker_request, pk=record.pk)
        self.assertEqual(worker_view.status_code, 200)

    @patch("worker_finance.documents.render_document_pdf", return_value=b"%PDF-issued-v1")
    def test_legacy_delivery_progress_preserves_issued_history_without_publishing_new_draft(self, render_pdf):
        record = self._generate()
        original_payload = deepcopy(record.payload)
        original_calculation = deepcopy(record.calculation)
        issued = Delivery.objects.create(
            invoice=record, version=1, recipient=self.owner.email, status="legacy_queued",
        )
        record.status = "sent"
        record.save(update_fields=["status"])
        private_note = "Private correction awaiting publication"
        saved = client_for(self.worker).patch(
            f"/api/v1/finance/invoices/{record.pk}/",
            {**deepcopy(record.payload), "version": 1, "notes": private_note},
            format="json",
        )
        self.assertEqual(saved.status_code, 200, saved.data)
        record.refresh_from_db()
        self.assertEqual((record.version, record.status), (2, "draft"))
        pending = Delivery.objects.create(
            invoice=record, version=2, recipient=self.owner.email, status="preparing",
        )
        owner = client_for(self.owner)
        collection = "/api/v1/finance/received-invoices/"
        detail_url = f"{collection}{record.pk}/"

        # These are independently specified public/private workflow examples;
        # importing the production status constant would hide a classification bug.
        for published_state in ("legacy_queued", "legacy_sending", "legacy_uncertain", "legacy_failed"):
            Delivery.objects.filter(pk=issued.pk).update(status=published_state)
            for private_state in ("preparing", "sending", "uncertain", "queue_uncertain"):
                with self.subTest(published=published_state, private=private_state):
                    Delivery.objects.filter(pk=pending.pk).update(status=private_state)
                    listed = owner.get(collection)
                    self.assertEqual(listed.status_code, 200, listed.data)
                    self.assertEqual(listed.data["count"], 1)
                    self.assertEqual(listed.data["results"][0]["version"], 1)

                    for path in (detail_url, detail_url + "revisions/1/"):
                        visible = owner.get(path)
                        self.assertEqual(visible.status_code, 200, visible.data)
                        self.assertEqual((visible.data["version"], visible.data["current_version"]), (1, 2))
                        self.assertFalse(visible.data["is_current"])
                        self.assertTrue(visible.data["has_unsent_revision"])
                        self.assertEqual([row["version"] for row in visible.data["revisions"]], [1])
                        self.assertEqual(visible.data["payload"], original_payload)
                        self.assertEqual(visible.data["calculation"], original_calculation)

                    render_pdf.reset_mock()
                    for path in (detail_url + "pdf/", detail_url + "revisions/1/pdf/"):
                        pdf = owner.get(path)
                        self.assertEqual(pdf.status_code, 200, pdf.content[:100])
                        self.assertEqual(pdf.content, b"%PDF-issued-v1")
                        rendered = render_pdf.call_args.args[0]
                        self.assertEqual(rendered["version"], 1)
                        self.assertEqual(rendered["payload"], original_payload)
                        self.assertEqual(rendered["calculation"], original_calculation)
                    self.assertEqual(render_pdf.call_count, 2)

                    self.assertEqual(owner.get(detail_url + "revisions/2/").status_code, 404)
                    self.assertEqual(owner.get(detail_url + "revisions/2/pdf/").status_code, 404)
                    self.assertEqual(render_pdf.call_count, 2)
                    denied = owner.post(detail_url + "approve-payment/", {"version": 2}, format="json")
                    self.assertEqual(denied.status_code, 400, denied.data)
                    self.assertIn("version", denied.data)
                    self.assertFalse(Invoice.objects.filter(manager_visible_state(), pk=record.pk).exists())
                    record.refresh_from_db()
                    self.assertEqual((record.version, record.status, record.review_status), (2, "draft", "NONE"))
                    self.assertEqual(record.payload["notes"], private_note)
                    self.assertEqual(record.revisions.get(version=1).payload, original_payload)

    def test_owner_can_request_revision_and_worker_save_resolves_request(self):
        draft = internal_invoice_prefill(self.worker, [self.assignment.id])
        record = save_draft(self.worker, draft)
        record.status = "sent"
        record.save(update_fields=["status"])

        factory = APIRequestFactory()
        request = factory.post(
            f"/finance/received-invoices/{record.id}/request-revision/",
            {"version": record.version, "note": "Please use the actual 7.5 hours worked."},
            format="json",
        )
        force_authenticate(request, user=self.owner)
        response = ReceivedInvoiceViewSet.as_view({"post": "request_revision"})(request, pk=record.id)
        self.assertEqual(response.status_code, 200, response.data)
        record.refresh_from_db()
        self.assertEqual(record.review_status, "REVISION_REQUESTED")
        self.assertTrue(
            Notification.objects.filter(
                user=self.worker,
                payload__kind="invoice_revision_requested",
            ).exists()
        )

        payload = dict(record.payload)
        payload["version"] = record.version
        payload["lines"] = [
            {**line, "quantity": "7.50"}
            if line.get("source_assignment_id")
            else line
            for line in payload["lines"]
        ]
        revised = save_draft(self.worker, payload, record.id)
        request_row = revised.review_requests.get()
        self.assertIsNotNone(request_row.resolved_at)
        self.assertEqual(request_row.resolved_by_version, revised.version)
        self.assertEqual(revised.review_status, "NONE")
        self.assertEqual(revised.status, "draft")

    def owner_call(self, method, action, record, path="", data=None, **kwargs):
        request = getattr(APIRequestFactory(), method)(f"/finance/received-invoices/{record.id}/{path}", data,
                                                       format="json")
        force_authenticate(request, user=self.owner)
        return ReceivedInvoiceViewSet.as_view({method: action})(request, pk=record.id, **kwargs)

    def sent_then_edited(self, *, legacy=False, request_revision=False):
        record = save_draft(self.worker, internal_invoice_prefill(self.worker, [self.assignment.id]))
        Delivery.objects.create(invoice=record, version=1, recipient=self.owner.email, status="sent",
                                sent_at=timezone.now())
        record.status, record.legacy_snapshot = "sent", legacy
        record.save(update_fields=["status", "legacy_snapshot"])
        self.assertEqual(self.owner_call("get", "retrieve", record).data["version"], 1)
        if request_revision:
            response = self.owner_call("post", "request_revision", record, "request-revision/",
                                       {"version": 1, "note": "Fix the hours."})
            self.assertEqual(response.status_code, 200, response.data)
        record.refresh_from_db()
        payload = dict(record.payload, version=record.version, notes="Unsent correction")
        return save_draft(self.worker, payload, record.id)

    def assert_owner_sees_only_sent_version(self, record):
        self.assertEqual((record.version, record.status), (2, "draft"))
        detail = self.owner_call("get", "retrieve", record)
        self.assertEqual(detail.status_code, 200)
        self.assertEqual(detail.data["version"], 1)
        self.assertNotEqual(detail.data["payload"].get("notes"), "Unsent correction")
        self.assertEqual(self.owner_call("get", "revision_pdf", record, "revisions/2/pdf/", version="2").status_code,
                         404)
        response = self.owner_call("post", "approve_payment", record, "approve-payment/", {"version": 2})
        self.assertEqual(response.status_code, 400)
        self.assertIn("version", response.data)

    def test_unsent_edit_of_sent_legacy_snapshot_stays_hidden_from_the_pharmacy(self):
        self.assert_owner_sees_only_sent_version(self.sent_then_edited(legacy=True))

    def test_marking_an_unsent_edit_of_a_legacy_snapshot_paid_keeps_it_hidden(self):
        record = self.sent_then_edited(legacy=True)
        request = APIRequestFactory().post(f"/finance/invoices/{record.pk}/mark-paid/", {"version": record.version},
                                           format="json")
        force_authenticate(request, user=self.worker)
        self.assertEqual(InvoiceViewSet.as_view({"post": "mark_paid"})(request, pk=record.pk).status_code, 200)
        record.refresh_from_db()
        self.assertEqual((record.version, record.status), (2, "paid"))
        detail = self.owner_call("get", "retrieve", record)
        self.assertEqual(detail.data["version"], 1)
        self.assertNotEqual(detail.data["payload"].get("notes"), "Unsent correction")
        self.assertEqual(self.owner_call("get", "revision_pdf", record, "revisions/2/pdf/", version="2").status_code,
                         404)
        self.assertFalse(Invoice.objects.filter(manager_visible_state(), pk=record.pk).exists())  # dashboards

    def test_unsent_edit_after_revision_request_stays_hidden_from_the_pharmacy(self):
        self.assert_owner_sees_only_sent_version(self.sent_then_edited(request_revision=True))

    def test_owner_review_actions_return_only_delivered_revisions(self):
        for action, path in (("request_revision", "request-revision/"), ("approve_payment", "approve-payment/"),
                             ("mark_paid", "mark-paid/")):
            with self.subTest(action=action):
                InvoiceRevision.objects.all().delete()
                Invoice.objects.all().delete()
                record = self.sent_then_edited()
                payload = dict(record.payload, version=record.version, notes="Second correction")
                record = save_draft(self.worker, payload, record.id)
                Delivery.objects.create(invoice=record, version=3, recipient=self.owner.email, status="sent",
                                        sent_at=timezone.now())
                record.status = "sent"
                record.save(update_fields=["status"])
                response = self.owner_call("post", action, record, path,
                                           {"version": 3, "note": "Checked", "fund_payment_confirmed": True})
                self.assertEqual(response.status_code, 200, response.data)
                self.assertEqual(response.data["version"], 3)
                self.assertEqual([row["version"] for row in response.data["revisions"]], [3, 1])
                self.assertEqual(response.data, self.owner_call("get", "retrieve", record).data)

    def test_owner_review_action_rejects_stale_invoice_version(self):
        draft = internal_invoice_prefill(self.worker, [self.assignment.id])
        record = save_draft(self.worker, draft)
        Delivery.objects.create(
            invoice=record,
            version=record.version,
            recipient=self.owner.email,
            status="sent",
            sent_at=timezone.now(),
        )
        record.status = "sent"
        record.save(update_fields=["status"])

        payload = dict(record.payload)
        payload["version"] = record.version
        payload["notes"] = "Worker saved a newer correction"
        revised = save_draft(self.worker, payload, record.id)
        self.assertEqual(revised.version, 2)

        factory = APIRequestFactory()
        request = factory.post(
            f"/finance/received-invoices/{record.id}/request-revision/",
            {"version": 1, "note": "This action came from a stale owner screen."},
            format="json",
        )
        force_authenticate(request, user=self.owner)
        response = ReceivedInvoiceViewSet.as_view({"post": "request_revision"})(request, pk=record.id)

        self.assertEqual(response.status_code, 400)
        revised.refresh_from_db()
        self.assertEqual(revised.review_status, "NONE")
        self.assertFalse(revised.review_requests.exists())

        unsent_request = factory.post(
            f"/finance/received-invoices/{record.id}/approve-payment/",
            {"version": 2, "note": "Attempt to approve an unsent revision."},
            format="json",
        )
        force_authenticate(unsent_request, user=self.owner)
        unsent_response = ReceivedInvoiceViewSet.as_view({"post": "approve_payment"})(
            unsent_request,
            pk=record.id,
        )
        self.assertEqual(unsent_response.status_code, 400)
        revised.refresh_from_db()
        self.assertEqual(revised.review_status, "NONE")
        self.assertEqual(revised.status, "draft")

    def test_generated_half_cent_total_agrees_across_api_revision_and_pdfs(self):
        import fitz
        from invoicing.services import render_invoice_to_pdf
        from worker_finance.documents import render_pdf

        self.slot.end_time = time(16, 30)
        self.slot.save(update_fields=["end_time"])
        self.assignment.unit_rate = Decimal("70.03")
        self.assignment.engagement_terms_snapshot = {
            **self.assignment.engagement_terms_snapshot,
            "gst_registered": False,
            "occurrences": [{
                "slot_id": self.slot.pk,
                "date": str(self.slot.date),
                "start_time": "09:00:00",
                "end_time": "16:30:00",
                "agreed_rate": "70.03",
            }],
        }
        self.assignment.save(update_fields=["unit_rate", "engagement_terms_snapshot"])
        original_terms = deepcopy(self.assignment.engagement_terms_snapshot)
        original_acceptance = self.assignment.engagement_terms_accepted_at

        preview = client_for(self.worker).get(f"/api/v1/invoices/preview/{self.shift.pk}/")
        self.assertEqual(preview.status_code, 200, preview.data)
        [preview_line] = preview.data
        self.assertEqual(Decimal(str(preview_line["total"])), Decimal("525.23"))

        data = {
            "gst_registered": False,
            "super_rate_snapshot": "0.00",
            # Internal professional lines must still come from the accepted assignment.
            "line_items": [{
                "category_code": "ProfessionalServices",
                "assignmentId": self.assignment.pk,
                "quantity": "99.00",
                "unit_price": "999.00",
                "total": "0.01",
            }],
        }
        response = self._generate_via_api(**data)
        self.assertEqual(response.status_code, 201, response.data)
        invoice = Invoice.objects.get(pk=response.data["id"])
        line = invoice.line_items.get(category_code="ProfessionalServices")
        self.assertEqual(invoice.line_items.count(), 1)
        self.assertEqual(line.source_assignment_id, self.assignment.pk)
        self.assertEqual(line.quantity, Decimal("7.50"))
        self.assertEqual(line.unit_price, Decimal("70.03"))
        self.assertEqual(invoice.gst_amount, Decimal("0.00"))
        self.assertEqual(invoice.super_amount, Decimal("0.00"))
        self.assertEqual((invoice.version, invoice.status), (1, "draft"))
        self.assertEqual(invoice.revisions.count(), 1)
        revision = invoice.revisions.get(version=1)
        self.assertEqual(revision.invoice_status, "draft")
        self.assertEqual(revision.calculation, invoice.calculation)
        self.assertEqual(revision.payload, invoice.payload)
        self.assertEqual(revision.source_snapshot, invoice.source_snapshot)
        self.assertEqual(invoice.source_snapshot["accepted_terms"][0]["terms"], original_terms)

        amounts = {
            "response line": response.data["line_items"][0]["total"],
            "response payable": response.data["total"],
            "persisted line": line.total,
            "canonical subtotal": invoice.subtotal,
            "canonical payable": invoice.total,
            "finance line": invoice.calculation["lines"][0]["net"],
            "finance subtotal": invoice.calculation["subtotal"],
            "finance payable": invoice.calculation["payable"],
            "initial revision line": revision.calculation["lines"][0]["net"],
            "initial revision payable": revision.calculation["payable"],
        }
        for representation, amount in amounts.items():
            with self.subTest(representation=representation):
                self.assertEqual(Decimal(str(amount)), Decimal("525.23"))

        for representation, render in (("legacy", render_invoice_to_pdf), ("finance", render_pdf)):
            with self.subTest(pdf=representation):
                pdf = render(invoice)
                self.assertTrue(pdf.startswith(b"%PDF-"))
                with fitz.open(stream=pdf, filetype="pdf") as document:
                    self.assertGreaterEqual(document.page_count, 1)
                    text = "\n".join(page.get_text() for page in document)
                self.assertIn("525.23", text)
                self.assertNotIn("525.22", text)

        duplicate = self._generate_via_api(**data)
        self.assertEqual(duplicate.status_code, 400, duplicate.data)
        self.assertIn("shift_ids", duplicate.data)
        self.assertEqual(Invoice.objects.count(), 1)
        self.assertEqual(InvoiceRevision.objects.count(), 1)
        self.assertEqual(InvoiceLineItem.objects.filter(source_assignment=self.assignment).count(), 1)
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.engagement_terms_snapshot, original_terms)
        self.assertEqual(self.assignment.engagement_terms_accepted_at, original_acceptance)
        self.assertEqual(self.assignment.unit_rate, Decimal("70.03"))

    def test_adopted_manual_line_matches_finance_and_external_rounding_stays_unchanged(self):
        # Managed internal invoices use their finance result; unmanaged external
        # invoices retain the compatibility calculation. Neither trusts a total.
        for external, category, line_total, payable in (
            (False, "Transportation", "4.55", "564.55"),
            (True, "ProfessionalServices", "4.54", "4.54"),
        ):
            with self.subTest(external=external):
                response = self._generate_via_api(
                    external=external,
                    shift_ids=[] if external else [self.shift.pk],
                    gst_registered=False,
                    super_rate_snapshot="0.00",
                    custom_bill_to_name="External test customer" if external else "",
                    line_items=[{
                        "description": "Manual half-cent control",
                        "category_code": category,
                        "quantity": "1.50",
                        "unit_price": "3.03",
                        "discount": "0.00",
                        "total": "999.00",
                        "gst_applicable": False,
                        "super_applicable": False,
                    }],
                )
                self.assertEqual(response.status_code, 201, response.data)
                invoice = Invoice.objects.get(pk=response.data["id"])
                line = invoice.line_items.get(description="Manual half-cent control")
                self.assertIsNone(line.source_assignment_id)
                self.assertTrue(line.is_manual)
                self.assertTrue(line.was_modified)
                if external:
                    self.assertIsNone(invoice.request_key)
                    self.assertFalse(invoice.revisions.exists())
                    self.assertEqual(invoice.total, Decimal(payable))
                else:
                    invoice = self._assert_generated_amounts(
                        response, subtotal=payable, gst="0.00", payable=payable,
                    )
                    calculated = next(row for row in invoice.calculation["lines"] if row["category_code"] == category)
                    self.assertEqual(calculated["net"], line_total)
                self.assertEqual(line.total, Decimal(line_total))

    def test_adopted_gst_rounding_agrees_across_saved_representations_and_pdfs(self):
        import fitz
        from invoicing.services import render_invoice_to_pdf
        from worker_finance.documents import render_pdf
        from worker_finance.services import adopt_internal_invoice

        for rate, count, subtotal, gst, payable in (
            ("70.05", 1, "70.05", "7.01", "77.06"),
            ("70.06", 2, "140.12", "14.02", "154.14"),
            ("70.04", 2, "140.08", "14.00", "154.08"),
        ):
            with self.subTest(rate=rate, count=count):
                shift = Shift.objects.create(
                    pharmacy=self.pharmacy, created_by=self.owner,
                    role_needed="ASSISTANT", employment_type="LOCUM",
                )
                assignments = []
                for offset in range(count):
                    slot = ShiftSlot.objects.create(
                        shift=shift, date=self.slot.date + timedelta(days=offset),
                        start_time=time(9), end_time=time(10),
                    )
                    assignments.append(ShiftSlotAssignment.objects.create(
                        shift=shift, slot=slot, slot_date=slot.date, user=self.worker,
                        unit_rate=rate, settlement_channel="INVOICE",
                        engagement_kind="INDEPENDENT_CONTRACTOR",
                        engagement_terms_accepted_at=self.assignment.engagement_terms_accepted_at,
                        engagement_terms_snapshot={
                            "gst_registered": True, "super_payable_confirmed": False,
                            "occurrences": [{"slot_id": slot.pk, "date": str(slot.date),
                                             "start_time": "09:00:00", "end_time": "10:00:00",
                                             "agreed_rate": rate}],
                        },
                    ))
                original_terms = [(row.pk, deepcopy(row.engagement_terms_snapshot), row.engagement_terms_accepted_at)
                                  for row in assignments]
                before = {}
                preserved_fields = (
                    "issuer_first_name", "issuer_last_name", "issuer_email", "issuer_abn",
                    "bill_to_first_name", "bill_to_last_name", "bill_to_email", "cc_emails",
                    "custom_bill_to_name", "custom_bill_to_address", "pharmacy_id",
                    "pharmacy_name_snapshot", "pharmacy_address_snapshot", "pharmacy_abn_snapshot",
                    "source_snapshot", "due_date", "bank_account_name", "bsb", "account_number",
                )
                line_fields = (
                    "id", "source_assignment_id", "shift_id", "description", "category_code",
                    "unit", "quantity", "unit_price", "discount", "is_manual", "was_modified",
                    "gst_applicable", "super_applicable",
                )

                def observe_adoption(owner, invoice):
                    before["invoice"] = Invoice.objects.filter(pk=invoice.pk).values(*preserved_fields).get()
                    before["lines"] = list(invoice.line_items.order_by("id").values(*line_fields))
                    return adopt_internal_invoice(owner, invoice)

                with patch("worker_finance.invoice_bridge.adopt_generated_internal_invoice", side_effect=observe_adoption):
                    response = self._generate_via_api(shift_ids=[shift.pk], cc_emails="accounts@example.test")
                self.assertEqual(response.status_code, 201, response.data)
                invoice = Invoice.objects.get(pk=response.data["id"])
                self.assertEqual(Invoice.objects.filter(pk=invoice.pk).values(*preserved_fields).get(), before["invoice"])
                self.assertEqual(list(invoice.line_items.order_by("id").values(*line_fields)), before["lines"])
                self.assertFalse(invoice.line_items.filter(was_modified=True).exists())
                self.assertEqual(list(invoice.line_items.order_by("id").values_list("total", flat=True)),
                                 [Decimal(rate)] * count)
                for assignment_id, terms, accepted_at in original_terms:
                    assignment = ShiftSlotAssignment.objects.get(pk=assignment_id)
                    self.assertEqual(assignment.engagement_terms_snapshot, terms)
                    self.assertEqual(assignment.engagement_terms_accepted_at, accepted_at)
                invoice = self._assert_generated_amounts(
                    response, subtotal=subtotal, gst=gst, payable=payable,
                )
                if rate == "70.06":
                    for name, renderer in (("legacy", render_invoice_to_pdf), ("finance", render_pdf)):
                        with self.subTest(pdf=name):
                            pdf = renderer(invoice)
                            self.assertTrue(pdf.startswith(b"%PDF-"))
                            with fitz.open(stream=pdf, filetype="pdf") as document:
                                text = "\n".join(page.get_text() for page in document)
                            self.assertIn("154.14", text)
                            self.assertIn("14.02", text)
                            self.assertNotIn("154.13", text)

    def test_adopted_discounted_extra_uses_the_saved_finance_amount(self):
        response = self._generate_via_api(gst_registered=False, line_items=[{
            "description": "Discounted accommodation", "category_code": "Accommodation",
            "quantity": "1.00", "unit_price": "9.09", "discount": "50.00",
            "total": "999.00", "gst_applicable": False, "super_applicable": False,
        }])
        invoice = self._assert_generated_amounts(response, subtotal="564.55", gst="0.00", payable="564.55")
        row = invoice.line_items.get(category_code="Accommodation")
        self.assertEqual((row.total, row.discount), (Decimal("4.55"), Decimal("50.00")))
        self.assertTrue(row.is_manual and row.was_modified)
        self.assertIsNone(row.source_assignment_id)
        self.assertEqual(next(line for line in invoice.calculation["lines"]
                              if line["category_code"] == "Accommodation")["net"], "4.55")

    def test_adopted_manual_super_rounding_stays_separate_from_worker_payable(self):
        response = self._generate_via_api(gst_registered=False, line_items=[{
            "description": "Explicit contribution", "category_code": "Superannuation",
            "quantity": "1.50", "unit_price": "3.03", "discount": "0.00",
            "gst_applicable": False, "super_applicable": False,
        }])
        invoice = self._assert_generated_amounts(
            response, subtotal="560.00", gst="0.00", payable="560.00", super_amount="4.55",
        )
        row = invoice.line_items.get(category_code="Superannuation")
        self.assertEqual(row.total, Decimal("4.55"))
        self.assertTrue(row.is_manual and row.was_modified)
        self.assertFalse(row.gst_applicable or row.super_applicable)
        self.assertEqual(invoice.calculation["automatic_super"], "0.00")
        self.assertEqual(invoice.payload["super_mode"], "summary")

    def test_adopted_generated_super_keeps_the_existing_fixed_contribution(self):
        self.slot.end_time = time(10)
        self.slot.save(update_fields=["end_time"])
        self.assignment.engagement_terms_snapshot["super_payable_confirmed"] = True
        self.assignment.save(update_fields=["engagement_terms_snapshot"])
        original_terms = deepcopy(self.assignment.engagement_terms_snapshot)
        response = self._generate_via_api(gst_registered=False, line_items=[{
            "description": "Eligible transport", "category_code": "Transportation",
            "quantity": "1.50", "unit_price": "3.03", "discount": "0.00",
            "gst_applicable": False, "super_applicable": True,
        }])
        # Existing generation fixes 12% of 74.54 at 8.94 before adoption.
        # Projecting the rounded 74.55 service subtotal must not recalculate it as 8.95.
        invoice = self._assert_generated_amounts(
            response, subtotal="74.55", gst="0.00", payable="74.55", super_amount="8.94",
        )
        row = invoice.line_items.get(category_code="Superannuation")
        self.assertEqual((row.quantity, row.unit_price, row.total),
                         (Decimal("1.00"), Decimal("8.94"), Decimal("8.94")))
        self.assertTrue(row.is_manual)
        self.assertFalse(row.was_modified or row.gst_applicable or row.super_applicable)
        self.assertEqual(invoice.line_items.get(category_code="Transportation").total, Decimal("4.55"))
        self.assertEqual(invoice.calculation["automatic_super"], "0.00")
        self.assignment.refresh_from_db()
        self.assertEqual(self.assignment.engagement_terms_snapshot, original_terms)

    def test_adoption_does_not_recalculate_existing_managed_or_imported_invoices(self):
        from worker_finance.services import adopt_internal_invoice

        invoice = self._generate()
        for imported in (False, True):
            with self.subTest(legacy_snapshot=imported):
                # The migration marker selects the same managed-record early return;
                # this preservation test does not replay the historical migration.
                Invoice.objects.filter(pk=invoice.pk).update(legacy_snapshot=imported, status="sent")
                invoice.refresh_from_db()
                before = Invoice.objects.filter(pk=invoice.pk).values().get()
                lines = list(invoice.line_items.order_by("id").values())
                revisions = list(invoice.revisions.order_by("version").values())
                with patch("worker_finance.services.calculate_invoice", side_effect=AssertionError("Existing invoice recalculated")):
                    returned = adopt_internal_invoice(self.worker, invoice)
                self.assertEqual(returned.pk, invoice.pk)
                self.assertEqual(Invoice.objects.filter(pk=invoice.pk).values().get(), before)
                self.assertEqual(list(invoice.line_items.order_by("id").values()), lines)
                self.assertEqual(list(invoice.revisions.order_by("version").values()), revisions)

    def test_generated_invoice_rolls_back_if_finance_adoption_fails_then_can_retry(self):
        from rest_framework.exceptions import ValidationError as FinanceValidationError

        with patch(
            "worker_finance.invoice_bridge.adopt_generated_internal_invoice",
            side_effect=FinanceValidationError("Adoption rejected for this regression."),
        ):
            response = self._generate_via_api()
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn("finance_workspace", response.data)
        self.assertEqual(Invoice.objects.count(), 0)
        self.assertEqual(InvoiceLineItem.objects.count(), 0)
        self.assertEqual(InvoiceRevision.objects.count(), 0)

        retry = self._generate_via_api()
        self.assertEqual(retry.status_code, 201, retry.data)
        self.assertEqual(Invoice.objects.count(), 1)
        self.assertEqual(InvoiceRevision.objects.count(), 1)
        self.assertEqual(InvoiceLineItem.objects.filter(source_assignment=self.assignment).count(), 1)

    def test_partial_hour_invoice_uses_same_precision_for_quantity_and_total(self):
        self.slot.end_time = time(16, 37)
        self.slot.save(update_fields=["end_time"])

        invoice = self._generate()
        line = invoice.line_items.get(category_code="ProfessionalServices")

        self.assertEqual(line.quantity, Decimal("7.62"))
        self.assertEqual(line.unit_price, Decimal("70.00"))
        self.assertEqual(line.total, Decimal("533.40"))
        self.assertEqual(invoice.subtotal, Decimal("533.40"))
        self.assertEqual(invoice.gst_amount, Decimal("53.34"))
        self.assertEqual(invoice.total, Decimal("586.74"))
        self.assertEqual(invoice.calculation["payable"], "586.74")

    def test_same_accepted_assignment_cannot_be_invoiced_twice(self):
        first = self._generate()
        with self.assertRaises(ValidationError):
            self._generate()
        self.assertEqual(
            InvoiceLineItem.objects.filter(
                source_assignment=self.assignment,
                category_code="ProfessionalServices",
            ).count(),
            1,
        )
        self.assertEqual(first.source_snapshot["assignment_ids"], [self.assignment.id])

    def test_explicit_manual_super_line_is_the_canonical_super_amount(self):
        invoice = self._generate(custom_lines=[{
            "description": "Superannuation after contractor SG review",
            "category_code": "Superannuation",
            "unit": "Lump Sum",
            "quantity": "1.00",
            "unit_price": "67.20",
            "discount": "0",
            "gst_applicable": False,
            "super_applicable": False,
        }])
        super_line = invoice.line_items.get(category_code="Superannuation")

        self.assertTrue(super_line.was_modified)
        self.assertEqual(invoice.subtotal, Decimal("560.00"))
        self.assertEqual(invoice.gst_amount, Decimal("56.00"))
        self.assertEqual(invoice.super_amount, Decimal("67.20"))
        self.assertEqual(invoice.total, Decimal("616.00"))

    def test_editing_internal_invoice_preserves_locked_professional_line(self):
        invoice = self._generate()
        protected = invoice.line_items.get(category_code="ProfessionalServices")

        serializer = InvoiceSerializer(
            instance=invoice,
            data={
                "line_items": [
                    {
                        "description": "Attempted replacement",
                        "category_code": "ProfessionalServices",
                        "unit": "Hours",
                        "quantity": "1.00",
                        "unit_price": "1.00",
                        "discount": "0",
                        "gst_applicable": True,
                        "super_applicable": False,
                        "is_manual": True,
                    },
                    {
                        "description": "Travel reimbursement",
                        "category_code": "Transportation",
                        "unit": "Lump Sum",
                        "quantity": "1.00",
                        "unit_price": "50.00",
                        "discount": "0",
                        "gst_applicable": False,
                        "super_applicable": False,
                        "is_manual": True,
                    },
                ]
            },
            partial=True,
        )
        self.assertTrue(serializer.is_valid(), serializer.errors)
        updated = serializer.save()

        protected.refresh_from_db()
        self.assertEqual(protected.source_assignment_id, self.assignment.id)
        self.assertEqual(protected.total, Decimal("560.00"))
        self.assertEqual(
            updated.line_items.filter(
                category_code="ProfessionalServices",
                source_assignment=self.assignment,
            ).count(),
            1,
        )
        self.assertEqual(
            updated.line_items.get(category_code="Transportation").total,
            Decimal("50.00"),
        )
        self.assertEqual(updated.subtotal, Decimal("610.00"))
        self.assertEqual(updated.gst_amount, Decimal("56.00"))
        self.assertEqual(updated.total, Decimal("666.00"))


    def test_legacy_send_records_current_revision_without_locking_future_edits(self):
        invoice = self._generate()
        invoice.bill_to_email = self.owner.email
        invoice.save(update_fields=["bill_to_email"])
        record = invoice
        factory = APIRequestFactory()

        def request():
            req = factory.post(f"/invoices/{invoice.id}/send/", {}, format="json")
            force_authenticate(req, user=self.worker)
            return req

        with patch("invoicing.views.render_invoice_to_pdf", return_value=b"%PDF-test"), patch(
            "invoicing.tasks.async_task"
        ) as enqueue, self.captureOnCommitCallbacks(execute=True):
            first = send_invoice_email(request(), invoice.id)
            second = send_invoice_email(request(), invoice.id)

        self.assertEqual(first.status_code, 200)
        self.assertEqual(second.status_code, 409)
        self.assertEqual(enqueue.call_count, 1)

        invoice.refresh_from_db()
        record.refresh_from_db()
        self.assertEqual(invoice.status, "sent")
        self.assertIsNone(record.locked_at)
        self.assertEqual(InvoiceRevision.objects.get(invoice=record, version=record.version).invoice_status, "sent")
        delivery = Delivery.objects.get(invoice=record, version=record.version)
        self.assertEqual(delivery.recipient, self.owner.email)
        self.assertEqual(delivery.status, "legacy_queued")

    def test_legacy_editor_cannot_bypass_new_workspace_revision_history(self):
        invoice = self._generate()

        factory = APIRequestFactory()
        request = factory.patch(
            f"/invoices/{invoice.id}/",
            {"cc_emails": "changed@example.com"},
            format="json",
        )
        force_authenticate(request, user=self.worker)
        response = InvoiceDetailView.as_view()(request, pk=invoice.id)

        self.assertEqual(response.status_code, 403)
        invoice.refresh_from_db()
        self.assertEqual(invoice.cc_emails, "")

    def test_legacy_status_patch_cannot_bypass_finance_send_or_review_actions(self):
        invoice = self._generate()
        record = invoice
        factory = APIRequestFactory()

        worker_request = factory.patch(
            f"/invoices/{invoice.id}/",
            {"status": "sent"},
            format="json",
        )
        force_authenticate(worker_request, user=self.worker)
        worker_response = InvoiceDetailView.as_view()(worker_request, pk=invoice.id)
        self.assertEqual(worker_response.status_code, 403)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, "draft")
        self.assertFalse(record.deliveries.exists())

        Delivery.objects.create(
            invoice=record,
            version=record.version,
            recipient=self.owner.email,
            status="sent",
            sent_at=timezone.now(),
        )
        invoice.status = "sent"
        invoice.save(update_fields=["status"])

        owner_request = factory.patch(
            f"/invoices/{invoice.id}/",
            {"status": "paid"},
            format="json",
        )
        force_authenticate(owner_request, user=self.owner)
        owner_response = InvoiceDetailView.as_view()(owner_request, pk=invoice.id)
        self.assertEqual(owner_response.status_code, 403)
        invoice.refresh_from_db()
        self.assertEqual(invoice.status, "sent")

    def test_new_finance_workspace_can_correct_shift_values_but_preserves_source_identity(self):
        invoice = self._generate()
        record = invoice
        original_snapshot = dict(invoice.source_snapshot)
        travel = CatalogueItem.objects.create(
            owner=self.worker,
            code="TRAVEL-EDIT",
            name="Travel reimbursement",
            category="Transportation",
            unit="Lump Sum",
            unit_price="0.00",
            tax_code="OUT_OF_SCOPE",
            super_eligible=False,
        )
        payload = dict(record.payload)
        payload["version"] = record.version
        payload["lines"] = [
            {
                **line,
                "description": "Corrected actual shift",
                "quantity": "7.50",
                "unit_price": "75.00",
            }
            if line.get("source_assignment_id")
            else line
            for line in payload["lines"]
        ]
        payload["lines"].append({
            "item_id": travel.id,
            "description": "Travel reimbursement",
            "category_code": "Transportation",
            "unit": "Lump Sum",
            "quantity": "1.00",
            "unit_price": "50.00",
            "discount": "0.00",
            "tax_code": "OUT_OF_SCOPE",
            "super_eligible": False,
            "worked_on": str(self.slot.date),
        })

        updated = save_draft(self.worker, payload, record.id)
        invoice.refresh_from_db()
        source_line = invoice.line_items.get(source_assignment=self.assignment)
        self.assertEqual(source_line.quantity, Decimal("7.50"))
        self.assertEqual(source_line.unit_price, Decimal("75.00"))
        self.assertEqual(source_line.total, Decimal("562.50"))
        self.assertEqual(invoice.source_snapshot, original_snapshot)
        self.assertEqual(updated.version, 2)
        self.assertEqual(updated.status, "draft")
        self.assertEqual(InvoiceRevision.objects.filter(invoice=updated).count(), 2)


class InvoiceGenerationPreviewIntegrityTests(TestCase):
    """The retained generator previews its actual saved route without reserving work."""

    # Reuse the established accepted-assignment fixture without inheriting its tests.
    setUp = AcceptedShiftInvoiceIntegrityTests.setUp
    _billing_data = AcceptedShiftInvoiceIntegrityTests._billing_data
    _generate_via_api = AcceptedShiftInvoiceIntegrityTests._generate_via_api

    def _financial_payload(self, **overrides):
        return {
            "external": False, "pharmacy": self.pharmacy.pk,
            "shift_ids": [self.shift.pk], "line_items": [],
            "gst_registered": True, "super_rate_snapshot": "12.00",
            **overrides,
        }

    def _accepted_terms(self, *, rate="70.00", gst=True, super_eligible=False):
        self.assignment.unit_rate = Decimal(rate)
        self.assignment.engagement_terms_snapshot = {
            "gst_registered": gst, "super_review_required": True,
            "super_payable_confirmed": super_eligible,
            "occurrences": [{
                "slot_id": self.slot.pk, "date": str(self.slot.date),
                "start_time": "09:00:00", "end_time": "10:00:00", "agreed_rate": rate,
            }],
        }
        self.assignment.save(update_fields=["unit_rate", "engagement_terms_snapshot"])

    def _custom_line(self, **overrides):
        return {
            "description": "Reviewed extra", "category_code": "Transportation", "unit": "Hours",
            "quantity": "1.50", "unit_price": "3.03", "discount": "0.00", "total": "999.00",
            "gst_applicable": False, "super_applicable": False,
            **overrides,
        }

    def _preview(self, payload, *, actor=None, anonymous=False, expected_status=200, raw_json=False):
        models = (Invoice, InvoiceLineItem, Customer, CatalogueItem, InvoiceRevision, Delivery, Notification)
        counts = [model.objects.count() for model in models]
        assignments = list(ShiftSlotAssignment.objects.order_by("pk").values())
        client = client_for(None if anonymous else (actor or self.worker))
        client.raise_request_exception = False
        with (
            self.captureOnCommitCallbacks(execute=True) as callbacks,
            CaptureQueriesContext(connection) as captured,
            patch("celery.app.task.Task.apply_async") as apply_async,
            patch("celery.app.base.Celery.send_task") as send_task,
            patch("django.core.mail.message.EmailMessage.send") as send_email,
        ):
            options = {"content_type": "application/json"} if raw_json else {"format": "json"}
            response = client.post("/api/v1/invoices/generate/preview/", payload, **options)
        detail = getattr(response, "data", response.content[:300])
        if isinstance(expected_status, tuple):
            self.assertIn(response.status_code, expected_status, detail)
        else:
            self.assertEqual(response.status_code, expected_status, detail)
        self.assertEqual([model.objects.count() for model in models], counts)
        self.assertEqual(list(ShiftSlotAssignment.objects.order_by("pk").values()), assignments)
        writes = [query["sql"] for query in captured.captured_queries
                  if query["sql"].lstrip().split(" ", 1)[0].upper() in {"INSERT", "UPDATE", "DELETE"}]
        self.assertEqual(writes, [], "Preview must not create temporary records and roll them back either.")
        self.assertEqual(callbacks, [])
        apply_async.assert_not_called()
        send_task.assert_not_called()
        send_email.assert_not_called()
        return response

    def _assert_preview_matches_generation(self, payload, *, subtotal, gst, total, super_amount="0.00"):
        preview = self._preview(payload).data
        expected = {"subtotal": subtotal, "gst_amount": gst, "super_amount": super_amount, "total": total}
        for field, amount in expected.items():
            self.assertIsInstance(preview[field], str)
            self.assertEqual(preview[field], amount)
        response = self._generate_via_api(**payload)
        self.assertEqual(response.status_code, 201, response.data)
        invoice = Invoice.objects.get(pk=response.data["id"])
        lines = list(invoice.line_items.order_by("id"))
        returned_lines = {row["id"]: row for row in response.data["line_items"]}
        self.assertEqual(set(returned_lines), {line.pk for line in lines})
        self.assertEqual(len(preview["line_items"]), len(lines))
        for projected, saved in zip(preview["line_items"], lines, strict=True):
            self.assertEqual(projected["category_code"], saved.category_code)
            self.assertEqual(projected["description"], saved.description)
            self.assertEqual(projected["gst_applicable"], saved.gst_applicable)
            self.assertEqual(projected["super_applicable"], saved.super_applicable)
            for field in ("quantity", "unit_price", "discount", "total"):
                self.assertIsInstance(projected[field], str)
                self.assertEqual(Decimal(projected[field]), getattr(saved, field), (field, projected))
                self.assertEqual(Decimal(str(returned_lines[saved.pk][field])), Decimal(projected[field]))
        for field, amount in expected.items():
            self.assertEqual(Decimal(str(response.data[field])), Decimal(amount))
            self.assertEqual(getattr(invoice, field), Decimal(amount))
        if invoice.external:
            self.assertIsNone(invoice.request_key)
            self.assertEqual(invoice.revisions.count(), 0)
        else:
            self.assertIsNotNone(invoice.request_key)
            revision = invoice.revisions.get(version=1)
            self.assertEqual(invoice.version, 1)
            self.assertEqual(revision.calculation, invoice.calculation)
            self.assertEqual(revision.payload, invoice.payload)
            self.assertEqual(revision.source_snapshot, invoice.source_snapshot)
            for field, key in (("subtotal", "subtotal"), ("gst_amount", "gst"),
                               ("super_amount", "super"), ("total", "payable")):
                self.assertEqual(Decimal(revision.calculation[key]), Decimal(preview[field]))
            self.assertEqual([Decimal(line["net"]) for line in revision.calculation["lines"]],
                             [line.total for line in lines])
        return preview, invoice

    def test_preview_preserves_internal_and_external_half_cent_rounding(self):
        self._accepted_terms(gst=False)
        for external, line_total, payable in ((False, "4.55", "74.55"), (True, "4.54", "4.54")):
            with self.subTest(external=external):
                payload = self._financial_payload(
                    external=external, shift_ids=[] if external else [self.shift.pk], gst_registered=False,
                    line_items=[self._custom_line(category_code="ProfessionalServices" if external else "Transportation")],
                )
                preview, invoice = self._assert_preview_matches_generation(
                    payload, subtotal=payable, gst="0.00", total=payable,
                )
                custom = next(row for row in preview["line_items"] if row["origin"] == "custom")
                self.assertEqual((custom["custom_index"], custom["total"]), (0, line_total))
                self.assertEqual(invoice.line_items.get(description="Reviewed extra").total, Decimal(line_total))

    def test_preview_preserves_internal_per_line_and_external_aggregate_gst(self):
        self._accepted_terms(rate="70.06")
        slot = ShiftSlot.objects.create(
            shift=self.shift, date=self.slot.date + timedelta(days=1), start_time=time(9), end_time=time(10),
        )
        terms = deepcopy(self.assignment.engagement_terms_snapshot)
        terms["occurrences"][0].update(slot_id=slot.pk, date=str(slot.date))
        ShiftSlotAssignment.objects.create(
            shift=self.shift, slot=slot, slot_date=slot.date, user=self.worker, unit_rate="70.06",
            settlement_channel="INVOICE", engagement_kind="INDEPENDENT_CONTRACTOR",
            engagement_terms_accepted_at=self.assignment.engagement_terms_accepted_at,
            engagement_terms_snapshot=terms,
        )
        for external, gst, total in ((False, "14.02", "154.14"), (True, "14.01", "154.13")):
            with self.subTest(external=external):
                payload = self._financial_payload(external=external, shift_ids=[] if external else [self.shift.pk])
                if external:
                    payload["line_items"] = [self._custom_line(
                        description=f"External service {index}", category_code="ProfessionalServices",
                        quantity="1.00", unit_price="70.06", gst_applicable=True,
                    ) for index in range(2)]
                self._assert_preview_matches_generation(payload, subtotal="140.12", gst=gst, total=total)

    def test_preview_preserves_the_materialized_super_before_internal_adoption(self):
        self._accepted_terms(gst=False, super_eligible=True)
        payload = self._financial_payload(gst_registered=False, line_items=[self._custom_line(super_applicable=True)])
        preview, invoice = self._assert_preview_matches_generation(
            payload, subtotal="74.55", gst="0.00", total="74.55", super_amount="8.94",
        )
        [contribution] = [row for row in preview["line_items"] if row["origin"] == "generated_super"]
        self.assertEqual((contribution["category_code"], contribution["total"]), ("Superannuation", "8.94"))
        self.assertIsNone(contribution.get("custom_index"))
        saved = invoice.line_items.get(category_code="Superannuation")
        self.assertTrue(saved.is_manual)
        self.assertFalse(saved.was_modified or saved.gst_applicable or saved.super_applicable)
        self.assertEqual(invoice.calculation["automatic_super"], "0.00")

    def test_preview_keeps_accepted_false_flags_and_ignores_forged_professional_inputs(self):
        self._accepted_terms(gst=False, super_eligible=False)
        accepted = deepcopy(self.assignment.engagement_terms_snapshot)
        payload = self._financial_payload(line_items=[{
            "category_code": "ProfessionalServices", "assignmentId": self.assignment.pk,
            "quantity": "NaN", "unit_price": "not a decimal", "discount": True,
            "gst_applicable": True, "super_applicable": True, "locked": False, "was_modified": True,
        }, self._custom_line(quantity="1.00", unit_price="10.00")])
        preview, invoice = self._assert_preview_matches_generation(
            payload, subtotal="80.00", gst="0.00", total="80.00",
        )
        [source] = [row for row in preview["line_items"] if row["origin"] == "assignment"]
        self.assertEqual((source["assignmentId"], source["shiftId"], source["shiftSlotId"]),
                         (self.assignment.pk, self.shift.pk, self.slot.pk))
        self.assertEqual((source["date"], source["start_time"], source["end_time"]),
                         (str(self.slot.date), "09:00:00", "10:00:00"))
        self.assertEqual(source["id"], f"{self.shift.pk}-{self.slot.pk}-{self.slot.date}")
        self.assertEqual(source["rate_reason"], {
            "source": "AcceptedShiftTerms", "assignment_id": self.assignment.pk,
            "offer_id": self.assignment.source_offer_id, "settlement_channel": "INVOICE",
        })
        self.assertEqual((Decimal(source["quantity"]), Decimal(source["unit_price"])),
                         (Decimal("1.00"), Decimal("70.00")))
        self.assertTrue(source["locked"])
        self.assertFalse(source["gst_applicable"] or source["super_applicable"] or source["was_modified"])
        [custom] = [row for row in preview["line_items"] if row["origin"] == "custom"]
        self.assertEqual(custom["custom_index"], 1, "Indices refer to submitted rows, including ignored source rows.")
        self.assertEqual(invoice.source_snapshot["accepted_terms"][0]["terms"], accepted)
        self.assertFalse(invoice.line_items.filter(category_code="Superannuation").exists())

    def test_preview_respects_explicit_invoice_gst_false_without_rewriting_accepted_flags(self):
        self._accepted_terms(rate="70.05", gst=True)
        preview, invoice = self._assert_preview_matches_generation(
            self._financial_payload(gst_registered=False), subtotal="70.05", gst="0.00", total="70.05",
        )
        self.assertTrue(preview["line_items"][0]["gst_applicable"])
        self.assertFalse(invoice.gst_registered)
        self.assertTrue(invoice.source_snapshot["accepted_terms"][0]["terms"]["gst_registered"])
        self.assertTrue(OtherStaffOnboarding.objects.get(user=self.worker).gst_registered)

    def test_preview_manual_super_replaces_generated_super_and_stays_out_of_payable(self):
        self._accepted_terms(gst=False, super_eligible=True)
        payload = self._financial_payload(gst_registered=False, line_items=[self._custom_line(
            category_code="Superannuation", description="Worker entered contribution", was_modified=False,
        )])
        preview, invoice = self._assert_preview_matches_generation(
            payload, subtotal="70.00", gst="0.00", total="70.00", super_amount="4.55",
        )
        self.assertFalse(any(row["origin"] == "generated_super" for row in preview["line_items"]))
        [contribution] = [row for row in preview["line_items"] if row["category_code"] == "Superannuation"]
        self.assertEqual((contribution["origin"], contribution["custom_index"]), ("custom", 0))
        saved = invoice.line_items.get(category_code="Superannuation")
        self.assertTrue(saved.was_modified and saved.is_manual)
        self.assertEqual(invoice.calculation["automatic_super"], "0.00")

    def test_preview_applies_discount_before_each_routes_existing_rounding(self):
        self._accepted_terms(gst=False)
        for external, subtotal in ((False, "74.55"), (True, "4.54")):
            with self.subTest(external=external):
                payload = self._financial_payload(
                    external=external, shift_ids=[] if external else [self.shift.pk], gst_registered=False,
                    line_items=[self._custom_line(
                        category_code="Accommodation", quantity="1.00", unit_price="9.09", discount="50.00",
                    )],
                )
                self._assert_preview_matches_generation(payload, subtotal=subtotal, gst="0.00", total=subtotal)

    def test_preview_requires_authentication_and_a_worker_issuer_profile(self):
        payload = self._financial_payload(external=True, shift_ids=[], line_items=[self._custom_line()])
        self._preview(payload, anonymous=True, expected_status=(401, 403))
        response = self._preview(payload, actor=self.owner, expected_status=400)
        self.assertIn("issuer", response.data)

    def test_preview_rejects_foreign_pharmacy_worker_unaccepted_and_payroll_sources(self):
        payload = self._financial_payload()
        other = User.objects.create_user(email="preview-other@example.com", password="test-pass", role="OTHER_STAFF")
        OtherStaffOnboarding.objects.create(user=other, role_type="ASSISTANT", payment_preference="ABN", abn="51824753556")
        response = self._preview(payload, actor=other, expected_status=400)
        self.assertIn("shift_ids", response.data)
        pharmacy = Pharmacy.objects.create(name="Other preview pharmacy", owner=self.owner_onboarding)
        response = self._preview({**payload, "pharmacy": pharmacy.pk}, expected_status=400)
        self.assertIn("pharmacy", response.data)
        response = self._preview({**payload, "shift_ids": [self.shift.pk + 100000]}, expected_status=400)
        self.assertIn("shift_ids", response.data)
        accepted_at = self.assignment.engagement_terms_accepted_at
        for changes in ({"engagement_terms_accepted_at": None}, {"settlement_channel": "PAYROLL"},
                        {"settlement_channel": "TIMESHEET_ONLY"}):
            with self.subTest(changes=changes):
                ShiftSlotAssignment.objects.filter(pk=self.assignment.pk).update(
                    engagement_terms_accepted_at=accepted_at, settlement_channel="INVOICE",
                )
                ShiftSlotAssignment.objects.filter(pk=self.assignment.pk).update(**changes)
                response = self._preview(payload, expected_status=400)
                self.assertIn("shift_ids", response.data)

    def test_generation_revalidates_after_preview_and_preview_does_not_reserve_assignment(self):
        self._accepted_terms(gst=False)
        payload = self._financial_payload(gst_registered=False)
        self._preview(payload)
        accepted_at = self.assignment.engagement_terms_accepted_at
        ShiftSlotAssignment.objects.filter(pk=self.assignment.pk).update(engagement_terms_accepted_at=None)
        rejected = self._generate_via_api(**payload)
        self.assertEqual(rejected.status_code, 400, rejected.data)
        self.assertIn("shift_ids", rejected.data)
        self.assertFalse(Invoice.objects.exists())
        self.assertFalse(InvoiceRevision.objects.exists())
        ShiftSlotAssignment.objects.filter(pk=self.assignment.pk).update(engagement_terms_accepted_at=accepted_at)
        response = self._generate_via_api(**payload)
        self.assertEqual(response.status_code, 201, response.data)
        # Another creation may win after a successful preview; neither preview
        # nor its result replaces generation's locked duplicate/source checks.
        self._preview(payload, expected_status=400)
        duplicate = self._generate_via_api(**payload)
        self.assertEqual(duplicate.status_code, 400, duplicate.data)
        self.assertEqual(Invoice.objects.count(), 1)
        self.assertEqual(InvoiceRevision.objects.count(), 1)
        self.assertEqual(InvoiceLineItem.objects.filter(source_assignment=self.assignment).count(), 1)

    def test_preview_normalizes_model_boolean_values_and_equivalent_decimal_zeroes(self):
        for false_value in (False, "False", "0", 0):
            with self.subTest(false_value=false_value):
                payload = self._financial_payload(
                    external=True, shift_ids=[], super_rate_snapshot="12.000",
                    line_items=[self._custom_line(
                        quantity="1.000", unit_price="70.0500", discount="0.000",
                        gst_applicable=false_value, super_applicable=false_value,
                    )],
                )
                preview, _ = self._assert_preview_matches_generation(
                    payload, subtotal="70.05", gst="0.00", total="70.05",
                )
                self.assertIs(preview["line_items"][0]["gst_applicable"], False)
                self.assertIs(preview["line_items"][0]["super_applicable"], False)

    def test_preview_accepts_serialized_form_lists_and_finite_json_numbers(self):
        payload = self._financial_payload(
            external="true", pharmacy=None, shift_ids="[]", gst_registered="false", super_rate_snapshot=0,
            line_items=json.dumps([self._custom_line(quantity=1.5, unit_price=3.03, discount=0)]),
        )
        self._assert_preview_matches_generation(payload, subtotal="4.54", gst="0.00", total="4.54")

    def test_preview_preserves_external_zero_and_negative_line_compatibility(self):
        for quantity, total in (("0.00", "0.00"), ("-1.00", "-2.50")):
            with self.subTest(quantity=quantity):
                payload = self._financial_payload(
                    external=True, shift_ids=[], gst_registered=False, super_rate_snapshot="0.00",
                    line_items=[self._custom_line(quantity=quantity, unit_price="2.50")],
                )
                self._assert_preview_matches_generation(payload, subtotal=total, gst="0.00", total=total)

    def test_preview_rejects_malformed_collections_and_invalid_line_booleans_cleanly(self):
        for changes in (
            {"line_items": "[broken"}, {"line_items": {"quantity": "1.00"}}, {"line_items": [None]},
            {"shift_ids": "[broken"}, {"shift_ids": {"id": self.shift.pk}},
            {"line_items": [self._custom_line(gst_applicable="false")]},
        ):
            with self.subTest(changes=changes):
                self._preview(self._financial_payload(**changes), expected_status=400)

    def test_preview_rejects_non_finite_overprecision_and_unrepresentable_decimal_values(self):
        bad_lines = (
            ("quantity", "NaN"), ("quantity", "Infinity"), ("quantity", "-Infinity"),
            ("quantity", "1.001"), ("quantity", "10000.00"), ("quantity", True), ("quantity", None),
            ("unit_price", "NaN"), ("unit_price", "1.001"), ("unit_price", "100000000.00"),
            ("unit_price", "1e999"), ("discount", "NaN"), ("discount", "0.001"), ("discount", "1000.00"),
        )
        for field, value in bad_lines:
            with self.subTest(field=field, value=value):
                payload = self._financial_payload(
                    external=True, shift_ids=[], line_items=[self._custom_line(**{field: value})],
                )
                self._preview(payload, expected_status=400)
        for value in ("NaN", "Infinity", "12.001", "1000.00", True):
            with self.subTest(super_rate_snapshot=value):
                self._preview(self._financial_payload(super_rate_snapshot=value), expected_status=400)

    def test_preview_rejects_raw_json_pharmacy_exponent_overflow_without_writes(self):
        # A valid JSON number can overflow float parsing without an Infinity token.
        raw = ('{"external": false, "pharmacy": 1e309, "shift_ids": [%d], "line_items": [], '
               '"gst_registered": false, "super_rate_snapshot": "12.00"}'
               % self.shift.pk)
        response = self._preview(raw, expected_status=400, raw_json=True)
        self.assertIn("shift_ids", response.data)

    def test_preview_rejects_raw_json_custom_assignment_overflow_without_writes(self):
        self._accepted_terms(gst=False)
        for external in (False, True):
            for alias in ("assignmentId", "assignment_id"):
                with self.subTest(external=external, alias=alias):
                    payload = self._financial_payload(
                        external=external, shift_ids=[] if external else [self.shift.pk],
                        gst_registered=False, line_items=[self._custom_line(**{alias: "OVERFLOW"})],
                    )
                    raw = json.dumps(payload).replace('"OVERFLOW"', "1e309")
                    response = self._preview(raw, expected_status=400, raw_json=True)
                    self.assertEqual(response.data, {
                        "line_items": ["cannot convert float infinity to integer"],
                    })

        # The established internal route ignores submitted professional rows
        # before validating their values or identifiers and rebuilds its own.
        ignored = self._financial_payload(
            gst_registered=False, line_items=[self._custom_line(
                category_code="ProfessionalServices", assignmentId="OVERFLOW", assignment_id="OVERFLOW",
                shiftId="OVERFLOW", id="OVERFLOW", quantity="OVERFLOW", unit_price="OVERFLOW",
            )],
        )
        response = self._preview(json.dumps(ignored).replace('"OVERFLOW"', "1e309"), raw_json=True)
        [accepted] = response.data["line_items"]
        self.assertEqual((accepted["origin"], accepted["assignmentId"], accepted["total"]),
                         ("assignment", self.assignment.pk, "70.00"))

    def test_preview_omits_untrusted_custom_metadata_from_rendered_response(self):
        self._accepted_terms(gst=False)
        metadata = {name: "OVERFLOW" for name in (
            "id", "shiftId", "shift_id", "shiftSlotId", "date", "start_time", "end_time",
        )}
        metadata["rate_reason"] = {"untrusted": ["OVERFLOW"]}
        for external in (False, True):
            for name, value in metadata.items():
                with self.subTest(external=external, field=name):
                    payload = self._financial_payload(
                        external=external, shift_ids=[] if external else [self.shift.pk],
                        gst_registered=False, line_items=[self._custom_line(**{name: value})],
                    )
                    raw = json.dumps(payload).replace('"OVERFLOW"', "1e309")
                    response = self._preview(raw, raw_json=True)
                    rendered = json.loads(response.content)
                    [custom] = [row for row in rendered["line_items"] if row["origin"] == "custom"]
                    self.assertEqual(custom, {
                        "origin": "custom", "custom_index": 0,
                        "description": "Reviewed extra", "category_code": "Transportation", "unit": "Hours",
                        "quantity": "1.50", "unit_price": "3.03", "discount": "0.00",
                        "total": "4.54" if external else "4.55",
                        "gst_applicable": False, "super_applicable": False,
                        "is_manual": True, "was_modified": True, "locked": False,
                    })

    def test_preview_custom_identity_cannot_impersonate_accepted_source_metadata(self):
        self._accepted_terms(gst=False)
        for external, subtotal in ((False, "74.55"), (True, "4.54")):
            with self.subTest(external=external):
                payload = self._financial_payload(
                    external=external, shift_ids=[] if external else [self.shift.pk], gst_registered=False,
                    line_items=[self._custom_line(
                        origin="assignment", custom_index=99, locked=True, was_modified=False,
                        id="forged", assignmentId=self.assignment.pk, shiftId=self.shift.pk,
                        shiftSlotId=self.slot.pk, date="1900-01-01", start_time="00:00:00",
                        end_time="01:00:00", rate_reason={"source": "forged"},
                    )],
                )
                preview, _ = self._assert_preview_matches_generation(
                    payload, subtotal=subtotal, gst="0.00", total=subtotal,
                )
                [custom] = [row for row in preview["line_items"] if row["origin"] == "custom"]
                self.assertEqual(custom["custom_index"], 0)
                self.assertFalse(custom["locked"])
                self.assertTrue(custom["is_manual"] and custom["was_modified"])
                for name in ("id", "assignmentId", "shiftId", "shiftSlotId", "date", "start_time",
                             "end_time", "rate_reason"):
                    self.assertNotIn(name, custom)

    def test_preview_overprecision_refusal_does_not_change_legacy_generation_acceptance(self):
        payload = self._financial_payload(
            external=True, shift_ids=[], gst_registered=False, super_rate_snapshot="0.00",
            line_items=[self._custom_line(quantity="1.001", unit_price="10.00")],
        )
        self._preview(payload, expected_status=400)
        response = self._generate_via_api(**payload)
        self.assertEqual(response.status_code, 201, response.data)
        invoice = Invoice.objects.get(pk=response.data["id"])
        [line] = invoice.line_items.all()
        self.assertEqual((line.quantity, line.total, invoice.total),
                         (Decimal("1.00"), Decimal("10.01"), Decimal("10.01")))
        self.assertIsNone(invoice.request_key)


class LegacyInvoiceRecalculationPreservationTests(TestCase):
    """Shared preview arithmetic must preserve legacy serializer mutations."""

    def setUp(self):
        self.worker = User.objects.create_user(email="legacy-recalc@example.com", role="OTHER_STAFF")

    def _line(self, **overrides):
        return {
            "description": "Legacy service", "category_code": "ProfessionalServices", "unit": "Hours",
            "quantity": "1.00", "unit_price": "70.06", "discount": "0.00",
            "gst_applicable": True, "super_applicable": True, **overrides,
        }

    def _create(self):
        serializer = InvoiceSerializer(data={
            "external": True, "gst_registered": True, "super_rate_snapshot": "12.00",
            "line_items": [self._line(), self._line()],
        })
        self.assertTrue(serializer.is_valid(), serializer.errors)
        return serializer.save(user=self.worker)

    def _update(self, invoice, **data):
        serializer = InvoiceSerializer(invoice, data=data, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        return serializer.save()

    def _amounts(self, invoice, *, subtotal="140.12", gst="14.01", super_amount="16.81", total="154.13"):
        invoice.refresh_from_db()
        self.assertEqual(
            (invoice.subtotal, invoice.gst_amount, invoice.super_amount, invoice.total),
            tuple(Decimal(value) for value in (subtotal, gst, super_amount, total)),
        )
        self.assertIsNone(invoice.request_key)
        self.assertFalse(invoice.revisions.exists())

    def _generated(self, invoice, **overrides):
        return InvoiceLineItem.objects.create(
            invoice=invoice, **{
                "description": "Stale generated contribution", "category_code": "Superannuation",
                "unit": "Lump Sum", "quantity": Decimal("1.00"), "unit_price": Decimal("99.00"),
                "discount": Decimal("0.00"), "total": Decimal("99.00"),
                "gst_applicable": False, "super_applicable": False,
                "is_manual": True, "was_modified": False, **overrides,
            },
        )

    def test_serializer_create_and_header_edits_preserve_generated_super_lifecycle(self):
        invoice = self._create()
        self._amounts(invoice)
        primary = invoice.line_items.get(category_code="Superannuation")
        self.assertEqual((primary.unit, primary.total, primary.is_manual, primary.was_modified),
                         ("Lump Sum", Decimal("16.81"), True, False))
        InvoiceLineItem.objects.filter(pk=primary.pk).update(
            description="Stale", quantity=2, unit_price=1, discount=5, total=2,
            gst_applicable=True, super_applicable=True, is_manual=False,
        )
        duplicate = self._generated(invoice)

        self._update(invoice, super_rate_snapshot="10.00")
        self._amounts(invoice, super_amount="14.01")
        [updated] = invoice.line_items.filter(category_code="Superannuation")
        self.assertEqual(updated.pk, primary.pk)
        self.assertFalse(InvoiceLineItem.objects.filter(pk=duplicate.pk).exists())
        self.assertEqual(
            (updated.description, updated.quantity, updated.unit_price, updated.discount, updated.total,
             updated.gst_applicable, updated.super_applicable, updated.is_manual, updated.was_modified),
            ("Superannuation", Decimal("1.00"), Decimal("14.01"), Decimal("0.00"), Decimal("14.01"),
             False, False, True, False),
        )

        self._update(invoice, super_rate_snapshot="0.00")
        self._amounts(invoice, super_amount="0.00")
        self.assertFalse(invoice.line_items.filter(category_code="Superannuation").exists())

    def test_serializer_line_replacement_keeps_zero_manual_super_authoritative(self):
        invoice = self._create()
        old_ids = list(invoice.line_items.values_list("pk", flat=True))
        self._update(invoice, line_items=[
            self._line(unit_price="50.00", gst_applicable=False),
            self._line(category_code="Superannuation", description="Explicit zero contribution",
                       unit="Lump Sum", unit_price="0.00", gst_applicable=False, super_applicable=False),
        ])
        self._amounts(invoice, subtotal="50.00", gst="0.00", super_amount="0.00", total="50.00")
        self.assertFalse(InvoiceLineItem.objects.filter(pk__in=old_ids).exists())
        manual = invoice.line_items.get(category_code="Superannuation")
        self.assertEqual((manual.total, manual.is_manual, manual.was_modified), (Decimal("0.00"), True, True))

        # An explicit manual row wins even when automatic row creation is disabled.
        stale = self._generated(invoice)
        recalculate_invoice_totals(invoice, ensure_generated_super_line=False)
        self._amounts(invoice, subtotal="50.00", gst="0.00", super_amount="0.00", total="50.00")
        self.assertFalse(InvoiceLineItem.objects.filter(pk=stale.pk).exists())
        self.assertEqual(list(invoice.line_items.filter(category_code="Superannuation").values_list("pk", flat=True)), [manual.pk])

    def test_recalculate_without_generation_preserves_existing_rows_and_does_not_create_them(self):
        invoice = self._create()
        self._generated(invoice)
        before = list(invoice.line_items.order_by("pk").values())
        invoice.super_rate_snapshot = Decimal("10.00")
        invoice.save(update_fields=["super_rate_snapshot"])
        recalculate_invoice_totals(invoice, ensure_generated_super_line=False)
        self._amounts(invoice, super_amount="14.01")
        self.assertEqual(list(invoice.line_items.order_by("pk").values()), before)

        invoice.line_items.filter(category_code="Superannuation").delete()
        recalculate_invoice_totals(invoice, ensure_generated_super_line=False)
        self._amounts(invoice, super_amount="14.01")
        self.assertFalse(invoice.line_items.filter(category_code="Superannuation").exists())


class InvoiceIssuerProfileTests(TestCase):
    """Only workers issue invoices; other accounts get a clear 400, never a 500."""

    def _generate(self, user):
        from invoicing.views import GenerateInvoiceView
        request = APIRequestFactory().post("/api/v1/invoices/generate/", {
            "issuer_abn": "", "gst_registered": False, "super_rate_snapshot": "0",
            "bank_account_name": "Acceptance", "bsb": "000000", "account_number": "00000000",
            "bill_to_email": "billing@example.test", "cc_emails": "",
            "external": True, "shift_ids": "[]", "line_items": "[]",
        }, format="json")
        force_authenticate(request, user=user)
        return GenerateInvoiceView.as_view()(request)

    def test_accounts_without_a_worker_profile_get_a_clean_validation_error(self):
        owner = User.objects.create_user(email="issuer-owner@example.com", password="x", role="OWNER")
        OwnerOnboarding.objects.create(user=owner)
        org_staff = User.objects.create_user(email="issuer-org@example.com", password="x", role="ORG_STAFF")
        for user in (owner, org_staff):
            with self.subTest(role=user.role):
                response = self._generate(user)
                self.assertEqual(response.status_code, 400)
                self.assertIn("issuer", response.data)

    def test_service_raises_validation_error_not_does_not_exist(self):
        org_staff = User.objects.create_user(email="issuer-org-svc@example.com", password="x", role="ORG_STAFF")
        with self.assertRaises(ValidationError):
            generate_invoice_from_shifts(user=org_staff, pharmacy_id=None, shift_ids=[], custom_lines=[], external=True)


class InvoiceTenantIsolationContracts(TestCase):
    def setUp(self):
        self.owner_a, self.a = make_owner_with_pharmacy("PR200 A")
        self.owner_b, self.b = make_owner_with_pharmacy("PR200 B")
        self.outsider = make_user("PHARMACIST")
        self.day = date.today() + timedelta(days=21)

    def invoice_payload(self):
        return {
            "pharmacy": self.b.pk, "external": False, "status": "paid",
            "pharmacy_name_snapshot": self.b.name,
            "invoice_date": self.day.isoformat(),
            "line_items": [{
                "description": "Synthetic one-hour invoice",
                "category_code": "ProfessionalServices", "unit": "Hours",
                "quantity": "1.00", "unit_price": "65.00", "discount": "0",
                "gst_applicable": False, "super_applicable": False,
            }],
        }

    def test_b33_invoice_positive_control(self):
        response = client_for(self.owner_b).post(
            "/api/v1/invoices/", self.invoice_payload(), format="json",
        )
        self.assertEqual(response.status_code, 201, response.data)

    def test_b33_invoice_post_denies_foreign_pharmacy(self):
        client = client_for(self.outsider)
        client.raise_request_exception = False
        response = client.post(
            "/api/v1/invoices/", self.invoice_payload(), format="json",
        )
        self.assertIn(response.status_code, (400, 403, 404), response.data)
        self.assertFalse(
            Invoice.objects.filter(user=self.outsider, pharmacy=self.b).exists()
        )


class LegacySnapshotEditVisibilityTests(TestCase):
    def setUp(self):
        self.owner, self.pharmacy = make_owner_with_pharmacy("LegacyEdit")
        self.worker = make_user("PHARMACIST")

    def invoice(self, **changes):
        fields = dict(user=self.worker, pharmacy=self.pharmacy, source="internal", request_key=uuid4(), status="draft",
                      version=2, legacy_snapshot=True, payload={"invoice_date": timezone.localdate().isoformat()},
                      calculation={"payable": "999.00"})
        fields.update(changes)
        return Invoice.objects.create(**fields)

    def listed_ids(self, path):
        response = client_for(self.owner).get(path)
        self.assertEqual(response.status_code, 200, response.content)
        rows = response.data["results"] if isinstance(response.data, dict) else response.data
        return {row["id"] for row in rows}

    def test_unsent_edit_of_legacy_snapshot_is_hidden_from_the_pharmacy(self):
        record = self.invoice()
        for path in ("/api/v1/invoices/", "/api/v1/finance/received-invoices/"):
            with self.subTest(path=path):
                self.assertNotIn(record.pk, self.listed_ids(path))

    def test_paid_later_version_of_legacy_snapshot_is_hidden_from_the_pharmacy(self):
        record = self.invoice(status="paid")
        for path in ("/api/v1/invoices/", "/api/v1/finance/received-invoices/"):
            with self.subTest(path=path):
                self.assertNotIn(record.pk, self.listed_ids(path))
        self.assertFalse(Invoice.objects.filter(manager_visible_state(), pk=record.pk).exists())

    def test_sent_and_paid_legacy_snapshots_stay_listed(self):
        # The migrated revision is version 1; only it keeps the legacy exception.
        sent, paid = self.invoice(status="sent", version=1), self.invoice(status="paid", version=1)
        for path in ("/api/v1/invoices/", "/api/v1/finance/received-invoices/"):
            with self.subTest(path=path):
                self.assertTrue({sent.pk, paid.pk} <= self.listed_ids(path))
        self.assertEqual(set(Invoice.objects.filter(manager_visible_state()).values_list("pk", flat=True)),
                         {sent.pk, paid.pk})
        owner = client_for(self.owner)
        for record in (sent, paid):
            with self.subTest(record=record.status):
                detail = owner.get(f"/api/v1/finance/received-invoices/{record.pk}/")
                self.assertEqual((detail.status_code, detail.data["version"]), (200, 1))
                self.assertEqual(owner.get(f"/api/v1/finance/received-invoices/{record.pk}/pdf/").status_code, 200)

    def test_old_editor_draft_without_request_key_stays_listed(self):
        record = self.invoice(request_key=None, legacy_snapshot=False)
        self.assertIn(record.pk, self.listed_ids("/api/v1/invoices/"))
