from types import SimpleNamespace
from unittest.mock import Mock, patch

from django.test import SimpleTestCase

from worker_finance.invoice_bridge import (
    adopt_generated_internal_invoice,
    record_legacy_invoice_send,
)


class InvoiceBridgeTests(SimpleTestCase):
    @patch("worker_finance.services.adopt_internal_invoice")
    def test_adopt_generated_invoice_delegates_to_finance_workspace(self, adopt):
        owner = object()
        invoice = object()
        adopted = object()
        adopt.return_value = adopted

        self.assertIs(adopt_generated_internal_invoice(owner, invoice), adopted)
        adopt.assert_called_once_with(owner, invoice)

    @patch("worker_finance.services.record_revision_state")
    @patch("worker_finance.models.Delivery.objects.get_or_create")
    def test_legacy_send_records_delivery_and_revision(self, get_or_create, record_revision):
        record = SimpleNamespace(pk=5, request_key="request", version=3)
        record.refresh_from_db = Mock()
        manager = Mock()
        manager.select_for_update.return_value.get.return_value = record
        invoice_class = SimpleNamespace(objects=manager)
        invoice = SimpleNamespace(pk=5, __class__=invoice_class)

        # SimpleNamespace cannot override __class__; use a tiny dynamic type instead.
        class InvoiceStub:
            objects = manager

        invoice = InvoiceStub()
        invoice.pk = 5

        result = record_legacy_invoice_send(invoice, "owner@example.test")

        self.assertIs(result, record)
        get_or_create.assert_called_once_with(
            invoice=record,
            version=3,
            defaults={"recipient": "owner@example.test", "status": "legacy_queued"},
        )
        record.refresh_from_db.assert_called_once_with()
        record_revision.assert_called_once_with(record)

    @patch("worker_finance.models.Delivery.objects.get_or_create")
    def test_legacy_send_ignores_non_workspace_invoice(self, get_or_create):
        record = SimpleNamespace(pk=5, request_key=None, version=1)
        manager = Mock()
        manager.select_for_update.return_value.get.return_value = record

        class InvoiceStub:
            objects = manager

        invoice = InvoiceStub()
        invoice.pk = 5

        self.assertIs(record_legacy_invoice_send(invoice, "owner@example.test"), record)
        get_or_create.assert_not_called()
