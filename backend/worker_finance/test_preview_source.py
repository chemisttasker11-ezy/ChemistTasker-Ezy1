"""An internal draft previews before Save without creating its synthetic customer."""
from copy import deepcopy
from django.test import TestCase
from client_profile.characterization_support import client_for, make_user
from invoicing import test_integrity as fixtures
from invoicing.models import Invoice
from worker_finance.models import Customer, InvoiceRevision, Delivery, Payment
from worker_finance.services import internal_invoice_prefill


class InternalDraftPreviewTests(TestCase):
    def setUp(self):
        fixtures.AcceptedShiftInvoiceIntegrityTests.setUp(self)
        self.client = client_for(self.worker)
        self.draft = internal_invoice_prefill(self.worker, [self.assignment.pk])
        self.path = '/api/v1/finance/invoices/preview/'

    def counts(self):
        return tuple(model.objects.count() for model in (Customer, Invoice, InvoiceRevision, Delivery, Payment))

    def test_preview_then_save_agree_without_preview_writes(self):
        payload = deepcopy(self.draft)
        self.assertEqual(payload['customer_id'], 0)
        payload['lines'][0]['quantity'] = '7.50'
        original = self.counts()
        preview = self.client.post(self.path, payload, format='json')
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(self.counts(), original)
        self.assertEqual(preview.data['payable'], '577.50')
        saved = self.client.post('/api/v1/finance/invoices/', payload, format='json')
        self.assertEqual(saved.status_code, 201, saved.data)
        self.assertEqual(saved.data['calculation'], preview.data)
        self.assertEqual(Customer.objects.count(), original[0] + 1)
        self.assignment.refresh_from_db()
        self.assertEqual(str(self.assignment.unit_rate), '70.00')
        self.assertEqual(saved.data['source_snapshot']['accepted_terms'][0]['original_hours'], '8.00')

    def test_foreign_source_is_refused_without_writes(self):
        self.client = client_for(make_user('OTHER_STAFF'))
        before = self.counts()
        response = self.client.post(self.path, self.draft, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertEqual(self.counts(), before)

    def test_source_rows_cannot_be_removed_or_replaced(self):
        for rows in ([], [dict(self.draft['lines'][0], source_assignment_id=self.assignment.pk + 10000)]):
            with self.subTest(rows=len(rows)):
                before = self.counts()
                response = self.client.post(self.path, dict(self.draft, lines=rows), format='json')
                self.assertEqual(response.status_code, 400, response.data)
                self.assertEqual(self.counts(), before)

    def test_external_draft_still_requires_its_existing_owned_customer(self):
        payload = deepcopy(self.draft)
        payload.pop('source_assignment_ids')
        for row in payload['lines']:
            row.pop('source_assignment_id')
        response = self.client.post(self.path, payload, format='json')
        self.assertEqual(response.status_code, 400, response.data)
        self.assertIn('customer_id', response.data)

    def test_saved_internal_revision_still_previews_its_editable_values(self):
        saved = self.client.post('/api/v1/finance/invoices/', self.draft, format='json')
        self.assertEqual(saved.status_code, 201, saved.data)
        payload = dict(saved.data['payload'], version=saved.data['version'])
        payload['lines'] = [dict(payload['lines'][0], quantity='7.50')]
        before = self.counts()
        preview = self.client.post(self.path, payload, format='json')
        self.assertEqual(preview.status_code, 200, preview.data)
        self.assertEqual(preview.data['payable'], '577.50')
        self.assertEqual(self.counts(), before)
