"""AHPRA gates public applications while preserving internal member access."""
from datetime import date, datetime, timedelta
from unittest.mock import patch

from django.core.cache import caches
from django.test import TestCase, override_settings
from django.utils import timezone

from client_profile.characterization_support import client_for, make_assignment, make_owner_with_pharmacy, make_user
from memberships.models import Membership
from onboarding.models import AhpraCheck, PharmacistOnboarding
from onboarding.test_ahpra_desktop import TEST_CACHES, check_fixture, profile_fixture
from onboarding.verification.state import (
    ahpra_frozen, ahpra_state, apply_state_transition, member_suspension_note, require_public_ahpra,
)
from shifts.access import ShiftActionRefused
from shifts.models import ShiftCounterOffer, ShiftInterest, ShiftOffer, ShiftSlotAssignment


@override_settings(AHPRA_SOURCE='desktop', CACHES=TEST_CACHES,
                   CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}})
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

    def test_not_found_claim_keeps_visibility_boundary(self):
        response = self.client.post(f'/api/v1/community-shifts/{self.shift.pk}/claim-shift/', {}, format='json')
        self.assertEqual(response.status_code, 403, response.content)
        self.assertEqual(response.json()['code'], 'shift_not_accessible')
        self.assertFalse(ShiftSlotAssignment.objects.filter(user=self.user).exists())

    def test_not_found_blocks_offer_accept(self):
        self.refused(f'shift-offers/{self.offer.pk}/accept/')

    def test_not_found_does_not_freeze_other_endpoints(self):
        self.assertEqual(self.client.get('/api/v1/shift-saved/').status_code, 200)

    def test_type_not_accepted_blocks_public_actions_without_freezing(self):
        self.set_state('type_not_accepted')
        apply_state_transition(self.profile, {'state': 'pending'})
        for path in (f'shifts/{self.shift.pk}/express_interest/',
                     f'shifts/{self.shift.pk}/counter-offers/', f'shift-offers/{self.offer.pk}/accept/'):
            with self.subTest(path=path):
                response = self.client.post(f'/api/v1/{path}', {}, format='json')
                self.assertEqual(response.status_code, 403, response.content)
                self.assertEqual(response.json(), {
                    'code': 'ahpra_type_not_accepted', 'detail': ahpra_state(self.profile)['note'],
                })
        self.assertFalse(ahpra_frozen(self.user))
        self.assertEqual(self.client.get('/api/v1/shift-saved/').status_code, 200)
        self.assertFalse(ShiftInterest.objects.filter(user=self.user).exists())
        self.assertFalse(ShiftCounterOffer.objects.filter(user=self.user).exists())
        self.assertFalse(ShiftSlotAssignment.objects.filter(user=self.user).exists())
        self.offer.refresh_from_db()
        self.assertEqual(self.offer.status, ShiftOffer.Status.PENDING)

    def test_unreadable_public_apply_refused_without_freeze_or_cancellation(self):
        AhpraCheck.objects.filter(pk=self.check.pk).update(
            outcome='review', register_data={'registration_status': 'Unknown'})
        with patch('onboarding.verification.state.announce_suspension') as announce:
            with self.captureOnCommitCallbacks(execute=True):
                apply_state_transition(self.profile, {'state': 'ok'})
            for path in (f'shifts/{self.shift.pk}/express_interest/', f'shift-offers/{self.offer.pk}/accept/'):
                response = self.client.post(f'/api/v1/{path}', {}, format='json')
                self.assertEqual(response.status_code, 403, response.content)
                self.assertEqual(response.json()['code'], 'ahpra_unreadable')
            announce.assert_not_called()
        self.assertFalse(ahpra_frozen(self.user))
        self.assertFalse(ShiftInterest.objects.filter(user=self.user).exists())
        self.offer.refresh_from_db()
        self.assertEqual(self.offer.status, ShiftOffer.Status.PENDING)

    def test_public_pickup_queues_expiry_recheck_and_still_201(self):
        self.user.is_otp_verified = self.user.is_mobile_verified = True
        self.user.save(update_fields=['is_otp_verified', 'is_mobile_verified'])
        self.profile.verified = self.profile.ahpra_verified = True
        self.profile.ahpra_expiry_date = timezone.localdate() - timedelta(days=1)
        self.profile.save()
        AhpraCheck.objects.filter(pk=self.check.pk).update(
            outcome='verified', register_data={'registration_status': 'Registered', 'registration_type': 'General'},
            completed_at=timezone.now() - timedelta(days=30))
        with patch('onboarding.verification.desktop.enqueue_check') as enqueue, patch('shifts.interest.async_task'):
            with self.captureOnCommitCallbacks(execute=True):
                response = self.client.post(f'/api/v1/shifts/{self.shift.pk}/express_interest/', {}, format='json')
        self.assertEqual(response.status_code, 201, response.content)
        enqueue.assert_called_once()

    def test_recheck_due_from_stored_expiry_or_last_december(self):
        from onboarding.models import OtherStaffOnboarding
        from onboarding.verification.state import queue_public_recheck

        def due(checked, today, expiry=None, register_expiry=None, profile=self.profile):
            if hasattr(profile, 'ahpra_expiry_date'):
                profile.ahpra_expiry_date = expiry
                profile.save(update_fields=['ahpra_expiry_date'])
            AhpraCheck.objects.filter(pk=self.check.pk).update(
                model_name=profile._meta.object_name, object_pk=profile.pk, outcome='verified',
                register_data={'registration_status': 'Registered', 'registration_type': 'General', 'expiry_date': register_expiry},
                completed_at=timezone.make_aware(datetime.combine(checked, datetime.min.time().replace(hour=12))))
            with patch('onboarding.verification.desktop.enqueue_check') as enqueue, \
                    patch('django.utils.timezone.localdate', return_value=today):
                queue_public_recheck(profile.user)
            return enqueue.called

        d = date
        self.assertFalse(due(d(2026, 10, 15), d(2026, 12, 2), d(2027, 11, 30)))
        self.assertTrue(due(d(2026, 10, 15), d(2027, 12, 1), d(2027, 11, 30)))
        self.assertTrue(due(d(2026, 10, 15), d(2026, 12, 1), d(2026, 11, 30)))
        self.assertFalse(due(d(2026, 12, 1), d(2026, 12, 3), d(2026, 11, 30)))  # that check already ran
        self.assertFalse(due(d(2026, 12, 1), d(2027, 6, 1)))  # no expiry: checked since last 1 December
        self.assertTrue(due(d(2026, 11, 30), d(2026, 12, 1)))
        intern = OtherStaffOnboarding.objects.create(user=make_user('OTHER_STAFF'), role_type='INTERN',
                                                     ahpra_number=self.profile.ahpra_number)
        self.assertFalse(due(d(2026, 10, 15), d(2027, 4, 4), register_expiry='2027-04-04', profile=intern))
        self.assertTrue(due(d(2026, 10, 15), d(2027, 4, 5), register_expiry='2027-04-04', profile=intern))
        with override_settings(AHPRA_SOURCE='scrapingbee'):
            self.assertFalse(due(d(2026, 10, 15), d(2027, 12, 1), d(2027, 11, 30)))

    def test_public_gate_recheck_deduplicates_and_never_checks_internal_member_work(self):
        AhpraCheck.objects.filter(pk=self.check.pk).update(
            outcome='verified', register_data={'registration_status': 'Registered', 'registration_type': 'General'},
            completed_at=timezone.now() - timedelta(days=800))
        PharmacistOnboarding.objects.filter(pk=self.profile.pk).update(verified=True, ahpra_verified=True)
        with self.captureOnCommitCallbacks(execute=True):
            require_public_ahpra(self.user, self.shift)
            require_public_ahpra(self.user, self.shift)
        self.assertEqual(AhpraCheck.objects.filter(status='pending', reason='public_recheck').count(), 1)
        self.member(self.shift.pharmacy)
        with patch('onboarding.verification.desktop.enqueue_check') as enqueue:
            with self.captureOnCommitCallbacks(execute=True):
                require_public_ahpra(self.user, self.shift)
                self.shift.visibility = 'FULL_PART_TIME'
                require_public_ahpra(self.user, self.shift)
            enqueue.assert_not_called()

    def test_no_periodic_registration_recheck(self):
        from django.conf import settings
        from onboarding import tasks
        self.assertFalse(hasattr(tasks, 'recheck_ahpra_registrations'))
        self.assertFalse(any(row['task'].endswith('.recheck_ahpra_registrations')
                             for row in settings.CELERY_BEAT_SCHEDULE.values()))

    def test_old_number_not_found_does_not_block_corrected_number(self):
        self.profile.ahpra_number = 'PHA0007654321'
        self.profile.save(update_fields=['ahpra_number'])
        from onboarding.verification.state import require_ahpra_application
        require_ahpra_application(self.user)

    def test_registered_needing_review_does_not_get_not_found_error(self):
        AhpraCheck.objects.filter(pk=self.check.pk).update(
            outcome='review', register_data={'registration_status': 'Registered', 'registration_type': 'General'})
        from onboarding.verification.state import require_ahpra_application
        require_ahpra_application(self.user)

    def member(self, pharmacy):
        return Membership.objects.create(
            user=self.user, pharmacy=pharmacy, invited_by=pharmacy.owner.user,
            role='PHARMACIST', employment_type='FULL_TIME', is_active=True,
        )

    def test_pending_or_inactive_membership_does_not_unfreeze(self):
        self.set_state('suspended')
        membership = self.member(self.shift.pharmacy)
        for status, active in ((Membership.Status.PENDING, True), (Membership.Status.ACCEPTED, False)):
            with self.subTest(status=status, active=active):
                Membership.objects.filter(pk=membership.pk).update(status=status, is_active=active)
                self.assertTrue(ahpra_frozen(self.user))
                self.assertEqual(self.client.get('/api/v1/shift-saved/').status_code, 403)
                self.assertEqual(self.client.get('/api/v1/my-memberships/').status_code, 200)

    def test_frozen_user_accepts_invitation_and_works_internally_but_not_publicly(self):
        self.set_state('suspended')
        self.user.is_otp_verified = self.user.is_mobile_verified = True
        self.user.save(update_fields=['is_otp_verified', 'is_mobile_verified'])
        owner, pharmacy = make_owner_with_pharmacy('Inviting Pharmacy')
        invite = Membership.objects.create(user=self.user, pharmacy=pharmacy, invited_by=owner, role='PHARMACIST',
                                           employment_type='FULL_TIME', status=Membership.Status.PENDING)
        self.assertTrue(ahpra_frozen(self.user))
        self.assertEqual(self.client.get(f'/api/v1/my-memberships/{invite.pk}/').status_code, 200)
        response = self.client.post(f'/api/v1/my-memberships/{invite.pk}/accept/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        invite.refresh_from_db()
        self.assertEqual((invite.status, invite.is_active), (Membership.Status.ACCEPTED, True))
        self.assertFalse(ahpra_frozen(self.user))
        summary = self.client.get('/api/v1/pharmacist/onboarding/me/').json()['ahpra']
        self.assertEqual((summary['state'], summary['registration_status'], summary['frozen']),
                         ('suspended', 'Suspended', False))
        shift, _, assignment = make_assignment(pharmacy, owner, self.user, timezone.localdate() + timedelta(days=5))
        assignment.delete()
        shift.role_needed, shift.visibility = 'PHARMACIST', 'FULL_PART_TIME'
        shift.save(update_fields=['role_needed', 'visibility'])
        with patch('shifts.interest.async_task'), patch('shifts.browse.async_task'):
            response = self.client.post(f'/api/v1/community-shifts/{shift.pk}/claim-shift/', {}, format='json')
            self.assertIn(response.status_code, (200, 201), response.content)
            self.assertTrue(ShiftSlotAssignment.objects.filter(shift=shift, user=self.user).exists())
            response = self.client.post(f'/api/v1/shifts/{self.shift.pk}/express_interest/', {}, format='json')
        self.assertEqual((response.status_code, response.json()['code']), (403, 'ahpra_suspended'))
        self.assertFalse(ShiftInterest.objects.filter(shift=self.shift, user=self.user).exists())

    def test_frozen_user_accepts_pharmacy_admin_invitation_and_unfreezes(self):
        from organizations.models import PharmacyAdmin
        self.set_state('suspended')
        owner, pharmacy = make_owner_with_pharmacy('Admin Invite Pharmacy')
        invite = Membership.objects.create(user=self.user, pharmacy=pharmacy, invited_by=owner, role='PHARMACIST',
                                           employment_type='FULL_TIME', status=Membership.Status.PENDING)
        admin = PharmacyAdmin.objects.create(user=self.user, pharmacy=pharmacy, membership=invite,
                                             admin_level=PharmacyAdmin.AdminLevel.MANAGER, is_active=False)
        self.assertTrue(ahpra_frozen(self.user))
        response = self.client.get('/api/v1/pharmacy-admins/my-pending-invitations/')
        self.assertEqual((response.status_code, [i['id'] for i in response.json()]), (200, [admin.pk]))
        response = self.client.post(f'/api/v1/pharmacy-admins/{admin.pk}/accept-invitation/', {}, format='json')
        self.assertEqual(response.status_code, 200, response.content)
        invite.refresh_from_db()
        self.assertEqual((invite.status, invite.is_active), (Membership.Status.ACCEPTED, True))
        self.assertFalse(ahpra_frozen(self.user))

    def test_org_admin_invited_member_counts_but_pharmacyless_membership_does_not(self):
        from client_profile.models import Organization
        from users.models import OrganizationMembership

        self.set_state('suspended')
        Membership.objects.create(user=self.user, pharmacy=None, role='PHARMACIST', employment_type='FULL_TIME')
        self.assertTrue(ahpra_frozen(self.user))
        org = Organization.objects.create(name='AHPRA Org')
        pharmacy = self.shift.pharmacy
        pharmacy.organization = org
        pharmacy.save(update_fields=['organization'])
        admin = make_owner_with_pharmacy('Org Admin Pharmacy')[0]
        OrganizationMembership.objects.create(user=admin, organization=org, role='ORG_ADMIN').pharmacies.add(pharmacy)
        Membership.objects.create(user=self.user, pharmacy=pharmacy, invited_by=admin,
                                  role='PHARMACIST', employment_type='CASUAL')
        self.assertFalse(ahpra_frozen(self.user))
        self.shift.visibility = 'PLATFORM'
        self.shift.save(update_fields=['visibility'])
        require_public_ahpra(self.user, self.shift)  # member access on the org's public shift

    def set_state(self, state):
        if state == 'type_not_accepted':
            AhpraCheck.objects.filter(pk=self.check.pk).update(
                outcome=state, register_data={'registration_status': 'Registered', 'registration_type': 'Non Practising'},
            )
            return
        AhpraCheck.objects.filter(pk=self.check.pk).update(
            outcome='not_found' if state == 'not_found' else 'rejected',
            register_data={'registration_status': 'Suspended'} if state == 'suspended' else {},
        )

    def test_member_adverse_ahpra_allows_internal_interest_claim_and_accept(self):
        self.member(self.shift.pharmacy)
        self.user.is_otp_verified = self.user.is_mobile_verified = True
        self.user.save(update_fields=['is_otp_verified', 'is_mobile_verified'])
        for state in ('suspended', 'not_found', 'unreadable', 'type_not_accepted'):
            self.set_state(state)
            for action in ('express_interest', 'claim', 'accept'):
                with self.subTest(state=state, action=action):
                    shift, slot, assignment = make_assignment(
                        self.shift.pharmacy, self.shift.created_by, self.user,
                        timezone.localdate() + timedelta(days=5),
                    )
                    assignment.delete()
                    shift.role_needed, shift.visibility = 'PHARMACIST', 'FULL_PART_TIME'
                    shift.save(update_fields=['role_needed', 'visibility'])
                    if action == 'accept':
                        offer = ShiftOffer.objects.create(shift=shift, slot=slot, user=self.user)
                        path = f'shift-offers/{offer.pk}/accept/'
                    elif action == 'claim':
                        path = f'community-shifts/{shift.pk}/claim-shift/'
                    else:
                        path = f'shifts/{shift.pk}/express_interest/'
                    with patch('shifts.interest.async_task'), patch('shifts.browse.async_task'):
                        response = self.client.post(f'/api/v1/{path}', {}, format='json')
                    self.assertIn(response.status_code, (200, 201), response.content)
                    if action == 'express_interest':
                        self.assertTrue(ShiftInterest.objects.filter(shift=shift, user=self.user).exists())
                    elif action == 'claim':
                        self.assertTrue(ShiftSlotAssignment.objects.filter(shift=shift, user=self.user).exists())
                    else:
                        offer.refresh_from_db()
                        self.assertIn(offer.status, (ShiftOffer.Status.ACCEPTED, ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT))
                    self.assertFalse(ahpra_frozen(self.user))
                    self.assertEqual(self.client.get('/api/v1/shift-saved/').status_code, 200)
                    summary = self.client.get('/api/v1/pharmacist/onboarding/me/')
                    self.assertEqual(summary.status_code, 200, summary.content)
                    self.assertFalse(summary.json()['ahpra']['frozen'])

    def test_member_adverse_ahpra_still_refuses_public_applications(self):
        _, internal_pharmacy = make_owner_with_pharmacy('Internal Pharmacy')
        self.member(internal_pharmacy)
        for state in ('suspended', 'not_found', 'type_not_accepted'):
            self.set_state(state)
            for path in (f'shifts/{self.shift.pk}/express_interest/',
                         f'shifts/{self.shift.pk}/counter-offers/', f'shift-offers/{self.offer.pk}/accept/'):
                with self.subTest(state=state, path=path):
                    response = self.client.post(f'/api/v1/{path}', {}, format='json')
                    self.assertEqual(response.status_code, 403, response.content)
                    self.assertEqual(response.json()['code'], f'ahpra_{state}')
                    if state == 'suspended':
                        self.assertEqual(response.json()['detail'], member_suspension_note('Suspended'))
                        self.assertNotIn('paused', response.json()['detail'])
                    else:
                        self.assertEqual(response.json()['detail'], ahpra_state(self.profile)['note'])
            with self.assertRaises(ShiftActionRefused):
                require_public_ahpra(self.user, self.shift)
            response = self.client.post(f'/api/v1/community-shifts/{self.shift.pk}/claim-shift/', {}, format='json')
            self.assertEqual(response.status_code, 403, response.content)
            self.assertFalse(ShiftSlotAssignment.objects.filter(user=self.user).exists())
            self.assertFalse(ahpra_frozen(self.user))

    @override_settings(ADMINS=[], ADMIN_EMAILS=[])
    def test_suspension_cancels_public_booking_and_offer_but_keeps_member_work(self):
        self.member(self.shift.pharmacy)
        public, _, public_assignment = make_assignment(
            self.shift.pharmacy, self.shift.created_by, self.user, self.slot.date)
        public.post_anonymously = True  # This booking is held as a public worker.
        public.save(update_fields=['post_anonymously'])
        public_offer = ShiftOffer.objects.create(
            shift=public, slot=public_assignment.slot, user=self.user, status=ShiftOffer.Status.ACCEPTED)
        kept = []
        kept_offers = []
        for visibility in ('FULL_PART_TIME', 'PLATFORM'):
            shift, slot, assignment = make_assignment(
                self.shift.pharmacy, self.shift.created_by, self.user, self.slot.date)
            shift.role_needed, shift.visibility = 'PHARMACIST', visibility
            shift.save(update_fields=['role_needed', 'visibility'])
            kept.append(assignment.pk)
            kept_offers.append(ShiftOffer.objects.create(
                shift=shift, slot=slot, user=self.user, status=ShiftOffer.Status.ACCEPTED).pk)
        self.set_state('suspended')
        with patch('core.task_queue.async_task'), patch('notifications.services.notify_users'), \
                patch('shifts.cancellation.async_task'), patch('onboarding.verification.state.close_chat_sockets') as close:
            with self.captureOnCommitCallbacks(execute=True):
                apply_state_transition(self.profile, {'state': 'ok'})
        close.assert_not_called()
        self.assertFalse(ShiftSlotAssignment.objects.filter(pk=public_assignment.pk).exists())
        public_offer.refresh_from_db()
        self.assertEqual(public_offer.status, ShiftOffer.Status.DECLINED)
        self.assertEqual(ShiftSlotAssignment.objects.filter(pk__in=kept).count(), 2)
        self.assertEqual(ShiftOffer.objects.filter(pk__in=kept_offers, status=ShiftOffer.Status.ACCEPTED).count(), 2)

    def test_public_only_suspended_user_is_frozen(self):
        self.set_state('suspended')
        self.assertTrue(ahpra_frozen(self.user))
        response = self.client.get('/api/v1/shift-saved/')
        self.assertEqual(response.status_code, 403, response.content)
        self.assertEqual((response.json()['code'], response.json()['frozen']), ('ahpra_suspended', True))
