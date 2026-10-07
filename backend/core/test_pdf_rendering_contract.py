"""Real PDF rendering contracts for the supported WeasyPrint runtime."""
from datetime import date
from decimal import Decimal
from types import SimpleNamespace

import fitz
from django.test import SimpleTestCase

from invoicing.services import render_invoice_to_pdf
from worker_finance.documents import render_document_pdf


class _LineItems(list):
    def all(self):
        return self

    def order_by(self, *_fields):
        return self


class PdfRenderingRuntimeContracts(SimpleTestCase):
    def assert_readable_pdf(self, payload, expected_text):
        self.assertTrue(payload.startswith(b"%PDF-"))
        document = fitz.open(stream=payload, filetype="pdf")
        try:
            self.assertGreaterEqual(document.page_count, 1)
            text = "\n".join(page.get_text() for page in document)
        finally:
            document.close()
        for value in expected_text:
            self.assertIn(value, text)

    def test_worker_finance_document_renders_with_supported_weasyprint(self):
        document = {
            "number": "CT-PDF-150",
            "locked": True,
            "kind": "invoice",
            "version": 1,
            "payload": {
                "gst_registered": True,
                "invoice_date": "2026-10-07",
                "due_date": "2026-10-14",
                "issuer_name": "Test Pharmacist",
                "issuer_abn": "51824753556",
                "issuer_address": "Gold Coast QLD",
                "customer": {
                    "name": "PDF Test Pharmacy",
                    "legal_name": "PDF Test Pharmacy Pty Ltd",
                    "abn": "12345678901",
                    "email": "accounts@example.test",
                    "address": "1 Test Street",
                },
                "reference": "PDF-SMOKE",
                "bank_account_name": "Test Pharmacist",
                "bsb": "123-456",
                "account_number": "12345678",
                "super_mode": "none",
                "super_fund_name": "",
                "super_usi": "",
                "super_member_number": "",
                "notes": "Runtime rendering contract",
                "price_mode": "exclusive",
            },
            "calculation": {
                "lines": [{
                    "description": "Professional service",
                    "worked_on": "2026-10-07",
                    "tax_code": "GST",
                    "category_code": "ProfessionalServices",
                    "quantity": "1.00",
                    "unit": "Hours",
                    "unit_price": "100.00",
                    "discount": "0.00",
                    "gst": "10.00",
                    "gross": "110.00",
                }],
                "subtotal": "100.00",
                "gst": "10.00",
                "payable": "110.00",
                "super": "0.00",
            },
        }
        pdf = render_document_pdf(document)
        self.assert_readable_pdf(pdf, ["CT-PDF-150", "PDF Test Pharmacy", "110.00"])

    def test_legacy_invoice_renders_with_supported_weasyprint(self):
        line = SimpleNamespace(
            id=1,
            category="ProfessionalServices",
            category_code="ProfessionalServices",
            date=date(2026, 10, 7),
            start_time="09:00:00",
            end_time="17:00:00",
            quantity=Decimal("8.00"),
            unit="Hours",
            unit_price=Decimal("100.00"),
            discount=Decimal("0.00"),
            total=Decimal("800.00"),
        )
        invoice = SimpleNamespace(
            id=150,
            invoice_date=date(2026, 10, 7),
            due_date=date(2026, 10, 14),
            external=False,
            custom_bill_to_name="",
            custom_bill_to_address="",
            bill_to_first_name="Accounts",
            bill_to_last_name="Team",
            pharmacy_name_snapshot="PDF Test Pharmacy",
            pharmacy_abn_snapshot="12345678901",
            pharmacy_address_snapshot="1 Test Street",
            issuer_first_name="Test",
            issuer_last_name="Pharmacist",
            issuer_email="test@example.test",
            issuer_abn="51824753556",
            gst_registered=True,
            super_rate_snapshot=Decimal("12.00"),
            super_fund_name="Test Super",
            super_usi="TEST0001",
            super_member_number="12345",
            subtotal=Decimal("800.00"),
            gst_amount=Decimal("80.00"),
            super_amount=Decimal("0.00"),
            total=Decimal("880.00"),
            bank_account_name="Test Pharmacist",
            bsb="123-456",
            account_number="12345678",
            line_items=_LineItems([line]),
        )
        pdf = render_invoice_to_pdf(invoice)
        self.assert_readable_pdf(pdf, ["Invoice #", "PDF Test Pharmacy", "880.00"])
