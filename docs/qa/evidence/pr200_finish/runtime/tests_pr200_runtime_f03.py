"""PR200 audit, runtime check of F03-N1 (copied into client_profile/ in the pr200 container only).

Negative test must FAIL on baseline b77e9fd2 if the finding is real.
"""
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from client_profile.models import Membership, OwnerOnboarding, Organization, Pharmacy, PharmacyAdmin


class F03N1RemovedAdminReacceptTests(TestCase):
    def setUp(self):
        User = get_user_model()
        org = Organization.objects.create(name='F03 Group')
        self.owner = User.objects.create_user(email='f03-owner@example.com', password='Password123!', role='OWNER')
        profile = OwnerOnboarding.objects.create(user=self.owner, role='PHARMACIST', phone_number='0400000099', organization=org)
        self.pharmacy = Pharmacy.objects.create(name='F03 Pharmacy', owner=profile, organization=org)
        self.staff = User.objects.create_user(email='f03-mia@example.com', password='Password123!', role='OTHER_STAFF')
        self.membership = Membership.objects.create(
            user=self.staff, pharmacy=self.pharmacy, role='ASSISTANT',
            employment_type='FULL_TIME', is_active=True, status=Membership.Status.ACCEPTED,
        )
        self.client = APIClient()

    def invite_as_owner(self):
        self.client.force_authenticate(user=self.owner)
        with patch('organizations.views.async_task'):
            return self.client.post('/api/v1/pharmacy-admins/', {
                'pharmacy': self.pharmacy.id, 'email': self.staff.email,
                'admin_level': 'MANAGER', 'staff_role': 'ASSISTANT', 'job_title': 'Manager',
            }, format='json')

    def test_positive_control_fresh_invite_accepts_and_stranger_is_refused(self):
        self.assertEqual(self.invite_as_owner().status_code, 201)
        assignment = PharmacyAdmin.objects.get(user=self.staff, pharmacy=self.pharmacy)
        self.assertFalse(assignment.is_active)

        stranger = get_user_model().objects.create_user(email='f03-stranger@example.com', password='Password123!', role='OTHER_STAFF')
        self.client.force_authenticate(user=stranger)
        self.assertEqual(self.client.post(f'/api/v1/pharmacy-admins/{assignment.id}/accept-invitation/').status_code, 404)

        self.client.force_authenticate(user=self.staff)
        pending = self.client.get('/api/v1/pharmacy-admins/my-pending-invitations/')
        self.assertEqual([row['id'] for row in pending.data], [assignment.id])
        self.assertEqual(self.client.post(f'/api/v1/pharmacy-admins/{assignment.id}/accept-invitation/').status_code, 200)
        assignment.refresh_from_db()
        self.assertTrue(assignment.is_active)

    def test_negative_removed_admin_cannot_reaccept_old_invitation(self):
        # Mia accepts a real invite and is an active Manager.
        self.assertEqual(self.invite_as_owner().status_code, 201)
        assignment = PharmacyAdmin.objects.get(user=self.staff, pharmacy=self.pharmacy)
        self.client.force_authenticate(user=self.staff)
        self.assertEqual(self.client.post(f'/api/v1/pharmacy-admins/{assignment.id}/accept-invitation/').status_code, 200)
        assignment.refresh_from_db()
        self.assertTrue(assignment.is_active)

        # Owner removes her admin role; she stays on staff.
        self.client.force_authenticate(user=self.owner)
        self.assertEqual(self.client.delete(f'/api/v1/pharmacy-admins/{assignment.id}/').status_code, 204)
        assignment.refresh_from_db()
        self.membership.refresh_from_db()
        self.assertFalse(assignment.is_active)
        self.assertEqual(self.membership.status, Membership.Status.ACCEPTED)
        self.assertTrue(self.membership.is_active)

        # Mia, with no fresh grant from the owner.
        self.client.force_authenticate(user=self.staff)
        pending = self.client.get('/api/v1/pharmacy-admins/my-pending-invitations/')
        accept = self.client.post(f'/api/v1/pharmacy-admins/{assignment.id}/accept-invitation/')
        assignment.refresh_from_db()
        me = self.client.get('/api/v1/users/me/')
        observed = (
            f'pending_ids={[row["id"] for row in pending.data]} accept_status={accept.status_code} '
            f'assignment.is_active={assignment.is_active} '
            f'me.admin_assignments={[(a.get("pharmacy_id"), a.get("admin_level")) for a in me.data.get("admin_assignments", [])]}'
        )
        print(f'\nF03-N1 OBSERVED: {observed}')
        self.assertEqual(pending.data, [], observed)
        self.assertEqual(accept.status_code, 404, observed)
        self.assertFalse(assignment.is_active, observed)
