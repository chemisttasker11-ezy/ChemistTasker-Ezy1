"""Owner rule: joining a pharmacy team or organisation by invitation never needs an AHPRA number or verification;
AHPRA only gates the public platform, and a suspended member keeps internal access but can't become publicly verified."""
from datetime import timedelta
from unittest.mock import patch

from django.core.cache import caches
from django.test import override_settings
from django.utils import timezone

from client_profile.characterization_support import client_for, make_assignment, make_user
from memberships.models import Membership
from memberships.test_membership_workflows_contract import MembershipFixture
from onboarding.models import PharmacistOnboarding
from onboarding.test_ahpra_desktop import TEST_CACHES, check_fixture, profile_fixture
from onboarding.verification.policy import refresh_verified
from onboarding.verification.state import ahpra_frozen
from shifts.models import ShiftInterest, ShiftSlotAssignment


@override_settings(CACHES=TEST_CACHES)
class AhpraOptionalMembershipTests(MembershipFixture):
    def setUp(self):
        super().setUp()
        caches['ahpra'].clear()

    def internal_shift(self, visibility='FULL_PART_TIME'):
        shift, _, assignment = make_assignment(self.pharmacy, self.owner, self.owner,
                                               timezone.localdate() + timedelta(days=5))
        assignment.delete()
        shift.role_needed, shift.visibility = 'PHARMACIST', visibility
        shift.save(update_fields=['role_needed', 'visibility'])
        return shift

    def post(self, user, path):
        with patch('shifts.interest.async_task'), patch('shifts.browse.async_task'):
            return client_for(user).post(f'/api/v1/{path}', {}, format='json')

    def invite_and_accept(self, inviter):
        worker = make_user('PHARMACIST')  # no onboarding profile, so no AHPRA number at all
        response, _ = self.call(inviter, 'post', 'memberships/', {
            'pharmacy': self.pharmacy.id, 'email': worker.email, 'role': 'PHARMACIST', 'employment_type': 'FULL_TIME',
            'job_title': 'Pharmacist'})
        self.assertEqual(response.status_code, 201, response.data)
        membership = Membership.objects.get(user=worker, pharmacy=self.pharmacy)
        response, _ = self.call(worker, 'post', f'my-memberships/{membership.id}/accept/')
        self.assertEqual(response.status_code, 200, response.data)
        membership.refresh_from_db()
        self.assertEqual((membership.status, membership.is_active), (Membership.Status.ACCEPTED, True))
        self.assertFalse(PharmacistOnboarding.objects.filter(user=worker).exists())
        return worker

    def assert_internal_access(self, worker):
        shift = self.internal_shift()
        self.assertIn(self.post(worker, f'shifts/{shift.pk}/express_interest/').status_code, (200, 201))
        self.assertTrue(ShiftInterest.objects.filter(shift=shift, user=worker).exists())
        shift = self.internal_shift()
        response = self.post(worker, f'community-shifts/{shift.pk}/claim-shift/')
        self.assertIn(response.status_code, (200, 201), response.content)
        self.assertTrue(ShiftSlotAssignment.objects.filter(shift=shift, user=worker).exists())

    def test_owner_invitation_accepted_without_ahpra_number_gives_internal_access(self):
        self.assert_internal_access(self.invite_and_accept(self.owner))

    def test_org_admin_invitation_accepted_without_ahpra_number_gives_internal_access(self):
        self.assert_internal_access(self.invite_and_accept(self.org_admin()))

    def test_member_without_ahpra_number_expresses_interest_and_claims_internal_shift(self):
        worker, _ = self.member(employment_type='FULL_TIME')
        PharmacistOnboarding.objects.create(user=worker)  # profile started, AHPRA left blank
        self.assert_internal_access(worker)

    def test_suspended_member_cannot_complete_public_onboarding_but_keeps_internal_access(self):
        profile = profile_fixture()
        worker = profile.user
        worker.is_otp_verified = worker.is_mobile_verified = True
        worker.save(update_fields=['is_otp_verified', 'is_mobile_verified'])
        Membership.objects.create(user=worker, pharmacy=self.pharmacy, role='PHARMACIST', employment_type='FULL_TIME',
                                  status=Membership.Status.ACCEPTED, is_active=True, invited_by=self.owner)
        check_fixture(profile, status='done', outcome='rejected', completed_at=timezone.now(),
                      register_data={'registration_status': 'Suspended'})
        profile.ahpra_verified = True  # every other requirement met: suspension alone keeps Verified off
        profile.save(update_fields=['ahpra_verified'])
        self.assertFalse(refresh_verified(profile))
        profile.refresh_from_db()
        self.assertFalse(profile.verified)
        public = self.internal_shift(visibility='PLATFORM')
        public.post_anonymously = True  # reached as a public worker, not as this pharmacy's member
        public.save(update_fields=['post_anonymously'])
        response = self.post(worker, f'shifts/{public.pk}/express_interest/')
        self.assertEqual((response.status_code, response.json()['code']), (403, 'ahpra_suspended'))
        self.assertFalse(ShiftInterest.objects.filter(shift=public, user=worker).exists())
        self.assertFalse(ahpra_frozen(worker))
        self.assert_internal_access(worker)
