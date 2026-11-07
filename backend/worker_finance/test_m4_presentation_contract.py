"""M4-02: real managed finance and ABR endpoints; presentation is the client regression.

No new endpoint or permission is granted here. Backend controls exercise the
canonical URL stack and owner scope on a disposable PostgreSQL test database.
"""
from datetime import date
from unittest.mock import patch
from uuid import uuid4

from django.test import TestCase
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from invoicing.models import Invoice
from worker_finance.models import Customer, Expense

ROOT = '/api/v1/finance/'


class FinancePresentationContractTests(TestCase):
    def setUp(self):
        self.worker = make_user('PHARMACIST')
        self.other = make_user('PHARMACIST')
        self.owner, self.pharmacy = make_owner_with_pharmacy('M4 Finance Pharmacy')
        self.foreign_owner, self.other_pharmacy = make_owner_with_pharmacy('M4 Foreign Pharmacy')
        self.customer = Customer.objects.create(
            owner=self.worker, name='ABN client', legal_name='Previous client',
            abn='51824753556', email='finance@example.test',
        )
        self.invoice = Invoice.objects.create(
            user=self.worker, pharmacy=self.pharmacy, customer=self.customer,
            request_key=uuid4(), status='sent', source='internal',
            payload={'customer': {'name': self.customer.name}, 'invoice_date': '2026-07-10',
                     'due_date': '2026-07-31'},
            calculation={'subtotal': '100.00', 'gst': '10.00', 'payable': '110.00', 'sales_gross': '110.00'},
        )
        self.expense = Expense.objects.create(
            owner=self.worker, supplier='=Supplier', description='Real evidence',
            incurred_on=date(2026, 7, 10), amount='55.00', gst_amount='5.00',
            business_use_percent='80.00', tax_code='GST',
        )

    def test_managed_invoice_detail_is_owner_or_recipient_scoped(self):
        own = client_for(self.worker).get(ROOT + f'invoices/{self.invoice.pk}/')
        self.assertEqual(own.status_code, 200, own.data)
        self.assertEqual(own.data['id'], self.invoice.pk)
        self.assertTrue(own.data['number'], 'the managed response retains its invoice number')
        for user in (self.other, self.foreign_owner):
            with self.subTest(role=user.role, id=user.pk):
                self.assertEqual(client_for(user).get(
                    ROOT + f'invoices/{self.invoice.pk}/').status_code, 404)
        self.assertEqual(client_for().get(
            ROOT + f'invoices/{self.invoice.pk}/').status_code, 401)
        received = client_for(self.owner).get(
            ROOT + f'received-invoices/{self.invoice.pk}/')
        self.assertEqual(received.status_code, 200, received.data)
        self.assertEqual(received.data['id'], self.invoice.pk)
        self.assertEqual(client_for(self.foreign_owner).get(
            ROOT + f'received-invoices/{self.invoice.pk}/').status_code, 404)

    def test_owner_lists_exclude_other_users_and_paging_uses_canonical_response(self):
        for uri, record_id in (
            ('customers/', self.customer.pk), ('expenses/', self.expense.pk),
            ('invoices/', self.invoice.pk),
        ):
            with self.subTest(uri=uri):
                ours = client_for(self.worker).get(ROOT + uri)
                self.assertEqual(ours.status_code, 200, ours.data)
                rows = ours.data.get('results', []) if isinstance(ours.data, dict) else ours.data
                self.assertIn(record_id, {row['id'] for row in rows})
                outsider = client_for(self.other).get(ROOT + uri)
                self.assertEqual(outsider.status_code, 200, outsider.data)
                outside_rows = outsider.data.get('results', []) if isinstance(outsider.data, dict) else outsider.data
                self.assertNotIn(record_id, {row['id'] for row in outside_rows})
                self.assertEqual(client_for().get(ROOT + uri).status_code, 401)

    def test_abn_lookup_returns_real_evidence_and_does_not_verify_edited_abn(self):
        html = '<html>Entity status result</html>'
        fields = {'entity_name': 'M4 Trading', 'entity_type': 'Australian Private Company',
                  'abn_status': 'Cancelled', 'abn_gst_registered': False,
                  'abn_gst_from': None, 'abn_gst_to': '2025-04-30'}
        with patch('infrastructure.integrations.abr.abn_lookup',
                   return_value=('M4 Trading', html)), patch(
                'infrastructure.integrations.abr._parse_abn_html_fields',
                return_value=fields):
            response = client_for(self.worker).post(
                ROOT + f'customers/{self.customer.pk}/lookup_abn/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(response.data['abn_result']['abn_status'], 'Cancelled')
        self.assertEqual(response.data['abn_result']['entity_name'], 'M4 Trading')
        self.assertFalse(response.data['abn_result']['abn_gst_registered'])
        self.assertIsNotNone(response.data['abn_checked_at'])
        self.assertEqual(client_for(self.other).post(
            ROOT + f'customers/{self.customer.pk}/lookup_abn/', {}, format='json').status_code, 404)

    def test_worksheet_is_read_only_estimate_and_scoped(self):
        args = {'start': '2026-07-01', 'end': '2026-09-30', 'basis': 'cash'}
        for actor in (self.worker, self.other):
            result = client_for(actor).get(ROOT + 'bas-worksheet/', args)
            self.assertEqual(result.status_code, 200, result.data)
            self.assertIn('excluded_legacy_invoice_count', result.data)
            self.assertFalse(result.data['lodgement_ready'])
            self.assertEqual(result.data['basis'], 'cash')
        self.assertEqual(client_for().get(ROOT + 'bas-worksheet/', args).status_code, 401)


    def test_managed_invoice_is_not_a_legacy_editor_document(self):
        own = client_for(self.worker).get(f'/api/v1/invoices/{self.invoice.pk}/')
        self.assertEqual(own.status_code, 409, getattr(own, 'data', None))
        self.assertEqual(own.data['finance_record_id'], self.invoice.pk)
        self.assertEqual(client_for(self.other).get(
            f'/api/v1/invoices/{self.invoice.pk}/').status_code, 404)

    def test_editing_customer_abn_discards_previous_registry_result(self):
        self.customer.abn_result = {'entity_name': 'Old entity', 'abn_status': 'Active'}
        self.customer.save(update_fields=['abn_result'])
        updated = client_for(self.worker).patch(
            ROOT + f'customers/{self.customer.pk}/',
            {'abn': '53004085616'}, format='json')
        self.assertEqual(updated.status_code, 200, updated.data)
        self.assertEqual(updated.data['abn_result'], {})
        self.assertIsNone(updated.data['abn_checked_at'])

    def test_finance_responses_are_private_no_store_and_content_type_safe(self):
        targets = (
            ('invoices/', self.worker),
            (f'invoices/{self.invoice.pk}/', self.worker),
            ('received-invoices/', self.owner),
            ('customers/', self.worker),
            ('expenses/', self.worker),
            ('bas-worksheet/?start=2026-07-01&end=2026-09-30&basis=cash', self.worker),
        )
        for uri, actor in targets:
            with self.subTest(uri=uri):
                response = client_for(actor).get(ROOT + uri)
                self.assertEqual(response.status_code, 200, getattr(response, 'data', None))
                self.assertIn('no-store', response['Cache-Control'])
                self.assertEqual(response['X-Content-Type-Options'], 'nosniff')
                self.assertIn('Authorization', response.get('Vary', ''))

    def test_abr_result_strips_unknown_sensitive_fields(self):
        parsed = {
            'entity_name': 'M4 Trading',
            'entity_type': 'Australian Private Company',
            'abn_status': 'Active',
            'abn_gst_registered': True,
            'abn_gst_from': None,
            'abn_gst_to': None,
            'bank_account': 'do-not-persist',
            'verified_owner': True,
        }
        with patch('infrastructure.integrations.abr.abn_lookup',
                   return_value=('M4 Trading', '<html>fixture</html>')), patch(
                'infrastructure.integrations.abr._parse_abn_html_fields',
                return_value=parsed):
            response = client_for(self.worker).post(
                ROOT + f'customers/{self.customer.pk}/lookup_abn/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.data)
        self.assertEqual(set(response.data['abn_result']), {
            'entity_name', 'entity_type', 'abn_status', 'abn_gst_registered',
            'abn_gst_from', 'abn_gst_to',
        })
        self.assertNotIn('bank_account', str(response.data['abn_result']))
        self.assertNotIn('verified_owner', response.data['abn_result'])

    def test_abr_abn_changed_during_lookup_is_rejected_without_stale_result(self):
        def changed_during_lookup(_abn):
            Customer.objects.filter(pk=self.customer.pk).update(abn='53004085616')
            return 'M4 Trading', '<html>fixture</html>'

        with patch('infrastructure.integrations.abr.abn_lookup',
                   side_effect=changed_during_lookup), patch(
                'infrastructure.integrations.abr._parse_abn_html_fields',
                return_value={'entity_name': 'M4 Trading', 'abn_status': 'Active'}):
            response = client_for(self.worker).post(
                ROOT + f'customers/{self.customer.pk}/lookup_abn/', {}, format='json')
        self.assertEqual(response.status_code, 400, getattr(response, 'data', None))
        self.customer.refresh_from_db()
        self.assertEqual(self.customer.abn, '53004085616')
        self.assertFalse(self.customer.abn_result)
        self.assertIsNone(self.customer.abn_checked_at)

    def test_outsider_cannot_list_received_invoices_or_foreign_customers(self):
        outsider = client_for(self.foreign_owner).get(ROOT + 'received-invoices/')
        self.assertEqual(outsider.status_code, 200, outsider.data)
        self.assertNotIn(self.invoice.pk, {
            row['id'] for row in outsider.data.get('results', [])
        })
        self.assertEqual(client_for(self.other).get(
            ROOT + f'customers/{self.customer.pk}/').status_code, 404)
