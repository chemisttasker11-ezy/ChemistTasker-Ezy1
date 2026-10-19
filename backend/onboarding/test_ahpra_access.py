"""Current-number state, account freeze, recovery and suspension side effects."""
from datetime import timedelta
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.admin.sites import AdminSite
from django.core import mail
from django.core.cache import caches
from django.db import transaction
from django.test import TestCase, override_settings
from django.utils import timezone

from client_profile.characterization_support import client_for, make_assignment, make_owner_with_pharmacy, make_user
from onboarding.admin import AhpraCheckAdmin
from onboarding.models import AhpraCheck, OtherStaffOnboarding, OwnerOnboarding
from onboarding.serializers import OtherStaffOnboardingV2Serializer, PharmacistOnboardingV2Serializer
from onboarding.test_ahpra_desktop import NUMBER, TEST_CACHES, check_fixture, profile_fixture, result
from onboarding.verification.desktop import apply_ahpra_result, enqueue_check
from onboarding.verification.state import ahpra_state
from shifts.candidates import work_profile
from shifts.models import ShiftOffer, ShiftSlotAssignment


@override_settings(AHPRA_SOURCE='desktop', CACHES=TEST_CACHES,
                   CHANNEL_LAYERS={'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}},
                   EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
                   ADMINS=[('Admin', 'admin@example.test')])
class AhpraAccessTests(TestCase):
    def setUp(self):
        caches['ahpra'].clear()
        self.profile = profile_fixture()
        self.user = self.profile.user
        self.user.is_otp_verified = self.user.is_mobile_verified = True
        self.user.save(update_fields=['is_otp_verified', 'is_mobile_verified'])
        self.client = client_for(self.user)

    def finish(self, outcome='verified', status='Registered', **kwargs):
        return check_fixture(self.profile, status='done', outcome=outcome,
                             completed_at=timezone.now(), register_data={
                                 'registration_status': status, 'registration_type': 'General',
                                 'expiry_date': '2099-01-02',
                             }, **kwargs)

    def test_state_uses_current_number_and_structured_status_not_notes(self):
        self.finish(note='Suspended - irrelevant note text')
        self.assertEqual(ahpra_state(self.profile)['state'], 'ok')
        for value in ('Suspended', 'Cancelled', 'Surrendered', ' suspended '):
            self.finish(outcome='review', status=value)
            with self.subTest(status=value):
                self.assertEqual(ahpra_state(self.profile)['state'], 'suspended')
        self.finish(outcome='rejected', status='Not registered')
        self.assertEqual(ahpra_state(self.profile)['state'], 'not_found')
        self.profile.ahpra_number = 'PHA0007654321'
        self.profile.save(update_fields=['ahpra_number'])
        self.assertEqual(ahpra_state(self.profile)['state'], 'pending')
        self.assertIsNone(ahpra_state(self.profile)['registration_status'])

    def test_unknown_or_unreadable_status_needs_review_without_freeze_or_cancellation(self):
        self.profile.verified = self.profile.ahpra_verified = True
        self.profile.save(update_fields=['verified', 'ahpra_verified'])
        for status in ('Expired', 'Under assessment', 'Not suspended', '', None, ['Suspended']):
            with self.subTest(status=status), patch('onboarding.verification.state.announce_suspension') as announce:
                from onboarding.verification.state import apply_state_transition
                with self.captureOnCommitCallbacks(execute=True):
                    if isinstance(status, str):
                        check = check_fixture(self.profile)
                        apply_ahpra_result(check, result(check.pk, registration_status=status))
                    else:
                        check = self.finish(status=status)
                        apply_state_transition(self.profile, {'state': 'ok'})
                state = ahpra_state(self.profile)
                self.assertEqual(state['state'], 'pending')
                self.assertIn('Needs review by an admin', state['note'])
                self.assertEqual(self.client.get('/api/v1/public-job-board/').status_code, 200)
                self.profile.refresh_from_db()
                self.assertTrue(self.profile.verified)
                announce.assert_not_called()
                check.delete()

    def test_frozen_owner_can_read_ahpra_onboarding_and_recheck_but_not_pharmacy(self):
        owner, pharmacy = make_owner_with_pharmacy()
        owner.is_otp_verified = owner.is_mobile_verified = True
        owner.save(update_fields=['is_otp_verified', 'is_mobile_verified'])
        profile = OwnerOnboarding.objects.get(user=owner)
        profile.role, profile.ahpra_number = 'PHARMACIST', NUMBER
        profile.verified = profile.ahpra_verified = True
        profile.save()
        check = AhpraCheck.objects.create(model_name='OwnerOnboarding', object_pk=profile.pk,
                                         registration_number=NUMBER, reason='onboarding')
        with patch('onboarding.verification.state.announce_suspension'), self.captureOnCommitCallbacks(execute=True):
            apply_ahpra_result(check, result(check.pk, registration_status='Suspended'))
        profile.refresh_from_db()
        self.assertFalse(profile.verified)
        self.assertFalse(profile.ahpra_verified)
        client = client_for(owner)
        response = client.get(f'/api/v1/pharmacies/{pharmacy.pk}/')
        self.assertEqual((response.status_code, response.json()['code']), (403, 'ahpra_suspended'))
        for prefix in ('/api/v1/',):
            response = client.get(prefix + 'owner/onboarding/me/')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['ahpra'], ahpra_state(profile))
        response = client.post('/api/v1/onboarding/ahpra/recheck/')
        self.assertEqual((response.status_code, response.json()), (202, {'queued': True}))
        self.assertTrue(AhpraCheck.objects.filter(model_name='OwnerOnboarding', object_pk=profile.pk,
                                                 status='pending', reason='recheck').exists())

    def test_pending_recheck_retains_suspension_and_review_is_pending(self):
        self.finish(outcome='rejected', status='Suspended')
        enqueue_check(self.profile, NUMBER, 'recheck')
        self.assertEqual(ahpra_state(self.profile)['state'], 'suspended')
        AhpraCheck.objects.filter(status='pending').update(status='done', outcome='review',
                                                         completed_at=timezone.now(), register_data={
                                                             'registration_status': 'Registered'})
        self.assertEqual(ahpra_state(self.profile)['state'], 'pending')

    def test_freeze_covers_views_with_explicit_allow_any_and_permissions(self):
        self.finish(outcome='rejected', status='Suspended')
        expected = {'code': 'ahpra_suspended', 'detail': ahpra_state(self.profile)['note']}
        for path, method in [('/api/v1/public-job-board/', 'get'),
                             ('/api/v1/shift-saved/', 'get'),
                             ('/api/v1/device-tokens/', 'post'),
                             ('/api/v1/users/me/account-type/', 'post')]:
            with self.subTest(path=path):
                response = getattr(self.client, method)(path, {}, format='json')
                self.assertEqual(response.status_code, 403)
                self.assertEqual(response.json(), expected)

    def test_freeze_allow_list_reads_and_onboarding_write(self):
        self.finish(outcome='rejected', status='Suspended')
        for path in ('/api/v1/users/me/', '/api/v1/users/csrf/', '/api/v1/notifications/',
                     '/api/v1/pharmacist/onboarding/me/'):
            with self.subTest(path=path):
                self.assertEqual(self.client.get(path).status_code, 200)
        self.assertEqual(self.client.post('/api/v1/notifications/mark-read/', {}, format='json').status_code, 200)
        response = self.client.patch('/api/v1/pharmacist/onboarding/me/', {'tab': 'basic'}, format='json')
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['ahpra']['state'], 'suspended')
        self.assertFalse(response.json()['verified'])

    def test_frozen_logout_and_refresh_are_not_blocked(self):
        self.finish(outcome='rejected', status='Suspended')
        for path in ('/api/v1/users/logout/', '/api/v1/users/token/refresh/', '/api/v1/users/login/'):
            response = self.client.post(path, {}, format='json')
            self.assertNotEqual(response.json().get('code'), 'ahpra_suspended')

    def test_freeze_authenticates_real_bearer_token_before_view_permissions(self):
        from rest_framework_simplejwt.tokens import AccessToken
        self.finish(outcome='rejected', status='Suspended')
        client = client_for()
        client.credentials(HTTP_AUTHORIZATION=f'Bearer {AccessToken.for_user(self.user)}')
        response = client.get('/api/v1/public-job-board/')
        self.assertEqual((response.status_code, response.json()['code']), (403, 'ahpra_suspended'))
        self.assertEqual(client.get('/api/v1/users/me/').status_code, 200)

    def test_recheck_allowed_while_frozen_202_then_429_across_route_aliases(self):
        self.finish(outcome='rejected', status='Suspended')
        response = self.client.post('/api/v1/onboarding/ahpra/recheck/')
        self.assertEqual((response.status_code, response.json()), (202, {'queued': True}))
        check = AhpraCheck.objects.get(status='pending')
        self.assertEqual((check.reason, check.registration_number), ('recheck', NUMBER))
        response = self.client.post('/api/v1/onboarding/ahpra/recheck/')
        self.assertEqual(response.status_code, 429)
        self.assertEqual(response.json()['code'], 'ahpra_recheck_cooldown')
        self.assertTrue(3598 <= response.json()['retry_after'] <= 3600)
        self.assertEqual(AhpraCheck.objects.filter(status='pending').count(), 1)
        self.assertIsNotNone(ahpra_state(self.profile)['recheck_available_at'])

    def test_recheck_cooldown_is_per_user_not_per_number(self):
        self.assertEqual(self.client.post('/api/v1/onboarding/ahpra/recheck/').status_code, 202)
        self.profile.ahpra_number = 'PHA0007654321'
        self.profile.save(update_fields=['ahpra_number'])
        self.assertEqual(self.client.post('/api/v1/onboarding/ahpra/recheck/').status_code, 429)

    def test_recheck_reuses_one_active_check_and_requires_authentication(self):
        pending = check_fixture(self.profile)
        self.assertEqual(self.client.post('/api/v1/onboarding/ahpra/recheck/').status_code, 202)
        self.assertEqual(list(AhpraCheck.objects.values_list('pk', flat=True)), [pending.pk])
        self.assertIn(client_for().post('/api/v1/onboarding/ahpra/recheck/').status_code, (401, 403))

    def test_review_or_failed_lookup_keeps_verified(self):
        from onboarding.verification.ahpra import _update_ahpra_fields
        self.profile.verified = self.profile.ahpra_verified = True
        self.profile.save(update_fields=['verified', 'ahpra_verified'])
        _update_ahpra_fields('PharmacistOnboarding', self.profile.pk, False, 'AHPRA lookup failed. Please try again later.')
        check = check_fixture(self.profile)
        apply_ahpra_result(check, result(check.pk, registration_status='Registered', expiry_date='2000-01-01'))
        self.profile.refresh_from_db()
        self.assertTrue(self.profile.verified)
        self.assertEqual(ahpra_state(self.profile)['state'], 'pending')

    def test_frozen_user_cannot_join_chat_socket(self):
        from asgiref.sync import async_to_sync
        from chat.consumers import RoomConsumer
        self.finish(outcome='rejected', status='Suspended')
        self.assertTrue(async_to_sync(RoomConsumer()._ahpra_suspended)(self.user))

    def test_number_typo_submit_queues_current_number(self):
        self.finish(outcome='not_found', status=None)
        serializer = PharmacistOnboardingV2Serializer(self.profile, data={
            'tab': 'basic', 'ahpra_number': 'PHA0007654321', 'submitted_for_verification': True,
        }, partial=True)
        self.assertTrue(serializer.is_valid(), serializer.errors)
        with patch('onboarding.serializers.record_first_submission'):
            serializer.save()
        pending = AhpraCheck.objects.get(status='pending')
        self.assertEqual(pending.registration_number, 'PHA0007654321')
        self.assertEqual(serializer.data['ahpra']['state'], 'pending')

    def test_intern_state_and_submit_use_same_helper_and_queue(self):
        user = make_user('OTHER_STAFF')
        profile = OtherStaffOnboarding.objects.create(user=user, role_type='INTERN', ahpra_number=NUMBER)
        check = AhpraCheck.objects.create(model_name='OtherStaffOnboarding', object_pk=profile.pk,
                                         registration_number=NUMBER, status='done', reason='onboarding',
                                         outcome='not_found', completed_at=timezone.now())
        serializer = OtherStaffOnboardingV2Serializer(profile, data={
            'tab': 'regulatory', 'ahpra_number': 'PHA0007654321', 'submitted_for_verification': True,
        }, partial=True)
        self.assertEqual(ahpra_state(profile)['state'], 'not_found')
        self.assertTrue(serializer.is_valid(), serializer.errors)
        with patch('onboarding.emails.notify_superuser_on_onboarding'):
            serializer.save()
        self.assertTrue(AhpraCheck.objects.exclude(pk=check.pk).filter(
            model_name='OtherStaffOnboarding', object_pk=profile.pk,
            registration_number='PHA0007654321', status='pending').exists())
        self.assertEqual(serializer.data['ahpra']['state'], 'pending')

    def test_verified_suspended_verified_round_trip(self):
        for status, verified in [('Registered', True), ('Suspended', False), ('Registered', True)]:
            check = check_fixture(self.profile)
            apply_ahpra_result(check, result(check.pk, registration_status=status))
            self.profile.refresh_from_db()
            with self.subTest(status=status):
                self.assertEqual(self.profile.verified, verified)
                self.assertEqual(self.profile.ahpra_verified, verified)
                self.assertEqual(ahpra_state(self.profile)['state'], 'ok' if verified else 'suspended')

    def test_suspension_cancels_future_once_notifies_once_and_redacts_emails(self):
        owner, pharmacy = make_owner_with_pharmacy()
        shift, _, future = make_assignment(pharmacy, owner, self.user, timezone.localdate() + timedelta(days=2))
        _, _, past = make_assignment(pharmacy, owner, self.user, timezone.localdate() - timedelta(days=2))
        check = check_fixture(self.profile)
        payload = result(check.pk, registration_status='Suspended')
        with patch('notifications.services.notify_users') as notify, \
                patch('shifts.cancellation.notify_shift_managers', return_value=[owner]) as managers, \
                patch('core.task_queue.async_task') as email, \
                patch('shifts.cancellation.async_task', new=email):
            with self.captureOnCommitCallbacks(execute=True):
                self.assertTrue(apply_ahpra_result(check, payload))
                self.assertFalse(apply_ahpra_result(check, payload))
                self.assertTrue(ShiftSlotAssignment.objects.filter(pk=future.pk).exists())
            self.assertFalse(ShiftSlotAssignment.objects.filter(pk=future.pk).exists())
            self.assertTrue(ShiftSlotAssignment.objects.filter(pk=past.pk).exists())
            notify.assert_called_once()
            managers.assert_called_once()
            messages = [call.kwargs for call in email.call_args_list
                        if call.args[0] == 'users.tasks.send_async_email']
            self.assertEqual(len(messages), 2)  # worker + pharmacy
            self.assertEqual(len(mail.outbox), 1)
            self.assertIn(f'User id: {self.user.pk}', mail.outbox[0].body)
            self.assertIn(f'Shift {shift.pk}', mail.outbox[0].body)
            for name in ('Jane', 'Doe'):
                self.assertNotIn(name, mail.outbox[0].body)
                self.assertNotIn(name, str(messages))
            with self.captureOnCommitCallbacks(execute=True):
                repeat = check_fixture(self.profile)
                apply_ahpra_result(repeat, result(repeat.pk, registration_status='Suspended'))
            notify.assert_called_once()
            self.assertEqual(len(mail.outbox), 1)

    def test_rollback_never_announces_suspension(self):
        with patch('onboarding.verification.state.announce_suspension') as announce, \
                patch('onboarding.verification.state.close_chat_sockets') as close:
            with self.captureOnCommitCallbacks(execute=True):
                try:
                    with transaction.atomic():
                        check = check_fixture(self.profile)
                        apply_ahpra_result(check, result(check.pk, registration_status='Suspended'))
                        raise ValueError('roll back')
                except ValueError:
                    pass
            announce.assert_not_called()
            close.assert_not_called()

    def test_chat_close_is_deferred_until_commit_and_only_on_transition(self):
        with patch('onboarding.verification.state.announce_suspension'), \
                patch('onboarding.verification.state.close_chat_sockets') as close:
            with self.captureOnCommitCallbacks(execute=True):
                check = check_fixture(self.profile)
                apply_ahpra_result(check, result(check.pk, registration_status='Suspended'))
                close.assert_not_called()
            close.assert_called_once_with(self.user.pk)
            with self.captureOnCommitCallbacks(execute=True):
                check = check_fixture(self.profile)
                apply_ahpra_result(check, result(check.pk, registration_status='Suspended'))
            close.assert_called_once_with(self.user.pk)

    def test_cancellation_includes_accepted_awaiting_payment_without_assignment(self):
        from shifts.cancellation import cancel_upcoming_assignments
        owner, pharmacy = make_owner_with_pharmacy()
        shift, slot, assignment = make_assignment(
            pharmacy, owner, self.user, timezone.localdate() + timedelta(days=2))
        assignment.delete()
        offer = ShiftOffer.objects.create(shift=shift, slot=slot, user=self.user,
                                          status=ShiftOffer.Status.ACCEPTED_AWAITING_PAYMENT)
        cancelled = cancel_upcoming_assignments(self.user)
        offer.refresh_from_db()
        self.assertEqual(offer.status, ShiftOffer.Status.DECLINED)
        self.assertEqual(cancelled, {'cancelled': [
            {'id': shift.pk, 'date': slot.date.isoformat(), 'pharmacy': pharmacy.name}], 'retained': []})
        self.assertEqual(cancel_upcoming_assignments(self.user), {'cancelled': [], 'retained': []})

    def test_retained_booking_is_reported_for_manual_action_without_manager_cancellation(self):
        from shifts.cancellation import cancel_upcoming_assignments
        from shifts.models import LeaveRequest
        owner, pharmacy = make_owner_with_pharmacy()
        shift, slot, assignment = make_assignment(
            pharmacy, owner, self.user, timezone.localdate() + timedelta(days=2))
        offer = ShiftOffer.objects.create(shift=shift, slot=slot, user=self.user, status=ShiftOffer.Status.ACCEPTED)
        assignment.source_offer = offer
        assignment.save(update_fields=['source_offer'])
        LeaveRequest.objects.create(slot_assignment=assignment, user=self.user, leave_type='SICK')
        expected = {'id': shift.pk, 'date': slot.date.isoformat(), 'pharmacy': pharmacy.name}
        with patch('shifts.cancellation.notify_shift_managers') as managers, \
                patch('core.task_queue.async_task'), patch('notifications.services.notify_users'):
            with self.captureOnCommitCallbacks(execute=True):
                report = cancel_upcoming_assignments(self.user)
            self.assertEqual(report, {'cancelled': [], 'retained': [expected]})
            check = check_fixture(self.profile)
            with self.captureOnCommitCallbacks(execute=True):
                apply_ahpra_result(check, result(check.pk, registration_status='Suspended'))
            managers.assert_not_called()
        offer.refresh_from_db()
        self.assertEqual(offer.status, ShiftOffer.Status.ACCEPTED)
        self.assertTrue(ShiftSlotAssignment.objects.filter(pk=assignment.pk).exists())
        self.assertIn('Cancelled shifts:\nNone', mail.outbox[0].body)
        self.assertIn(f'Shift {shift.pk}: {slot.date.isoformat()} - {pharmacy.name} - kept, needs manual action',
                      mail.outbox[0].body)

    def test_admin_rejection_uses_same_transition_once_and_verification_restores(self):
        check = self.finish(outcome='review', status='Registered')
        check.register_data['registration_status'] = 'Suspended'
        # Preserve the old finished result until the action applies the new data.
        check.status = 'pending'
        check.save()
        self.profile.verified = self.profile.ahpra_verified = True
        self.profile.save(update_fields=['verified', 'ahpra_verified'])
        admin = AhpraCheckAdmin(AhpraCheck, AdminSite())
        request = SimpleNamespace(user=self.user)
        with patch('onboarding.verification.state.announce_suspension') as announce:
            with self.captureOnCommitCallbacks(execute=True):
                admin.mark_rejected(request, AhpraCheck.objects.filter(pk=check.pk))
                admin.mark_rejected(request, AhpraCheck.objects.filter(pk=check.pk))
            announce.assert_called_once()
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.verified)
        restored = self.finish(outcome='review', status='Registered')
        admin.mark_verified(request, AhpraCheck.objects.filter(pk=restored.pk))
        self.profile.refresh_from_db()
        self.assertTrue(self.profile.verified)
        self.assertEqual(ahpra_state(self.profile)['state'], 'ok')

    def test_admin_verification_cannot_override_adverse_register_status(self):
        check = self.finish(outcome='rejected', status='Suspended')
        admin = AhpraCheckAdmin(AhpraCheck, AdminSite())
        admin.mark_verified(SimpleNamespace(user=self.user), AhpraCheck.objects.filter(pk=check.pk))
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.verified)
        self.assertFalse(self.profile.ahpra_verified)
        self.assertEqual(ahpra_state(self.profile)['state'], 'suspended')

    def test_employer_work_profile_sees_suspended_status(self):
        from shifts.models import ShiftInterest
        from shifts.serializers import ShiftInterestSerializer
        self.finish(outcome='rejected', status='Suspended')
        data = work_profile(self.user, build_absolute_uri=lambda path: path)
        self.assertEqual(data['ahpra_registration_status'], 'Suspended')
        self.assertEqual(data['verification']['ahpra']['registration_status'], 'Suspended')
        self.assertEqual((data['ahpra']['note'], data['ahpra']['checked_at']), ('', None))
        owner, pharmacy = make_owner_with_pharmacy()
        shift, _, _ = make_assignment(pharmacy, owner, self.user, timezone.localdate() + timedelta(days=2))
        interest = ShiftInterest.objects.create(shift=shift, user=self.user, revealed=True)
        data = ShiftInterestSerializer(interest).data
        self.assertEqual(data['user_detail']['ahpra_registration_status'], 'Suspended')
