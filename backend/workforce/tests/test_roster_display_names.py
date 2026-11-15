"""Invited staff can have neither a name nor a username; the roster still loads and shows their email."""
from datetime import date

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from client_profile.characterization_support import make_owner_with_pharmacy, make_user
from memberships.models import Membership


class RosterDisplayNameTests(TestCase):
    def test_grid_with_email_only_invitee_returns_200_and_shows_the_email(self):
        owner, pharmacy = make_owner_with_pharmacy('Roster Display Names')
        invitee = get_user_model().objects.create(username=None, email='invitee@example.invalid', role='PHARMACIST')
        named = make_user('PHARMACIST')
        week_start = date(2026, 10, 5)
        for user in (invitee, named):  # equal (zero) totals, so the staff sort compares the names
            Membership.objects.create(user=user, pharmacy=pharmacy, role='PHARMACIST', employment_type='FULL_TIME',
                                      status=Membership.Status.ACCEPTED, is_active=True)
        client = APIClient()
        client.force_authenticate(owner)
        response = client.get('/api/v1/attendance/roster/period/',
                              {'pharmacy_id': pharmacy.pk, 'week_start': week_start.isoformat()})
        self.assertEqual(response.status_code, 200)
        data = response.json()
        names = {row['worker_id']: row['worker_name'] for row in data['staff_view']}
        self.assertEqual(names[invitee.pk], 'invitee@example.invalid')
