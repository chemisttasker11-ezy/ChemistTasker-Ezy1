"""The authenticated current-user endpoint must restore newcomer subtype, not just JWT responses."""
from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from onboarding.models import ExplorerOnboarding


class CurrentUserNewcomerContractTests(TestCase):
    def test_session_membership_ids_allow_leave_without_exposing_other_memberships(self):
        from datetime import timedelta
        from django.utils import timezone
        from client_profile.characterization_support import make_owner_with_pharmacy, make_user
        from memberships.models import Membership

        _, pharmacy = make_owner_with_pharmacy("Leave pharmacy")
        worker, other = make_user("PHARMACIST"), make_user("PHARMACIST")
        membership = Membership.objects.create(user=worker, pharmacy=pharmacy, role="PHARMACIST",
            employment_type="FULL_TIME", status="ACCEPTED", is_active=True)
        foreign = Membership.objects.create(user=other, pharmacy=pharmacy, role="PHARMACIST",
            employment_type="FULL_TIME", status="ACCEPTED", is_active=True)
        client = APIClient()
        client.force_authenticate(worker)
        response = client.get('/api/v1/users/me/')
        rows = response.data['memberships']
        self.assertEqual([row.get('id') for row in rows], [membership.pk])
        start = timezone.now() + timedelta(days=7)
        payload = {'membership_id': foreign.pk, 'leave_type': 'ANNUAL',
            'start_at': start.isoformat(), 'end_at': (start + timedelta(hours=8)).isoformat()}
        self.assertEqual(client.post('/api/v1/workforce/leave/', payload, format='json').status_code, 403)
        payload['membership_id'] = rows[0]['id']
        allowed = client.post('/api/v1/workforce/leave/', payload, format='json')
        self.assertEqual(allowed.status_code, 201, allowed.data)

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
