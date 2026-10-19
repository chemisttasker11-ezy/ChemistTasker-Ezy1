"""Every worker application entry point returns the same not-found refusal."""
from datetime import timedelta

from django.core.cache import caches
from django.test import TestCase, override_settings
from django.utils import timezone

from client_profile.characterization_support import client_for, make_assignment, make_owner_with_pharmacy
from onboarding.models import AhpraCheck
from onboarding.test_ahpra_desktop import TEST_CACHES, check_fixture, profile_fixture
from onboarding.verification.state import ahpra_state
from shifts.models import ShiftCounterOffer, ShiftInterest, ShiftOffer, ShiftSlotAssignment


@override_settings(CACHES=TEST_CACHES)
class AhpraApplicationGateTests(TestCase):
    def setUp(self):
        caches['ahpra'].clear()
        self.profile = profile_fixture()
        self.user = self.profile.user
        self.check = check_fixture(self.profile, status='done', outcome='not_found',
                                   completed_at=timezone.now())
        owner, pharmacy = make_owner_with_pharmacy()
        self.shift, self.slot, assignment = make_assignment(
            pharmacy, owner, self.user, timezone.localdate() + timedelta(days=5))
        self.shift.role_needed = 'PHARMACIST'
        self.shift.save(update_fields=['role_needed'])
        assignment.delete()
        self.offer = ShiftOffer.objects.create(shift=self.shift, user=self.user, slot=self.slot)
        self.client = client_for(self.user)

    def refused(self, path):
        response = self.client.post(f'/api/v1/{path}', {}, format='json')
        self.assertEqual(response.status_code, 403, response.content)
        self.assertEqual(response.json(), {'code': 'ahpra_not_found', 'detail': ahpra_state(self.profile)['note']})
        self.assertFalse(ShiftInterest.objects.filter(user=self.user).exists())
        self.assertFalse(ShiftCounterOffer.objects.filter(user=self.user).exists())
        self.assertFalse(ShiftSlotAssignment.objects.filter(user=self.user).exists())
        self.offer.refresh_from_db()
        self.assertEqual(self.offer.status, ShiftOffer.Status.PENDING)

    def test_not_found_blocks_express_interest(self):
        self.refused(f'shifts/{self.shift.pk}/express_interest/')

    def test_not_found_blocks_counter_offer(self):
        self.refused(f'shifts/{self.shift.pk}/counter-offers/')

    def test_not_found_blocks_claim(self):
        self.refused(f'community-shifts/{self.shift.pk}/claim-shift/')

    def test_not_found_blocks_offer_accept(self):
        self.refused(f'shift-offers/{self.offer.pk}/accept/')

    def test_not_found_does_not_freeze_other_endpoints(self):
        self.assertEqual(self.client.get('/api/v1/shift-saved/').status_code, 200)

    def test_old_number_not_found_does_not_block_corrected_number(self):
        self.profile.ahpra_number = 'PHA0007654321'
        self.profile.save(update_fields=['ahpra_number'])
        from onboarding.verification.state import require_ahpra_application
        require_ahpra_application(self.user)

    def test_registered_needing_review_does_not_get_not_found_error(self):
        AhpraCheck.objects.filter(pk=self.check.pk).update(
            outcome='review', register_data={'registration_status': 'Registered'})
        from onboarding.verification.state import require_ahpra_application
        require_ahpra_application(self.user)
