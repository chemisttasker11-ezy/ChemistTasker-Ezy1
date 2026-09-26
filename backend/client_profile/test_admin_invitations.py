from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from client_profile.models import Membership, Organization, Pharmacy, PharmacyAdmin
from users.models import OrganizationMembership


class AdditionalAdminInvitationTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name='Admin Invitation Group')
        self.pharmacy = Pharmacy.objects.create(name='Invitation Pharmacy', organization=self.organization)
        self.inviter = get_user_model().objects.create_user(
            email='org-admin@example.com', password='Password123!', role='ORGANIZATION'
        )
        OrganizationMembership.objects.create(
            user=self.inviter, organization=self.organization,
            role='ORG_ADMIN', admin_level='MANAGER',
        )
        self.client = APIClient()
        self.client.force_authenticate(user=self.inviter)

    def invite(self, email, admin_level='MANAGER'):
        with patch('client_profile.views.async_task'):
            return self.client.post('/api/client-profile/pharmacy-admins/', {
                'pharmacy': self.pharmacy.id,
                'email': email,
                'admin_level': admin_level,
                'staff_role': 'PHARMACIST',
                'job_title': 'Manager',
            }, format='json')

    def test_existing_owner_keeps_persona_and_staff_membership_until_admin_acceptance(self):
        target = get_user_model().objects.create_user(
            email='other-owner@example.com', password='Password123!', role='OWNER'
        )
        membership = Membership.objects.create(
            user=target, pharmacy=self.pharmacy, role='CONTACT',
            employment_type='FULL_TIME', is_active=True, status=Membership.Status.ACCEPTED,
        )
        response = self.invite(target.email)
        self.assertEqual(response.status_code, 201)
        target.refresh_from_db()
        membership.refresh_from_db()
        self.assertEqual(target.role, 'OWNER')
        self.assertEqual(membership.status, Membership.Status.ACCEPTED)
        self.assertTrue(membership.is_active)
        assignment = PharmacyAdmin.objects.get(user=target, pharmacy=self.pharmacy)
        self.assertFalse(assignment.is_active)

        self.client.force_authenticate(user=target)
        me_before = self.client.get('/api/users/me/')
        self.assertEqual(me_before.status_code, 200)
        self.assertEqual(me_before.data['admin_assignments'], [])
        memberships_before = self.client.get('/api/client-profile/my-memberships/')
        self.assertEqual(memberships_before.status_code, 200)
        current_membership = next(item for item in memberships_before.data['results'] if item['id'] == membership.id)
        self.assertFalse(current_membership['is_pharmacy_admin'])
        self.assertIsNone(current_membership['admin_level'])
        self.assertEqual(current_membership['admin_capabilities'], [])
        pending = self.client.get('/api/client-profile/pharmacy-admins/my-pending-invitations/')
        self.assertEqual(pending.status_code, 200)
        self.assertEqual(pending.data[0]['id'], assignment.id)
        accepted = self.client.post(f'/api/client-profile/pharmacy-admins/{assignment.id}/accept-invitation/')
        self.assertEqual(accepted.status_code, 200)
        assignment.refresh_from_db()
        self.assertTrue(assignment.is_active)
        me_after = self.client.get('/api/users/me/')
        self.assertEqual(me_after.status_code, 200)
        self.assertEqual(len(me_after.data['admin_assignments']), 1)
        self.assertEqual(me_after.data['admin_assignments'][0]['pharmacy_id'], self.pharmacy.pk)
        self.assertIn(PharmacyAdmin.CAPABILITY_MANAGE_ROSTER, me_after.data['admin_assignments'][0]['capabilities'])
        memberships_after = self.client.get('/api/client-profile/my-memberships/')
        accepted_membership = next(item for item in memberships_after.data['results'] if item['id'] == membership.id)
        self.assertTrue(accepted_membership['is_pharmacy_admin'])
        self.assertEqual(accepted_membership['admin_level'], 'MANAGER')
        target.refresh_from_db()
        self.assertEqual(target.role, 'OWNER')

    def test_existing_explorer_can_accept_new_pharmacy_admin_membership(self):
        target = get_user_model().objects.create_user(
            email='explorer-admin@example.com', password='Password123!', role='EXPLORER'
        )
        response = self.invite(target.email)
        self.assertEqual(response.status_code, 201)
        membership = Membership.objects.get(user=target, pharmacy=self.pharmacy)
        assignment = PharmacyAdmin.objects.get(user=target, pharmacy=self.pharmacy)
        self.assertEqual(membership.role, 'CONTACT')
        self.assertEqual(membership.status, Membership.Status.PENDING)
        self.assertFalse(assignment.is_active)
        self.client.force_authenticate(user=target)
        accepted = self.client.post(f'/api/client-profile/pharmacy-admins/{assignment.id}/accept-invitation/')
        self.assertEqual(accepted.status_code, 200)
        membership.refresh_from_db()
        assignment.refresh_from_db()
        self.assertEqual(target.role, 'EXPLORER')
        self.assertEqual(membership.status, Membership.Status.ACCEPTED)
        self.assertTrue(membership.is_active)
        self.assertTrue(assignment.is_active)

    def test_rejecting_admin_does_not_remove_accepted_membership(self):
        target = get_user_model().objects.create_user(
            email='staff@example.com', password='Password123!', role='OTHER_STAFF'
        )
        membership = Membership.objects.create(
            user=target, pharmacy=self.pharmacy, role='ASSISTANT',
            employment_type='FULL_TIME', is_active=True, status=Membership.Status.ACCEPTED,
        )
        self.assertEqual(self.invite(target.email).status_code, 201)
        assignment = PharmacyAdmin.objects.get(user=target, pharmacy=self.pharmacy)
        self.client.force_authenticate(user=target)
        rejected = self.client.post(f'/api/client-profile/pharmacy-admins/{assignment.id}/reject-invitation/')
        self.assertEqual(rejected.status_code, 200)
        self.assertFalse(PharmacyAdmin.objects.filter(pk=assignment.pk).exists())
        membership.refresh_from_db()
        self.assertEqual(membership.status, Membership.Status.ACCEPTED)
        self.assertTrue(membership.is_active)

    def test_owner_level_remains_reserved_for_actual_pharmacy_owner(self):
        target = get_user_model().objects.create_user(
            email='not-owner@example.com', password='Password123!', role='OWNER'
        )
        self.assertEqual(self.invite(target.email, admin_level='OWNER').status_code, 400)
        self.assertFalse(PharmacyAdmin.objects.filter(user=target).exists())

    def test_reinviting_active_admin_does_not_suspend_existing_access(self):
        target = get_user_model().objects.create_user(
            email='active-admin@example.com', password='Password123!', role='OTHER_STAFF'
        )
        membership = Membership.objects.create(
            user=target, pharmacy=self.pharmacy, role='ASSISTANT',
            employment_type='FULL_TIME', is_active=True, status=Membership.Status.ACCEPTED,
        )
        assignment = PharmacyAdmin.objects.create(
            user=target, pharmacy=self.pharmacy, membership=membership,
            admin_level='MANAGER', staff_role='PHARMACIST', is_active=True,
        )
        self.assertEqual(self.invite(target.email).status_code, 409)
        assignment.refresh_from_db()
        self.assertTrue(assignment.is_active)
