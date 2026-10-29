"""Actual smtplib/TCP, MIME and rendered PDF acceptance against a local sink."""
from email import policy
from email.parser import BytesParser
from unittest.mock import patch
import fitz
from django.test import TransactionTestCase, override_settings
from invoicing import test_delivery as fixtures
from client_profile.characterization_support import client_for, make_user
from testing.smtp_capture import CapturedSMTP
from worker_finance.models import Delivery
from worker_finance.services import save_draft


@override_settings(EMAIL_BACKEND='django.core.mail.backends.smtp.EmailBackend', EMAIL_HOST='127.0.0.1',
                   EMAIL_HOST_USER='', EMAIL_HOST_PASSWORD='', EMAIL_USE_TLS=False, EMAIL_USE_SSL=False,
                   EMAIL_TIMEOUT=3)
class InvoiceSMTPProtocolTests(TransactionTestCase):
    def setUp(self):
        self.worker = make_user('OTHER_STAFF')
        self.client = client_for(self.worker)
        self.record = fixtures._InvoiceDeliveryFixture.finance_record(self)
        self.url = f'/api/v1/finance/invoices/{self.record.pk}/send/'

    def send(self, version=1):
        return self.client.post(self.url, {'version': version, 'confirmed': True}, format='json')

    def pdf_text(self, raw):
        message = BytesParser(policy=policy.default).parsebytes(raw)
        self.assertEqual(message['To'], 'managed@example.invalid')
        [attachment] = list(message.iter_attachments())
        self.assertEqual(attachment.get_content_type(), 'application/pdf')
        payload = attachment.get_payload(decode=True)
        self.assertTrue(payload.startswith(b'%PDF-'))
        with fitz.open(stream=payload, filetype='pdf') as document:
            return '\n'.join(page.get_text() for page in document)

    def test_real_smtp_ack_and_mime_pdf_match_saved_revisions_without_duplicate_send(self):
        with CapturedSMTP() as smtp, override_settings(EMAIL_PORT=smtp.port):
            first = self.send()
            self.assertEqual(first.status_code, 200, first.content)
            self.assertEqual(self.send().status_code, 200)
            self.assertEqual(len(smtp.messages), 1)
            first_text = self.pdf_text(smtp.messages[0])
            self.assertIn('150.00', first_text)
            self.record.refresh_from_db()
            payload = dict(self.record.payload, version=self.record.version)
            payload['lines'] = [dict(payload['lines'][0], quantity='3.00')]
            self.record = save_draft(self.worker, payload, self.record.pk)
            self.assertEqual(self.send(version=1).status_code, 400)
            self.assertEqual(len(smtp.messages), 1)
            second = self.send(version=2)
            self.assertEqual(second.status_code, 200, second.content)
            self.assertEqual(len(smtp.messages), 2)
            self.assertIn('225.00', self.pdf_text(smtp.messages[1]))
            self.assertEqual(self.pdf_text(smtp.messages[0]), first_text)
        self.assertEqual(list(Delivery.objects.filter(invoice=self.record).order_by('version').values_list('version', 'status')),
                         [(1, 'sent'), (2, 'sent')])
        self.assertEqual(self.record.revisions.get(version=1).calculation['payable'], '150.00')
        self.assertEqual(self.record.revisions.get(version=2).calculation['payable'], '225.00')

    def test_real_smtp_acceptance_with_lost_ack_is_uncertain_and_never_automatically_resent(self):
        with CapturedSMTP('lost_ack') as smtp, override_settings(EMAIL_PORT=smtp.port):
            response = self.send()
            self.assertEqual(response.status_code, 503, response.content)
            self.assertEqual(len(smtp.messages), 1)
            self.assertIn('150.00', self.pdf_text(smtp.messages[0]))
            self.assertEqual(Delivery.objects.get(invoice=self.record).status, 'uncertain')
            self.assertEqual(self.send().status_code, 200)
            self.assertEqual(len(smtp.messages), 1)
        self.assertEqual(Delivery.objects.filter(invoice=self.record).count(), 1)

    def test_real_provider_rejection_remains_fenced_for_manual_reconciliation(self):
        with CapturedSMTP('reject') as smtp, override_settings(EMAIL_PORT=smtp.port):
            self.assertEqual(self.send().status_code, 503)
            self.assertEqual(self.send().status_code, 200)
            self.assertEqual(len(smtp.messages), 0)
            self.assertEqual(Delivery.objects.get(invoice=self.record).status, 'uncertain')

    def test_real_provider_ack_then_database_failure_retains_claim_and_does_not_send_twice(self):
        with CapturedSMTP() as smtp, override_settings(EMAIL_PORT=smtp.port):
            with patch('worker_finance.views.finish_delivery', side_effect=RuntimeError('completion lost')):
                self.assertEqual(self.send().status_code, 503)
            self.assertEqual(self.send().status_code, 200)
            self.assertEqual(len(smtp.messages), 1)
            self.assertEqual(Delivery.objects.get(invoice=self.record).status, 'uncertain')
