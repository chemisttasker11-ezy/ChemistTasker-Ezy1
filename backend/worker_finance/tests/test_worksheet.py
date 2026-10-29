"""Worksheet record boundaries, using the real HTTP endpoint in both test settings."""
from datetime import timedelta
from decimal import Decimal
from uuid import uuid4

from django.apps import apps
from django.contrib.auth import get_user_model
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient

from worker_finance.models import InvoiceRevision, Payment


Invoice = apps.get_model('invoicing', 'Invoice')
WORKSHEET = '/api/v1/finance/bas-worksheet/'


class WorksheetInvoiceBoundaryTests(TestCase):
    def setUp(self):
        User = get_user_model()

        def worker(name):
            fields = {'username': name, 'email': f'{name}@example.invalid'}
            if hasattr(User, 'role'):
                fields['role'] = 'PHARMACIST'
            return User.objects.create_user(**fields)

        self.worker = worker('worksheet-worker')
        self.other = worker('worksheet-other')
        self.today = timezone.localdate()
        self.client = APIClient()
        self.client.force_authenticate(self.worker)
        self.client.raise_request_exception = False

    def invoice(self, amount='110.00', gst='10.00', **changes):
        fields = {
            'user': self.worker,
            'external': True,
            'request_key': uuid4(),
            'invoice_date': self.today,
            'status': 'sent',
            'subtotal': Decimal(amount) - Decimal(gst),
            'gst_amount': gst,
            'total': amount,
            'calculation': {'payable': amount, 'sales_gross': amount, 'gst': gst},
        }
        fields.update(changes)
        return Invoice.objects.create(**fields)

    def payment(self, invoice, amount='55.00', gst='5.00', day=None):
        return Payment.objects.create(
            invoice=invoice, request_key=uuid4(), date=day or self.today,
            amount=amount, sales=amount, gst=gst,
        )

    def worksheet(self, basis, start=None, end=None):
        response = self.client.get(WORKSHEET, {
            'basis': basis, 'start': start or self.today, 'end': end or self.today,
        })
        self.assertEqual(response.status_code, 200, response.content[:500])
        return response.data

    def assert_totals(self, data, sales, gst):
        self.assertEqual(
            (Decimal(data['G1']), Decimal(data['1A'])),
            (Decimal(sales), Decimal(gst)),
        )

    def test_accrual_excludes_unmanaged_sent_and_paid_external_invoices(self):
        self.invoice()
        compatibility = [
            self.invoice(request_key=None, calculation={}, status=status)
            for status in ('sent', 'paid')
        ]

        data = self.worksheet('accrual')

        self.assert_totals(data, '110.00', '10.00')
        self.assertEqual(data['excluded_legacy_invoice_count'], 2)
        self.assertFalse(data['lodgement_ready'])
        for invoice in compatibility:
            original_status = invoice.status
            invoice.refresh_from_db()
            self.assertIsNone(invoice.request_key)
            self.assertEqual(invoice.calculation, {})
            self.assertEqual(invoice.status, original_status)
            self.assertFalse(invoice.payments.exists())

    def test_unmanaged_metadata_or_receipts_do_not_make_an_invoice_reportable(self):
        managed = self.invoice()
        self.payment(managed)
        # A partial import must not enter either report merely because it has
        # cached calculations or a receipt; workspace membership is explicit.
        compatibility = self.invoice('220.00', '20.00', request_key=None)
        self.payment(compatibility, '220.00', '20.00')

        for basis, sales, gst in (('accrual', '110.00', '10.00'), ('cash', '55.00', '5.00')):
            with self.subTest(basis=basis):
                data = self.worksheet(basis)
                self.assert_totals(data, sales, gst)
                self.assertEqual(data['excluded_legacy_invoice_count'], 1)
        self.assertEqual(Payment.objects.count(), 2)

    def test_migrated_managed_snapshots_remain_included_without_inventing_receipts(self):
        imported_sent = self.invoice(legacy_snapshot=True)
        imported_paid = self.invoice('220.00', '20.00', legacy_snapshot=True, status='paid')
        for invoice in (imported_sent, imported_paid):
            InvoiceRevision.objects.create(
                invoice=invoice, version=1, calculation=invoice.calculation,
                invoice_status=invoice.status,
            )

        accrual = self.worksheet('accrual')
        self.assert_totals(accrual, '330.00', '30.00')
        self.assertEqual(accrual['excluded_legacy_invoice_count'], 0)
        self.assert_totals(self.worksheet('cash'), '0.00', '0.00')
        self.assertFalse(Payment.objects.exists())

        self.payment(imported_paid, '110.00', '10.00')
        self.assert_totals(self.worksheet('cash'), '110.00', '10.00')
        self.assertEqual(InvoiceRevision.objects.count(), 2)
        for invoice in (imported_sent, imported_paid):
            invoice.refresh_from_db()
            self.assertTrue(invoice.legacy_snapshot)
            self.assertIsNotNone(invoice.request_key)
            self.assertEqual(invoice.version, 1)

    def test_owner_period_kind_and_void_boundaries_remain_distinct_for_cash_and_accrual(self):
        start, end = self.today - timedelta(days=2), self.today - timedelta(days=1)
        at_start = self.invoice(invoice_date=start)
        before_start = self.invoice('220.00', '20.00', invoice_date=start - timedelta(days=1))
        self.invoice('330.00', '30.00', invoice_date=end)
        self.payment(at_start, day=end)
        self.payment(at_start, day=self.today)  # Outside the requested receipt period.
        self.payment(before_start, '110.00', '10.00', day=start)

        for changes in (
            {'user': self.other},
            {'voided_at': timezone.now()},
            {'kind': 'super_request'},
        ):
            excluded = self.invoice('440.00', '40.00', invoice_date=end, **changes)
            self.payment(excluded, '440.00', '40.00', day=end)
        # The existing legacy counter is owner-scoped and all-time.
        self.invoice(request_key=None, calculation={}, status='draft', invoice_date=self.today)
        self.invoice(user=self.other, request_key=None, calculation={}, status='draft')

        for basis, sales, gst in (('accrual', '440.00', '40.00'), ('cash', '165.00', '15.00')):
            with self.subTest(basis=basis):
                data = self.worksheet(basis, start, end)
                self.assert_totals(data, sales, gst)
                self.assertEqual(data['excluded_legacy_invoice_count'], 1)
