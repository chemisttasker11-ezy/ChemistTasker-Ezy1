from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient


class ExplorerFinanceAccessTests(TestCase):
    def test_finance_and_legacy_endpoints_reject_current_explorer_role(self):
        user = get_user_model().objects.create_user(email='explorer-finance@example.test', role='EXPLORER')
        client = APIClient()
        client.force_authenticate(user)
        routes = [
            ('get', '/api/v1/finance/customers/'), ('get', '/api/v1/finance/items/'),
            ('post', '/api/v1/finance/shift-hours/'),
            ('get', '/api/v1/finance/invoices/'), ('post', '/api/v1/finance/invoices/'),
            ('get', '/api/v1/finance/invoices/1/'), ('patch', '/api/v1/finance/invoices/1/'),
            ('get', '/api/v1/finance/invoices/1/pdf/'), ('get', '/api/v1/finance/invoices/1/revisions/1/pdf/'),
            ('get', '/api/v1/finance/received-invoices/'), ('get', '/api/v1/finance/received-invoices/1/pdf/'),
            ('get', '/api/v1/finance/expenses/'), ('post', '/api/v1/finance/expenses/1/receipts/'),
            ('get', '/api/v1/finance/receipts/1/download/'), ('get', '/api/v1/finance/bas-worksheet/'),
            ('get', '/api/v1/invoices/'), ('post', '/api/v1/invoices/'),
            ('get', '/api/v1/invoices/1/'), ('patch', '/api/v1/invoices/1/'), ('delete', '/api/v1/invoices/1/'),
            ('get', '/api/v1/invoices/1/pdf/'), ('post', '/api/v1/invoices/1/send/'),
            ('post', '/api/v1/invoices/generate/'), ('post', '/api/v1/invoices/generate/preview/'),
            ('get', '/api/v1/invoices/preview/1/'), ('post', '/api/v1/invoices/1/report-issue/'),
        ]
        for method, url in routes:
            with self.subTest(method=method, url=url):
                self.assertEqual(getattr(client, method)(url, {}, format='json').status_code, 403)
        user.role = 'PHARMACIST'
        user.save(update_fields=['role'])
        self.assertEqual(client.get('/api/v1/finance/invoices/').status_code, 200)
        self.assertEqual(client.get('/api/v1/invoices/').status_code, 200)
from uuid import uuid4
from invoicing.models import Invoice


class FinanceRoleControlsTests(TestCase):
    def test_existing_roles_keep_endpoint_access(self):
        client = APIClient()
        for role in ('PHARMACIST', 'OTHER_STAFF', 'OWNER', 'ORG_STAFF', 'PHARMACY_MANAGER'):
            user = get_user_model().objects.create_user(email=f'{role}@example.test', role=role)
            client.force_authenticate(user)
            for url in ('/api/v1/finance/customers/', '/api/v1/finance/items/',
                        '/api/v1/finance/invoices/', '/api/v1/finance/received-invoices/',
                        '/api/v1/finance/expenses/', '/api/v1/invoices/'):
                with self.subTest(role=role, url=url):
                    self.assertEqual(client.get(url).status_code, 200)

    def test_pharmacist_keeps_shift_hours_access(self):
        user = get_user_model().objects.create_user(email='shift-hours@example.test', role='PHARMACIST')
        client = APIClient()
        client.force_authenticate(user)
        response = client.post('/api/v1/finance/shift-hours/', {
            'start': '2026-01-01T09:00:00+10:00',
            'end': '2026-01-01T17:00:00+10:00',
            'break_minutes': 30,
        }, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.data, {'hours': '7.50'})

    def test_managed_legacy_delegate_denies_explorer(self):
        user = get_user_model().objects.create_user(email='managed@example.test', role='EXPLORER')
        invoice = Invoice.objects.create(user=user, request_key=uuid4())
        client = APIClient()
        client.force_authenticate(user)
        for method, suffix in (('get', ''), ('patch', ''), ('delete', ''), ('get', 'pdf/'), ('post', 'send/')):
            with self.subTest(method=method, suffix=suffix):
                self.assertEqual(getattr(client, method)(f'/api/v1/invoices/{invoice.pk}/{suffix}', {}, format='json').status_code, 403)
from datetime import date
from django.core.files.uploadedfile import SimpleUploadedFile
from worker_finance.models import Expense


class ReceiptRoleTests(TestCase):
    def test_receipt_upload_download_follow_current_role(self):
        user = get_user_model().objects.create_user(email='receipt-role@example.test', role='PHARMACIST')
        expense = Expense.objects.create(owner=user, supplier='Supplier', description='Test', incurred_on=date(2026, 1, 1), amount='10.00')
        client = APIClient()
        client.force_authenticate(user)
        upload = SimpleUploadedFile('receipt.pdf', b'%PDF-test', content_type='application/pdf')
        response = client.post(f'/api/v1/finance/expenses/{expense.pk}/receipts/', {'file': upload}, format='multipart')
        self.assertEqual(response.status_code, 201)
        receipt = expense.receipts.get()
        self.assertEqual(client.get(f'/api/v1/finance/receipts/{receipt.pk}/download/').status_code, 200)
        get_user_model().objects.filter(pk=user.pk).update(role='EXPLORER')
        client.force_authenticate(get_user_model().objects.get(pk=user.pk))
        self.assertEqual(client.get(f'/api/v1/finance/receipts/{receipt.pk}/download/').status_code, 403)
        self.assertEqual(client.post(f'/api/v1/finance/expenses/{expense.pk}/receipts/', {}, format='multipart').status_code, 403)
