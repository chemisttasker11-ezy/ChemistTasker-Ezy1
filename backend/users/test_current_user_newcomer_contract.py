"""The authenticated current-user endpoint must restore newcomer subtype, not just JWT responses."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from onboarding.models import ExplorerOnboarding


class CurrentUserNewcomerContractTests(TestCase):
    def test_me_restores_overseas_and_junior_subtypes_without_leaking_to_other_roles(self):
        user_model = get_user_model()
        overseas = user_model.objects.create_user(email='restore-overseas@example.test', role='EXPLORER')
        junior = user_model.objects.create_user(email='restore-junior@example.test', role='EXPLORER')
        pharmacist = user_model.objects.create_user(email='restore-pharmacist@example.test', role='PHARMACIST')
        ExplorerOnboarding.objects.create(user=overseas, role_type='OVERSEAS')
        ExplorerOnboarding.objects.create(user=junior, role_type='JUNIOR')

        client = APIClient()
        for user, expected in ((overseas, 'OVERSEAS'), (junior, 'JUNIOR'), (pharmacist, None)):
            with self.subTest(role=user.role, expected=expected):
                client.force_authenticate(user)
                response = client.get('/api/v1/users/me/')
                self.assertEqual(response.status_code, 200, response.data)
                self.assertIn('newcomer_type', response.data)
                self.assertEqual(response.data['newcomer_type'], expected)
