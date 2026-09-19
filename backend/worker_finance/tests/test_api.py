"""Run with django test --settings=worker_finance.tests.settings.

Uses isolated canonical-model contract fixtures, an in-memory DB and local email.
No customer messages or external ABR calls are made.
"""
from datetime import date, timedelta
from decimal import Decimal
from uuid import uuid4
from unittest import skipUnless
from unittest.mock import patch
from django.conf import settings
from django.contrib.auth import get_user_model
from django.core import mail
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import TestCase
from django.utils import timezone
from rest_framework.test import APIClient
from worker_finance.models import Customer, CatalogueItem, InvoiceRecord, InvoiceRevision, Payment

BASE = '/api/client-profile/finance/'


@skipUnless(getattr(settings, 'FINANCE_CONTRACT_TESTS', False), 'Use the isolated finance contract settings.')
class FinanceApiTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user(username='worker', email='worker@example.invalid')
        self.other = get_user_model().objects.create_user(username='other', email='other@example.invalid')
        self.client = APIClient()
        self.client.force_authenticate(self.user)
        self.customer = Customer.objects.create(owner=self.user, name='Test store', email='accounts@example.invalid')
        self.item = CatalogueItem.objects.create(owner=self.user, code='WORK', name='Labour', category='ProfessionalServices', unit_price='100', tax_code='GST', super_eligible=True)
        self.today = timezone.localdate().isoformat()
        self.data = {'request_key': str(uuid4()), 'customer_id': self.customer.pk, 'invoice_date': self.today,
                     'due_date': self.today, 'issuer_name': 'Test worker', 'issuer_abn': '51824753556',
                     'gst_registered': True, 'price_mode': 'exclusive', 'super_mode': 'separate',
                     'super_rate': '12.00', 'super_confirmed': True, 'super_fund_name': 'Test fund',
                     'super_usi': 'TEST-USI', 'super_member_number': 'TEST-MEMBER',
                     'lines': [{'item_id': self.item.pk, 'quantity': '8.00', 'unit_price': '100.00', 'discount': '0.00'}]}

    def post(self, path, data):
        return self.client.post(BASE + path, data, format='json')

    def create(self):
        response = self.post('invoices/', self.data)
        self.assertEqual(response.status_code, 201, response.data)
        return response.data

    def issue(self, record):
        result = self.post(f'invoices/{record["id"]}/issue/', {'version': record['version'], 'confirmed': True})
        self.assertEqual(result.status_code, 200, result.data)
        return result.data

    def test_authentication_and_ownership(self):
        record = self.create()
        self.client.force_authenticate(None)
        self.assertIn(self.client.get(BASE + 'invoices/').status_code, (401, 403))
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(BASE + f'invoices/{record["id"]}/').status_code, 404)
        self.assertEqual(self.client.get(BASE + 'invoices/').data['count'], 0)
        self.assertEqual(self.post('invoices/', self.data).status_code, 404)

    def test_ad_hoc_line_needs_no_saved_item_code(self):
        payload = {
            **self.data,
            'lines': [{
                'item_id': None,
                'description': 'After-hours consultation',
                'category_code': 'Miscellaneous',
                'unit': 'Visit',
                'quantity': '1.00',
                'unit_price': '55.00',
                'discount': '0.00',
                'tax_code': 'GST',
                'super_eligible': False,
            }],
            'super_mode': 'none',
        }
        response = self.post('invoices/', payload)
        self.assertEqual(response.status_code, 201, response.data)
        self.assertEqual(response.data['payload']['lines'][0]['unit'], 'Visit')
        self.assertIsNone(response.data['payload']['lines'][0].get('item_id'))
        self.assertEqual(response.data['calculation']['payable'], '60.50')

    def test_cross_owner_item_rejected(self):
        self.item.owner = self.other
        self.item.save()
        self.assertEqual(self.post('invoices/', self.data).status_code, 400)
        self.assertEqual(InvoiceRecord.objects.count(), 0)

    def test_canonical_totals_and_create_idempotency(self):
        self.data.update({'subtotal': '999', 'owner': self.other.pk})
        first, second = self.create(), self.create()
        self.assertEqual(first['id'], second['id'])
        record = InvoiceRecord.objects.get(pk=first['id'])
        self.assertEqual(str(record.invoice.total), '880.00')
        self.assertEqual(record.calculation['super'], '96.00')
        self.assertEqual(record.owner_id, self.user.pk)

    def test_stale_version_rejected_but_saved_invoice_remains_revisable(self):
        record = self.create()
        data = {**self.data, 'version': 99}
        self.assertEqual(self.client.patch(BASE + f'invoices/{record["id"]}/', data, format='json').status_code, 400)

        data['version'] = record['version']
        data['notes'] = 'Corrected after review'
        edited = self.client.patch(BASE + f'invoices/{record["id"]}/', data, format='json')
        self.assertEqual(edited.status_code, 200, edited.data)
        self.assertEqual(edited.data['version'], 2)
        self.assertEqual(edited.data['status'], 'draft')
        self.assertEqual(
            list(InvoiceRevision.objects.filter(record_id=record['id']).values_list('version', flat=True)),
            [2, 1],
        )

        response = self.client.patch(
            f'/api/client-profile/invoices/{record["invoice_id"]}/',
            {'total': '1'},
            format='json',
        )
        self.assertEqual(response.status_code, 403)

    def test_duplicate_has_new_identity_and_no_work_dates(self):
        record = self.create()
        duplicate = self.post(f'invoices/{record["id"]}/duplicate/', {'request_key': str(uuid4())})
        self.assertEqual(duplicate.status_code, 201, duplicate.data)
        self.assertNotEqual(duplicate.data['invoice_id'], record['invoice_id'])
        self.assertIsNone(duplicate.data['payload']['lines'][0]['worked_on'])
        self.assertFalse(duplicate.data['locked'])
        self.assertEqual(duplicate.data['payments'], [])

    def test_separate_super_is_linked_idempotent_and_not_sales(self):
        record = self.issue(self.create())
        self.post('items/seed/', {})
        one = self.post(f'invoices/{record["id"]}/super-document/', {'version': record['version']})
        two = self.post(f'invoices/{record["id"]}/super-document/', {'version': record['version']})
        self.assertEqual(one.status_code, 201, one.data)
        self.assertEqual(one.data['id'], two.data['id'])
        self.assertEqual(one.data['calculation']['payable'], '96.00')
        self.assertEqual(one.data['calculation']['gst'], '0.00')
        self.assertEqual(one.data['calculation']['sales_gross'], '0.00')
        self.assertEqual(InvoiceRecord.objects.get(pk=record['id']).calculation['payable'], '880.00')

    def test_partial_payments_and_cash_worksheet(self):
        record = self.issue(self.create())
        payment = {'request_key': str(uuid4()), 'date': self.today, 'amount': '440.00'}
        for _ in range(2):
            result = self.post(f'invoices/{record["id"]}/payments/', payment)
            self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(Payment.objects.count(), 1)
        self.assertEqual(self.post(f'invoices/{record["id"]}/mark-paid/', {'version': record['version']}).status_code, 200)
        worksheet = self.client.get(BASE + f'bas-worksheet/?start={self.today}&end={self.today}&basis=cash')
        self.assertEqual(Decimal(worksheet.data['G1']), Decimal('440.00'))
        self.assertEqual(Decimal(worksheet.data['1A']), Decimal('40.00'))
        self.assertFalse(worksheet.data['lodgement_ready'])
        payment.update(request_key=str(uuid4()), amount='441.00')
        self.assertEqual(self.post(f'invoices/{record["id"]}/payments/', payment).status_code, 400)

    @patch('worker_finance.documents.render_pdf', return_value=b'%PDF-test-only')
    def test_send_saved_revision_and_no_duplicate_email_for_same_version(self, _render):
        record = self.create()
        for _ in range(2):
            result = self.post(f'invoices/{record["id"]}/send/', {'version': 1, 'confirmed': True})
            self.assertEqual(result.status_code, 200, result.data)
        self.assertEqual(len(mail.outbox), 1)
        self.assertEqual(mail.outbox[0].to, ['accounts@example.invalid'])
        self.assertEqual(InvoiceRevision.objects.get(record_id=record['id'], version=1).invoice_status, 'sent')

    @patch('worker_finance.documents.render_pdf', return_value=b'%PDF-test-only')
    def test_sent_invoice_can_be_revised_and_new_revision_sent_again(self, _render):
        record = self.create()
        first_send = self.post(f'invoices/{record["id"]}/send/', {'version': 1, 'confirmed': True})
        self.assertEqual(first_send.status_code, 200, first_send.data)

        payload = {**self.data, 'version': 1, 'notes': 'Corrected after send'}
        edited = self.client.patch(BASE + f'invoices/{record["id"]}/', payload, format='json')
        self.assertEqual(edited.status_code, 200, edited.data)
        self.assertEqual(edited.data['version'], 2)
        self.assertEqual(edited.data['status'], 'draft')
        self.assertEqual(InvoiceRevision.objects.get(record_id=record['id'], version=1).invoice_status, 'sent')
        self.assertIsNone(edited.data['delivery_status'])

        second_send = self.post(f'invoices/{record["id"]}/send/', {'version': 2, 'confirmed': True})
        self.assertEqual(second_send.status_code, 200, second_send.data)
        self.assertEqual(len(mail.outbox), 2)
        self.assertEqual(InvoiceRevision.objects.get(record_id=record['id'], version=2).invoice_status, 'sent')

    def test_paid_invoice_can_be_corrected_and_returns_to_saved_state(self):
        record = self.create()
        paid = self.post(f'invoices/{record["id"]}/mark-paid/', {'version': 1})
        self.assertEqual(paid.status_code, 200, paid.data)
        self.assertEqual(paid.data['status'], 'paid')

        payload = {**self.data, 'version': 1, 'notes': 'Corrected after payment status'}
        edited = self.client.patch(BASE + f'invoices/{record["id"]}/', payload, format='json')
        self.assertEqual(edited.status_code, 200, edited.data)
        self.assertEqual(edited.data['version'], 2)
        self.assertEqual(edited.data['status'], 'draft')
        self.assertEqual(InvoiceRevision.objects.get(record_id=record['id'], version=1).invoice_status, 'paid')

    @patch('worker_finance.documents.render_pdf', return_value=b'%PDF-test-only')
    def test_sent_invoice_can_be_edited_saved_and_resent_as_new_revision(self, _render):
        record = self.create()
        sent = self.post(f'invoices/{record["id"]}/send/', {'version': 1, 'confirmed': True})
        self.assertEqual(sent.status_code, 200, sent.data)

        payload = {**self.data, 'version': 1, 'notes': 'Corrected after first send'}
        edited = self.client.patch(BASE + f'invoices/{record["id"]}/', payload, format='json')
        self.assertEqual(edited.status_code, 200, edited.data)
        self.assertEqual(edited.data['version'], 2)
        self.assertEqual(edited.data['status'], 'draft')

        resent = self.post(f'invoices/{record["id"]}/send/', {'version': 2, 'confirmed': True})
        self.assertEqual(resent.status_code, 200, resent.data)
        self.assertEqual(len(mail.outbox), 2)
        self.assertEqual(InvoiceRevision.objects.get(record_id=record['id'], version=1).invoice_status, 'sent')
        self.assertEqual(InvoiceRevision.objects.get(record_id=record['id'], version=2).invoice_status, 'sent')

    @patch('worker_finance.documents.render_pdf', return_value=b'%PDF-test-only')
    def test_paid_invoice_can_be_corrected_saved_and_resent(self, _render):
        record = self.create()
        paid = self.post(f'invoices/{record["id"]}/mark-paid/', {'version': 1})
        self.assertEqual(paid.status_code, 200, paid.data)
        self.assertEqual(paid.data['status'], 'paid')

        payload = {**self.data, 'version': 1, 'notes': 'Correction after paid status'}
        edited = self.client.patch(BASE + f'invoices/{record["id"]}/', payload, format='json')
        self.assertEqual(edited.status_code, 200, edited.data)
        self.assertEqual(edited.data['version'], 2)
        self.assertEqual(edited.data['status'], 'draft')
        self.assertEqual(InvoiceRevision.objects.get(record_id=record['id'], version=1).invoice_status, 'paid')

        resent = self.post(f'invoices/{record["id"]}/send/', {'version': 2, 'confirmed': True})
        self.assertEqual(resent.status_code, 200, resent.data)
        self.assertEqual(resent.data['document']['status'], 'sent')
        self.assertEqual(len(mail.outbox), 1)

    def test_seed_preserves_user_defaults(self):
        self.post('items/seed/', {})
        CatalogueItem.objects.filter(owner=self.user, code='TRAVEL').update(unit_price='9.00')
        self.post('items/seed/', {})
        self.assertEqual(str(CatalogueItem.objects.get(owner=self.user, code='TRAVEL').unit_price), '9.00')

    def test_expense_receipt_access_and_duplicate_detection(self):
        payload = {'request_key': str(uuid4()), 'version': 1, 'supplier': 'Hotel', 'description': 'Work travel',
                   'incurred_on': self.today, 'paid_on': self.today, 'amount': '110.00', 'gst_amount': '10.00',
                   'business_use_percent': '50.00', 'tax_code': 'GST', 'gst_registered': True, 'evidence_confirmed': True}
        expense = self.post('expenses/', payload)
        self.assertEqual(expense.status_code, 201, expense.data)
        self.assertEqual(expense.data['gst_credit'], '5.00')
        path = BASE + f'expenses/{expense.data["id"]}/receipts/'
        upload = lambda: SimpleUploadedFile('receipt.pdf', b'%PDF-test-receipt', content_type='application/pdf')
        receipt = self.client.post(path, {'file': upload()}, format='multipart')
        self.assertEqual(receipt.status_code, 201, receipt.data)
        self.assertEqual(self.client.post(path, {'file': upload()}, format='multipart').status_code, 400)
        receipt_id = receipt.data['receipts'][0]['id']
        self.client.force_authenticate(self.other)
        self.assertEqual(self.client.get(BASE + f'receipts/{receipt_id}/download/').status_code, 404)


    def test_decimal_json_floats_rejected_for_all_line_numbers(self):
        for key in ('quantity', 'unit_price', 'discount'):
            with self.subTest(field=key):
                data = {**self.data, 'lines': [{**self.data['lines'][0], key: 1.5}]}
                self.assertEqual(self.post('invoices/', data).status_code, 400)
        self.assertEqual(self.post('invoices/', {**self.data, 'super_rate': 12.0}).status_code, 400)
        self.assertEqual(InvoiceRecord.objects.count(), 0)

    def test_issue_review_action_does_not_lock_or_prevent_later_edit(self):
        self.data.update(issuer_abn='', gst_registered=False, super_mode='none')
        self.data['lines'][0]['tax_code'] = 'OUT_OF_SCOPE'
        record = self.create()
        response = self.post(f'invoices/{record["id"]}/issue/', {'version': 1, 'confirmed': True})
        self.assertEqual(response.status_code, 200, response.data)
        self.assertFalse(InvoiceRecord.objects.get(pk=record['id']).locked_at)
        payload = {**self.data, 'version': 1, 'notes': 'Still editable'}
        changed = self.client.patch(BASE + f'invoices/{record["id"]}/', payload, format='json')
        self.assertEqual(changed.status_code, 200, changed.data)
        self.assertEqual(changed.data['version'], 2)

    def test_company_identity_and_normalised_abn_snapshot(self):
        self.data.update(issuer_entity_type='company', issuer_abn='51 824 753 556')
        record = self.create()
        self.assertEqual(record['payload']['issuer_abn'], '51824753556')
        self.assertEqual(record['payload']['issuer_entity_type'], 'company')

    def test_boolean_version_cannot_approve_issue(self):
        record = self.create()
        response = self.post(f'invoices/{record["id"]}/issue/', {'version': True, 'confirmed': True})
        self.assertEqual(response.status_code, 400)

    def test_conflicting_payment_idempotency_key_rejected(self):
        record = self.issue(self.create())
        payment = {'request_key': str(uuid4()), 'date': self.today, 'amount': '100.00'}
        path = f'invoices/{record["id"]}/payments/'
        self.assertEqual(self.post(path, payment).status_code, 200)
        self.assertEqual(self.post(path, {**payment, 'amount': '101.00'}).status_code, 400)
        self.assertEqual(Payment.objects.count(), 1)

    def test_expense_dates_and_binary_floats_rejected(self):
        payload = {'request_key': str(uuid4()), 'supplier': 'Supplier', 'description': 'Work',
                   'incurred_on': self.today, 'amount': '110.00', 'gst_amount': '10.00',
                   'tax_code': 'GST', 'business_use_percent': '100.00', 'gst_registered': True,
                   'evidence_confirmed': True}
        for delta in (-1, 1):
            invalid_date = (date.fromisoformat(self.today) + timedelta(days=delta)).isoformat()
            self.assertEqual(self.post('expenses/', {**payload, 'paid_on': invalid_date}).status_code, 400)
        self.assertEqual(self.post('expenses/', {**payload, 'business_use_percent': 50.5}).status_code, 400)

    def test_private_records_have_no_store_headers(self):
        record = self.create()
        for path in ('customers/', 'items/', 'expenses/', f'invoices/{record["id"]}/'):
            response = self.client.get(BASE + path)
            self.assertEqual(response.status_code, 200)
            self.assertIn('no-store', response['Cache-Control'])
            self.assertIn('Authorization', response['Vary'])
            self.assertEqual(response['X-Content-Type-Options'], 'nosniff')

    def test_customer_abn_changes_clear_lookup_metadata(self):
        response = self.post('customers/', {'name': 'Store', 'abn': '51 824 753 556'})
        self.assertEqual(response.status_code, 201, response.data)
        customer = Customer.objects.get(pk=response.data['id'])
        customer.abn_result = {'entity_name': 'Previous'}
        from django.utils import timezone
        customer.abn_checked_at = timezone.now()
        customer.save()
        changed = self.client.patch(BASE + f'customers/{customer.pk}/', {'abn': ''}, format='json')
        self.assertEqual(changed.status_code, 200, changed.data)
        self.assertIsNone(changed.data['abn_checked_at'])
        self.assertEqual(changed.data['abn_result'], {})

    @patch('worker_finance.documents.render_pdf', return_value=b'%PDF-test-only')
    @patch('worker_finance.views.EmailMessage.send', side_effect=TimeoutError('Simulated timeout'))
    def test_uncertain_email_is_not_automatically_retried(self, send, _render):
        record = self.issue(self.create())
        path = f'invoices/{record["id"]}/send/'
        data = {'version': 1, 'confirmed': True}
        self.assertEqual(self.post(path, data).status_code, 503)
        retried = self.post(path, data)
        self.assertEqual(retried.status_code, 200)
        self.assertEqual(retried.data['document']['delivery_status'], 'uncertain')
        self.assertEqual(send.call_count, 1)

    @patch('worker_finance.documents.render_pdf', side_effect=[RuntimeError('PDF failed'), b'%PDF-test-only'])
    def test_preparation_failure_can_retry_without_duplicate_send(self, _render):
        record = self.issue(self.create())
        path = f'invoices/{record["id"]}/send/'
        self.assertEqual(self.post(path, {'version': 1, 'confirmed': True}).status_code, 503)
        self.assertEqual(self.post(path, {'version': 1, 'confirmed': True}).status_code, 200)
        self.assertEqual(len(mail.outbox), 1)

    def test_super_payment_requires_fund_confirmation_and_never_increases_gst_sales(self):
        record = self.issue(self.create())
        self.post('items/seed/', {})
        super_record = self.post(f'invoices/{record["id"]}/super-document/', {'version': 1}).data
        self.issue(super_record)
        data = {'request_key': str(uuid4()), 'date': self.today, 'amount': '96.00'}
        path = f'invoices/{super_record["id"]}/payments/'
        self.assertEqual(self.post(path, data).status_code, 400)
        data['fund_payment_confirmed'] = True
        self.assertEqual(self.post(path, data).status_code, 200)
        worksheet = self.client.get(BASE + f'bas-worksheet/?start={self.today}&end={self.today}&basis=cash')
        self.assertEqual(Decimal(worksheet.data['G1']), Decimal('0'))
        self.assertEqual(Decimal(worksheet.data['1A']), Decimal('0'))

    def test_legacy_route_delegates_preserve_drf_csrf_contract(self):
        from worker_finance import legacy
        self.assertTrue(legacy.detail.csrf_exempt)
        self.assertTrue(legacy.pdf.csrf_exempt)
        self.assertTrue(legacy.send.csrf_exempt)

    def test_invoice_list_prefetches_history_in_bounded_queries(self):
        from django.db import connection
        from django.test.utils import CaptureQueriesContext
        for _ in range(3):
            self.data['request_key'] = str(uuid4())
            self.create()
        with CaptureQueriesContext(connection) as queries:
            response = self.client.get(BASE + 'invoices/')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data['count'], 3)
        self.assertLessEqual(len(queries), 8)
