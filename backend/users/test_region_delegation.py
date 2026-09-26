from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import TestCase
from rest_framework.test import APIClient

from client_profile.models import Organization, Pharmacy
from users.models import OrganizationMembership


class RegionDelegationTests(TestCase):
    def setUp(self):
        self.organization = Organization.objects.create(name='Regional Group')
        self.pharmacy = Pharmacy.objects.create(name='North Pharmacy', organization=self.organization)
        self.other_pharmacy = Pharmacy.objects.create(name='South Pharmacy', organization=self.organization)
        self.actor = get_user_model().objects.create_user(
            email='region@example.com', password='Password123!', role='ORG_STAFF'
        )
        self.membership = OrganizationMembership.objects.create(
            user=self.actor,
            organization=self.organization,
            role='REGION_ADMIN',
            admin_level='ROSTER_MANAGER',
            region='North',
            job_title='Regional Lead',
        )
        self.membership.pharmacies.add(self.pharmacy)
        self.client = APIClient()
        self.client.force_authenticate(user=self.actor)

    def invite(self, email='delegate@example.com', **overrides):
        payload = {
            'email': email,
            'organization': self.organization.id,
            'role': 'REGION_ADMIN',
            'admin_level': 'ROSTER_MANAGER',
            'region': 'North',
            'job_title': 'Regional Delegate',
            'pharmacies': [self.pharmacy.id],
        }
        payload.update(overrides)
        with patch('users.views.async_task'):
            return self.client.post('/api/users/invite-org-user/', payload, content_type='application/json')

    def test_region_can_invite_sub_region_within_same_scope_and_level(self):
        response = self.invite()
        self.assertEqual(response.status_code, 201)
        delegate = get_user_model().objects.get(email='delegate@example.com')
        self.assertEqual(delegate.role, 'ORG_STAFF')
        membership = OrganizationMembership.objects.get(user=delegate, organization=self.organization)
        self.assertEqual(membership.role, 'REGION_ADMIN')
        self.assertEqual(list(membership.pharmacies.values_list('id', flat=True)), [self.pharmacy.id])

    def test_region_cannot_grant_higher_role_level_region_or_pharmacy_scope(self):
        invalid = [
            {'role': 'ORG_ADMIN'},
            {'role': 'CHIEF_ADMIN'},
            {'admin_level': 'MANAGER'},
            {'region': 'South'},
            {'pharmacies': [self.other_pharmacy.id]},
        ]
        for index, change in enumerate(invalid):
            with self.subTest(change=change):
                response = self.invite(email=f'blocked-{index}@example.com', **change)
                self.assertEqual(response.status_code, 403)
                self.assertFalse(get_user_model().objects.filter(email=f'blocked-{index}@example.com').exists())

    def test_region_cannot_overwrite_higher_existing_org_membership(self):
        target = get_user_model().objects.create_user(
            email='chief@example.com', password='Password123!', role='ORG_STAFF'
        )
        membership = OrganizationMembership.objects.create(
            user=target, organization=self.organization, role='CHIEF_ADMIN',
            admin_level='MANAGER', region='North', job_title='Chief'
        )
        membership.pharmacies.add(self.pharmacy)
        response = self.invite(email=target.email)
        self.assertEqual(response.status_code, 403)
        membership.refresh_from_db()
        self.assertEqual(membership.role, 'CHIEF_ADMIN')

    def test_region_cannot_take_over_unassigned_membership(self):
        target = get_user_model().objects.create_user(
            email='unassigned@example.com', password='Password123!', role='ORG_STAFF'
        )
        membership = OrganizationMembership.objects.create(
            user=target, organization=self.organization, role='REGION_ADMIN',
            admin_level='ROSTER_MANAGER', region='North', job_title='Unassigned'
        )
        response = self.invite(email=target.email)
        self.assertEqual(response.status_code, 403)
        self.assertFalse(membership.pharmacies.exists())

    def test_region_cannot_promote_self_or_expand_scope_through_patch(self):
        path = f'/api/users/organization-memberships/{self.membership.id}/'
        promote = self.client.patch(path, {'role': 'ORG_ADMIN'}, content_type='application/json')
        expand = self.client.patch(
            path, {'pharmacy_ids': [self.pharmacy.id, self.other_pharmacy.id]},
            content_type='application/json'
        )
        self.assertEqual(promote.status_code, 403)
        self.assertEqual(expand.status_code, 403)
        self.membership.refresh_from_db()
        self.assertEqual(self.membership.role, 'REGION_ADMIN')
        self.assertEqual(set(self.membership.pharmacies.values_list('id', flat=True)), {self.pharmacy.id})

    def test_region_can_edit_scoped_peer_but_cannot_delete_chief(self):
        target = get_user_model().objects.create_user(
            email='peer@example.com', password='Password123!', role='ORG_STAFF'
        )
        peer = OrganizationMembership.objects.create(
            user=target, organization=self.organization, role='REGION_ADMIN',
            admin_level='COMMUNICATION_MANAGER', region='North', job_title='Peer'
        )
        peer.pharmacies.add(self.pharmacy)
        path = f'/api/users/organization-memberships/{peer.id}/'
        update = self.client.patch(path, {'job_title': 'Updated Peer'}, content_type='application/json')
        self.assertEqual(update.status_code, 200)
        peer.refresh_from_db()
        self.assertEqual(peer.job_title, 'Updated Peer')

        chief_user = get_user_model().objects.create_user(
            email='chief-2@example.com', password='Password123!', role='ORG_STAFF'
        )
        chief = OrganizationMembership.objects.create(
            user=chief_user, organization=self.organization, role='CHIEF_ADMIN',
            admin_level='MANAGER', region='North', job_title='Chief'
        )
        chief.pharmacies.add(self.pharmacy)
        deletion = self.client.delete(f'/api/users/organization-memberships/{chief.id}/')
        self.assertEqual(deletion.status_code, 403)
        self.assertTrue(OrganizationMembership.objects.filter(id=chief.id).exists())

    def test_chief_can_promote_self_to_org_admin(self):
        self.membership.role = 'CHIEF_ADMIN'
        self.membership.admin_level = 'MANAGER'
        self.membership.save(update_fields=['role', 'admin_level'])
        response = self.client.patch(
            f'/api/users/organization-memberships/{self.membership.id}/',
            {'role': 'ORG_ADMIN'}, content_type='application/json'
        )
        self.assertEqual(response.status_code, 200)
        self.membership.refresh_from_db()
        self.assertEqual(self.membership.role, 'ORG_ADMIN')

    def test_chief_can_delegate_scoped_region_but_not_org_admin_to_others(self):
        self.membership.role = 'CHIEF_ADMIN'
        self.membership.admin_level = 'MANAGER'
        self.membership.save(update_fields=['role', 'admin_level'])
        allowed = self.invite(email='chief-delegate@example.com')
        self.assertEqual(allowed.status_code, 201)
        elevated = self.invite(email='too-high@example.com', role='ORG_ADMIN')
        self.assertEqual(elevated.status_code, 403)
        expanded = self.invite(email='outside@example.com', pharmacies=[self.other_pharmacy.id])
        self.assertEqual(expanded.status_code, 403)

    def test_org_admin_payload_lists_only_verified_org_pharmacies(self):
        outside_org = Organization.objects.create(name='Other Group')
        outside_pharmacy = Pharmacy.objects.create(name='Outside Pharmacy', organization=outside_org)
        region_response = self.client.get('/api/users/me/')
        region_membership = next(item for item in region_response.data['memberships'] if item.get('role') == 'REGION_ADMIN')
        self.assertEqual(region_membership['organization_pharmacies'], [])

        self.membership.role = 'ORG_ADMIN'
        self.membership.save(update_fields=['role'])
        response = self.client.get('/api/users/me/')
        self.assertEqual(response.status_code, 200)
        org_membership = next(item for item in response.data['memberships'] if item.get('role') == 'ORG_ADMIN')
        listed_ids = {item['id'] for item in org_membership['organization_pharmacies']}
        self.assertEqual(listed_ids, {self.pharmacy.id, self.other_pharmacy.id})
        self.assertNotIn(outside_pharmacy.id, listed_ids)
