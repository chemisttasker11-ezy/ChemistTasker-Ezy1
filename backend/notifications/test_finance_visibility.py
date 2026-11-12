from unittest.mock import patch

from django.test import TestCase
from client_profile.characterization_support import client_for, make_user
from notifications.models import Notification
from notifications.services import notify_users
from users.models import DeviceToken

URL = '/api/v1/notifications/'
KINDS = ('invoice_issue', 'invoice_revision_requested', 'invoice_approved_for_payment', 'invoice_paid')


class FinanceNotificationVisibilityTests(TestCase):
    def setUp(self):
        self.user = make_user('PHARMACIST')
        self.invoices = [Notification.objects.create(user=self.user, title=kind, payload={'kind': kind, 'invoice_id': 123}) for kind in KINDS]
        self.normal = Notification.objects.create(user=self.user, title='Shift', payload={'kind': 'shift'})
        self.user.role = 'EXPLORER'
        self.user.save(update_fields=['role'])
        self.client = client_for(self.user)

    def test_list_and_detail_hide_finance_and_restore_after_conversion(self):
        self.assertEqual([row['id'] for row in self.client.get(URL).json()['results']], [self.normal.id])
        for invoice in self.invoices:
            self.assertEqual(self.client.get(f'{URL}{invoice.id}/').status_code, 404)
        self.user.role = 'PHARMACIST'
        self.user.save(update_fields=['role'])
        self.assertEqual(self.client.get(URL).json()['count'], 5)
        self.assertEqual(self.client.get(f'{URL}{self.invoices[0].id}/').status_code, 200)

    def test_mark_selected_and_all_exclude_finance_from_counts_and_updates(self):
        with patch('notifications.services._broadcast') as broadcast:
            response = self.client.post(URL + 'mark-read/', {'ids': [self.invoices[0].id]}, format='json')
            self.assertEqual(response.json(), {'marked': 0, 'unread': 1})
            response = self.client.post(URL + 'mark-read/', {}, format='json')
            self.assertEqual(response.json(), {'marked': 1, 'unread': 0})
            self.assertEqual(broadcast.call_args_list[-1].args[2], {'unread': 0})
        self.assertEqual(Notification.objects.filter(pk__in=[n.pk for n in self.invoices], read_at__isnull=True).count(), 4)

    def test_delivery_hides_finance_but_delivers_ordinary_events(self):
        DeviceToken.objects.create(user=self.user, token='test-token', platform='ios', active=True)
        with patch('notifications.services._broadcast') as broadcast, patch('notifications.services._send_expo_push') as push:
            for kind in KINDS:
                notify_users([self.user.pk], title=kind, payload={'kind': kind})
            self.assertEqual(broadcast.call_count, 0)
            self.assertEqual(push.call_count, 0)
            notify_users([self.user.pk], title='Shift', payload={'kind': 'shift'})
            self.assertEqual(broadcast.call_count, 2)
            self.assertEqual(broadcast.call_args_list[-1].args[2], {'unread': 2})
            self.assertEqual(push.call_count, 1)

    def test_allowed_role_receives_finance_delivery(self):
        self.user.role = 'OWNER'
        self.user.save(update_fields=['role'])
        DeviceToken.objects.create(user=self.user, token='owner-token', platform='ios', active=True)
        with patch('notifications.services._broadcast') as broadcast, patch('notifications.services._send_expo_push') as push:
            notify_users([self.user.pk], title='Invoice', payload={'kind': 'invoice_paid'})
            self.assertEqual(broadcast.call_count, 2)
            self.assertEqual(push.call_count, 1)

    def test_invoice_email_publication_is_hidden_but_other_email_remains_visible(self):
        invoice = Notification.objects.create(user=self.user, title='Invoice #1', payload={'notification_kind': 'email_notification', 'template_name': 'emails/invoice_sent.html'})
        ordinary = Notification.objects.create(user=self.user, title='Welcome', payload={'notification_kind': 'email_notification', 'template_name': 'emails/welcome.html'})
        ids = [row['id'] for row in self.client.get(URL).json()['results']]
        self.assertNotIn(invoice.id, ids)
        self.assertIn(ordinary.id, ids)
