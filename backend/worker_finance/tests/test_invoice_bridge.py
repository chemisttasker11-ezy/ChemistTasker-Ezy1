from unittest.mock import patch

from django.test import SimpleTestCase

from worker_finance.invoice_bridge import (
    adopt_generated_internal_invoice,
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
