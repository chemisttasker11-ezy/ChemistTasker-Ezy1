"""Preserve permission/parsing precedence when HTTP adapters delegate billing workflows."""
from unittest.mock import patch

from django.test import TestCase

from billing.models import OwnerSubscription, ShiftPayment
from client_profile.characterization_support import client_for, make_owner_with_pharmacy, make_user
from shifts.models import Shift


class BillingHttpBoundaryContracts(TestCase):
    def setUp(self):
        self.owner, pharmacy = make_owner_with_pharmacy("Billing boundary")
        self.outsider = make_user("PHARMACIST")
        self.shift = Shift.objects.create(pharmacy=pharmacy, created_by=self.owner,
                                          role_needed="PHARMACIST", employment_type="LOCUM")

    def malformed(self, user, path):
        return client_for(user).post(path, data='{broken', content_type='application/json')

    def test_shift_authority_precedes_json_parsing(self):
        for route in ('charge-fulfillment', 'charge-penalty'):
            with self.subTest(route=route), patch('stripe.checkout.Session.create') as provider:
                response = self.malformed(self.outsider, f'/api/v1/billing/{route}/{self.shift.pk}/')
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.data, {'error': 'Not authorized to pay charges for this shift.'})
                provider.assert_not_called()
        self.assertFalse(ShiftPayment.objects.exists())
        self.assertFalse(OwnerSubscription.objects.exists())

    def test_missing_shift_precedes_json_parsing(self):
        for route in ('charge-fulfillment', 'charge-penalty'):
            with self.subTest(route=route), patch('stripe.checkout.Session.create') as provider:
                response = self.malformed(self.owner, f'/api/v1/billing/{route}/{self.shift.pk + 1000}/')
                self.assertEqual(response.status_code, 404)
                provider.assert_not_called()

    def test_permitted_shift_actor_still_gets_json_validation_before_provider_call(self):
        for route in ('charge-fulfillment', 'charge-penalty'):
            with self.subTest(route=route), patch('stripe.checkout.Session.create') as provider:
                response = self.malformed(self.owner, f'/api/v1/billing/{route}/{self.shift.pk}/')
                self.assertEqual(response.status_code, 400)
                self.assertIn('JSON parse error', str(response.data))
                provider.assert_not_called()
        self.assertFalse(ShiftPayment.objects.exists())
        self.assertFalse(OwnerSubscription.objects.exists())

    def test_subscription_checkout_retains_earlier_json_parsing(self):
        with patch('stripe.Customer.create') as provider:
            response = self.malformed(self.outsider, '/api/v1/billing/subscribe/')
        self.assertEqual(response.status_code, 400)
        self.assertIn('JSON parse error', str(response.data))
        provider.assert_not_called()
        self.assertFalse(OwnerSubscription.objects.exists())

    def test_seat_validation_precedes_missing_account_context(self):
        with patch('stripe.Subscription.retrieve') as provider:
            response = client_for(self.outsider).post('/api/v1/billing/subscription/seats/',
                                                       {'staff_count': 'invalid'}, format='json')
        self.assertEqual(response.status_code, 400)
        self.assertEqual(response.data, {'error': 'staff_count must be a valid integer.'})
        provider.assert_not_called()
