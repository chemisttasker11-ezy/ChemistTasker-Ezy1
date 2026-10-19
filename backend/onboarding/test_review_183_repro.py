"""Repro tests for the PR #183 senior review. Each test FAILS when the reported defect is real."""
from datetime import time, timedelta
from types import SimpleNamespace
from unittest.mock import MagicMock, patch

from django.contrib.admin.sites import AdminSite
from django.core.cache import caches
from django.test import TestCase, override_settings
from django.utils import timezone

from client_profile.characterization_support import client_for, make_assignment, make_owner_with_pharmacy, make_user
from onboarding.admin import AhpraCheckAdmin
from onboarding.models import AhpraCheck, PharmacistOnboarding
from onboarding.serializers import PharmacistOnboardingV2Serializer
from onboarding.test_ahpra_desktop import NUMBER, TEST_CACHES, check_fixture, profile_fixture, result
from onboarding.verification.desktop import apply_ahpra_result, claim_checks, handle_verifier_result
from onboarding.verification.state import ahpra_frozen, ahpra_state, queue_public_recheck
from shifts.models import ShiftOffer, ShiftSlot, ShiftSlotAssignment


ACCEPT = {'engagement_terms_accepted': True, 'independent_contractor_status_confirmed': True}


@override_settings(AHPRA_SOURCE='desktop', CACHES=TEST_CACHES,
                   CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}},
                   EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend')
class Review183Repro(TestCase):
    def setUp(self):
        caches['ahpra'].clear()
        self.profile = profile_fixture()
        self.user = self.profile.user
        self.user.is_otp_verified = self.user.is_mobile_verified = True
        self.user.save(update_fields=['is_otp_verified', 'is_mobile_verified'])
        self.client = client_for(self.user)

    def suspend(self):
        check = check_fixture(self.profile)
        apply_ahpra_result(check, result(check.pk, registration_status='Suspended'))
        self.assertTrue(ahpra_frozen(self.user))

    def public_offer(self):
        owner, pharmacy = make_owner_with_pharmacy()
        shift, slot, assignment = make_assignment(pharmacy, owner, self.user, timezone.localdate() + timedelta(days=5))
        shift.role_needed = 'PHARMACIST'
        shift.save(update_fields=['role_needed'])
        assignment.delete()
        PharmacistOnboarding.objects.filter(pk=self.profile.pk).update(
            payment_preference='ABN', abn='51824753556', abn_verified=True, abn_entity_confirmed=True)
        return ShiftOffer.objects.create(shift=shift, user=self.user, slot=slot)

    # 1
    def test_f1_suspended_worker_cannot_clear_number_and_accept_public_offer(self):
        self.suspend()
        patch_response = self.client.patch('/api/v1/pharmacist/onboarding/me/',
                                           {'tab': 'basic', 'ahpra_number': ''}, format='json')
        offer = self.public_offer()
        response = self.client.post(f'/api/v1/shift-offers/{offer.pk}/accept/', ACCEPT, format='json')
        offer.refresh_from_db()
        self.assertEqual(offer.status, ShiftOffer.Status.PENDING,
                         f'patch={patch_response.status_code} accept={response.status_code} {response.content[:200]}')

    # 3
    def test_f3_admin_reject_of_verified_registered_check_removes_verified(self):
        check = check_fixture(self.profile, status='done', outcome='verified', completed_at=timezone.now(),
                              register_data={'registration_status': 'Registered', 'registration_type': 'General',
                                             'expiry_date': '2099-01-02'})
        self.profile.verified = self.profile.ahpra_verified = True
        self.profile.save(update_fields=['verified', 'ahpra_verified'])
        AhpraCheckAdmin(AhpraCheck, AdminSite()).mark_rejected(
            SimpleNamespace(user=self.user), AhpraCheck.objects.filter(pk=check.pk))
        self.profile.refresh_from_db()
        offer = self.public_offer()
        response = self.client.post(f'/api/v1/shift-offers/{offer.pk}/accept/', ACCEPT, format='json')
        self.assertFalse(self.profile.verified,
                         f"state={ahpra_state(self.profile)['state']} accept={response.status_code}")

    # 4
    @override_settings(AHPRA_SOURCE='scrapingbee')
    def test_f4_scrapingbee_source_does_not_enqueue_desktop_check(self):
        serializer = PharmacistOnboardingV2Serializer(self.profile, data={
            'tab': 'basic', 'ahpra_number': 'PHA0007654321', 'submitted_for_verification': True,
        }, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        with patch('onboarding.serializers.record_first_submission'), patch('core.task_queue.async_task'):
            serializer.save()
        self.assertFalse(AhpraCheck.objects.filter(status='pending').exists())

    # 5
    def test_f5_org_admin_membership_lifts_freeze(self):
        from organizations.models import Organization
        from users.models import OrganizationMembership
        self.suspend()
        OrganizationMembership.objects.create(user=self.user, organization=Organization.objects.create(name='Org'),
                                              role='ORG_ADMIN')
        self.assertFalse(ahpra_frozen(self.user))

    # 6
    @override_settings(AHPRA_SOURCE='scrapingbee')
    def test_f6_redis_down_does_not_500_every_api_request(self):
        broken = MagicMock()
        broken.__getitem__.return_value.get.side_effect = ConnectionError('redis down')
        self.client.raise_request_exception = False
        with patch('onboarding.verification.state.caches', broken):
            response = self.client.get('/api/v1/shift-saved/')
        self.assertNotEqual(response.status_code, 500)

    # 7
    def test_f7_recurring_offer_cancelled_with_future_occurrences(self):
        from shifts.cancellation import cancel_upcoming_assignments
        owner, pharmacy = make_owner_with_pharmacy()
        today = timezone.localdate()
        shift, _, assignment = make_assignment(pharmacy, owner, self.user, today + timedelta(days=3))
        assignment.delete()
        ShiftSlot.objects.filter(shift=shift).delete()
        template = ShiftSlot.objects.create(shift=shift, date=today - timedelta(days=7), start_time=time(9),
                                            end_time=time(17), is_recurring=True,
                                            recurring_days=[0, 1, 2, 3, 4, 5, 6], recurring_end_date=today + timedelta(days=30))
        offer = ShiftOffer.objects.create(shift=shift, user=self.user, status=ShiftOffer.Status.ACCEPTED)
        future = ShiftSlotAssignment.objects.create(shift=shift, slot=template, slot_date=today + timedelta(days=3),
                                                    user=self.user, source_offer=offer)
        with patch('shifts.cancellation.notify_shift_managers', return_value=[]):
            cancel_upcoming_assignments(self.user)
        offer.refresh_from_db()
        deleted = not ShiftSlotAssignment.objects.filter(pk=future.pk).exists()
        self.assertFalse(deleted and offer.status == ShiftOffer.Status.ACCEPTED,
                         'future occurrence deleted but shift-wide offer still ACCEPTED')

    def test_f7b_negotiated_later_start_today_is_cancelled(self):
        from datetime import datetime
        from shifts.cancellation import cancel_upcoming_assignments
        owner, pharmacy = make_owner_with_pharmacy()
        today = timezone.localdate()
        shift, slot, assignment = make_assignment(pharmacy, owner, self.user, today)  # template 09:00
        offer = ShiftOffer.objects.create(shift=shift, slot=slot, user=self.user, status=ShiftOffer.Status.ACCEPTED,
                                          offered_slot_date=today, offered_start_time=time(14),
                                          offered_end_time=time(18))
        ShiftSlotAssignment.objects.filter(pk=assignment.pk).update(source_offer=offer)
        noon = timezone.make_aware(datetime.combine(today, time(12)))
        with patch('shifts.cancellation.timezone', SimpleNamespace(localtime=lambda: noon)), \
                patch('shifts.cancellation.notify_shift_managers', return_value=[]):
            outcome = cancel_upcoming_assignments(self.user)
        offer.refresh_from_db()
        self.assertFalse(ShiftSlotAssignment.objects.filter(pk=assignment.pk).exists())
        self.assertEqual(offer.status, ShiftOffer.Status.DECLINED)
        self.assertEqual([row['date'] for row in outcome['cancelled']], [today.isoformat()])

    # 8
    def test_f8_failed_recheck_after_expiry_does_not_suppress_next_recheck(self):
        today = timezone.localdate()
        self.profile.ahpra_expiry_date = today - timedelta(days=10)
        self.profile.save(update_fields=['ahpra_expiry_date'])
        check_fixture(self.profile, status='done', outcome='verified', completed_at=timezone.now() - timedelta(days=40),
                      register_data={'registration_status': 'Registered'})
        AhpraCheck.objects.create(model_name='PharmacistOnboarding', object_pk=self.profile.pk, registration_number=NUMBER,
                                  reason='recheck', status='done', outcome='error', completed_at=timezone.now())
        queue_public_recheck(self.user)
        self.assertTrue(AhpraCheck.objects.filter(status='pending').exists())

    # 9
    def test_f9_queued_backlog_not_stolen_from_connected_extension(self):
        other = PharmacistOnboarding.objects.create(
            user=make_user('PHARMACIST', first_name='Jane', last_name='Doe'), ahpra_number='PHA0007654321')
        caches['ahpra'].set('ahpra_verifier_presence_extension', True, timeout=None)
        first = check_fixture(self.profile, status='pending', stage='extension')
        second = AhpraCheck.objects.create(model_name='PharmacistOnboarding', object_pk=other.pk,
                                           registration_number='PHA0007654321', reason='onboarding',
                                           status='pending', stage='extension')
        self.assertEqual(len(claim_checks(stage='extension')), 2)  # both leased at once
        later = timezone.now() + timedelta(minutes=6)
        with patch('onboarding.verification.desktop.timezone.now', return_value=later):
            claim_checks(stage='bridge')  # extension still connected, busy with the first check
        handle_verifier_result(result(first.pk), 'extension')
        handle_verifier_result(result(second.pk), 'extension')
        second.refresh_from_db()
        self.assertEqual((second.stage, second.status), ('extension', 'done'))
