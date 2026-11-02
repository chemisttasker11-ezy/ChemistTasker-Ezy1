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
from memberships.models import Membership
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
            self.finish(outcome='rejected', status=value)
            with self.subTest(status=value):
                self.assertEqual(ahpra_state(self.profile)['state'], 'suspended')
        self.finish(outcome='rejected', status='Not registered')
        self.assertEqual(ahpra_state(self.profile)['state'], 'not_found')
        self.profile.ahpra_number = 'PHA0007654321'
        self.profile.save(update_fields=['ahpra_number'])
        self.assertEqual(ahpra_state(self.profile)['state'], 'pending')
        self.assertIsNone(ahpra_state(self.profile)['registration_status'])

    def test_pharmacist_registration_type_messages_and_hourly_recheck(self):
        messages = {
            'Non Practising': "Your AHPRA registration type is Non Practising. Pharmacist shifts on ChemistTasker need General registration, so you can't apply for them at the moment. When your registration changes, open your AHPRA step and press Re-check. If this looks wrong, contact us.",
            'Provisional': 'Your AHPRA registration type is Provisional, which means you can only practise under supervision. Pharmacist shifts on ChemistTasker need General registration. When your registration changes to General, open your AHPRA step and press Re-check. If this looks wrong, contact us.',
        }
        from onboarding.verification.policy import refresh_verified
        from onboarding.verification.schema import AhpraStateSerializer
        from onboarding.verification.state import ahpra_frozen
        for registration_type, message in messages.items():
            with self.subTest(registration_type=registration_type):
                check = check_fixture(self.profile)
                apply_ahpra_result(check, result(check.pk, registration_type=registration_type))
                check.refresh_from_db()
                self.profile.refresh_from_db()
                self.assertEqual((check.outcome, check.note), ('type_not_accepted', message))
                self.assertFalse(self.profile.ahpra_verified)
                self.assertFalse(self.profile.verified)
                self.assertFalse(ahpra_frozen(self.user))
                # Later verification refreshes and manual approval cannot reinstate the badge.
                admin = AhpraCheckAdmin(AhpraCheck, AdminSite())
                admin.mark_verified(SimpleNamespace(user=self.user), AhpraCheck.objects.filter(pk=check.pk))
                self.profile.refresh_from_db()
                self.assertFalse(self.profile.ahpra_verified)
                self.assertFalse(refresh_verified(self.profile))
                response = self.client.get('/api/v1/pharmacist/onboarding/me/')
                self.assertEqual(response.status_code, 200, response.content)
                summary = response.json()['ahpra']
                self.assertEqual((summary['state'], summary['note'], summary['registration_type']),
                                 ('type_not_accepted', message, registration_type))
                self.assertFalse(summary['frozen'])
                serializer = AhpraStateSerializer(data=summary)
                self.assertTrue(serializer.is_valid(), serializer.errors)
        with patch('onboarding.recheck.enqueue_check') as enqueue:
            self.assertEqual(self.client.post('/api/v1/onboarding/ahpra/recheck/').status_code, 202)
            self.assertEqual(self.client.post('/api/v1/onboarding/ahpra/recheck/').status_code, 429)
            enqueue.assert_called_once()

    def test_intern_provisional_remains_verified(self):
        user = make_user('OTHER_STAFF', first_name='Jane', last_name='Doe')
        profile = OtherStaffOnboarding.objects.create(user=user, role_type='INTERN', ahpra_number=NUMBER)
        check = AhpraCheck.objects.create(model_name='OtherStaffOnboarding', object_pk=profile.pk,
                                         registration_number=NUMBER, reason='onboarding')
        apply_ahpra_result(check, result(check.pk, registration_type='Provisional'))
        check.refresh_from_db()
        profile.refresh_from_db()
        self.assertEqual(check.outcome, 'verified')
        self.assertTrue(profile.ahpra_verified)
        self.assertEqual(ahpra_state(profile)['state'], 'ok')

    def test_owner_registration_type_switches_to_manager_and_back(self):
        owner, _ = make_owner_with_pharmacy()
        profile = OwnerOnboarding.objects.get(user=owner)
        profile.role, profile.ahpra_number = 'PHARMACIST', NUMBER
        profile.save()
        with patch('onboarding.verification.state.announce_suspension') as announce, \
                patch('onboarding.verification.state.close_chat_sockets') as close:
            for registration_type, role in (('General', 'PHARMACIST'), ('Non Practising', 'MANAGER'),
                                            ('Non Practising', 'MANAGER'), ('General', 'PHARMACIST')):
                with self.subTest(registration_type=registration_type), self.captureOnCommitCallbacks(execute=True):
                    check = AhpraCheck.objects.create(model_name='OwnerOnboarding', object_pk=profile.pk,
                                                     registration_number=NUMBER, reason='recheck')
                    apply_ahpra_result(check, result(check.pk, name=f'{owner.first_name} {owner.last_name}',
                                                     registration_type=registration_type))
                    profile.refresh_from_db()
                    self.assertEqual(profile.role, role)
                    self.assertEqual(profile.ahpra_switched_to_manager, role == 'MANAGER')
                    self.assertEqual(profile.ahpra_verified, registration_type == 'General')
                    self.assertEqual(ahpra_state(profile)['state'],
                                     'ok' if registration_type == 'General' else 'type_not_accepted')
            announce.assert_called_once()
            close.assert_not_called()

    def test_registration_type_transition_cancels_public_atomically_notifies_after_commit(self):
        self.finish()
        self.profile.verified = self.profile.ahpra_verified = True
        self.profile.save(update_fields=['verified', 'ahpra_verified'])
        owner, pharmacy = make_owner_with_pharmacy()
        shift, _, public = make_assignment(pharmacy, owner, self.user, timezone.localdate() + timedelta(days=2))
        shift.post_anonymously = True
        shift.save(update_fields=['post_anonymously'])
        Membership.objects.create(user=self.user, pharmacy=pharmacy, role='PHARMACIST', employment_type='FULL_TIME',
                                  is_active=True, status=Membership.Status.ACCEPTED)
        internal_shift, _, internal = make_assignment(pharmacy, owner, self.user, timezone.localdate() + timedelta(days=2))
        internal_shift.visibility = 'FULL_PART_TIME'
        internal_shift.save(update_fields=['visibility'])
        with patch('notifications.services.notify_users') as notify, \
                patch('shifts.cancellation.notify_shift_managers', return_value=[owner]) as managers, \
                patch('users.task_dispatch.async_task') as email, patch('shifts.cancellation.async_task', new=email), \
                patch('onboarding.verification.state.close_chat_sockets') as close:
            with self.captureOnCommitCallbacks(execute=True):
                check = check_fixture(self.profile)
                payload = result(check.pk, registration_type='Non Practising')
                self.assertTrue(apply_ahpra_result(check, payload))
                self.assertFalse(apply_ahpra_result(check, payload))
                self.assertFalse(ShiftSlotAssignment.objects.filter(pk=public.pk).exists())
                notify.assert_not_called()
            self.assertFalse(ShiftSlotAssignment.objects.filter(pk=public.pk).exists())
            self.assertTrue(ShiftSlotAssignment.objects.filter(pk=internal.pk).exists())
            with self.captureOnCommitCallbacks(execute=True):
                repeat = check_fixture(self.profile)
                apply_ahpra_result(repeat, result(repeat.pk, registration_type='Non Practising'))
            notify.assert_called_once()
            self.assertEqual(notify.call_args.kwargs['payload']['code'], 'ahpra_type_not_accepted')
            managers.assert_called_once()
            self.assertIn('registration type is not accepted', managers.call_args.kwargs['body'])
            self.assertEqual(len(email.call_args_list), 2)
            self.assertEqual(len(mail.outbox), 1)
            self.assertIn('Type: Non Practising', mail.outbox[0].body)
            close.assert_not_called()

    def test_registration_type_transition_rollback_never_cancels_or_notifies(self):
        self.finish()
        with patch('onboarding.verification.state.announce_suspension') as announce:
            with self.captureOnCommitCallbacks(execute=True):
                with self.assertRaises(ValueError), transaction.atomic():
                    check = check_fixture(self.profile)
                    apply_ahpra_result(check, result(check.pk, registration_type='Non Practising'))
                    raise ValueError('roll back')
            announce.assert_not_called()

    def test_rejection_keeps_public_bookings_and_flags_them_once_after_commit(self):
        self.finish()
        owner, pharmacy = make_owner_with_pharmacy()
        shift, _, public = make_assignment(pharmacy, owner, self.user, timezone.localdate() + timedelta(days=2))
        shift.post_anonymously = True
        shift.save(update_fields=['post_anonymously'])
        Membership.objects.create(user=self.user, pharmacy=pharmacy, role='PHARMACIST', employment_type='FULL_TIME',
                                  is_active=True, status=Membership.Status.ACCEPTED)
        internal_shift, _, internal = make_assignment(pharmacy, owner, self.user, timezone.localdate() + timedelta(days=2))
        internal_shift.visibility = 'FULL_PART_TIME'
        internal_shift.save(update_fields=['visibility'])
        with patch('shifts.cancellation.notify_shift_managers', return_value=[owner]) as managers,                 patch('shifts.cancellation.async_task') as email:
            with self.captureOnCommitCallbacks(execute=True):
                check = check_fixture(self.profile)
                apply_ahpra_result(check, result(check.pk, profession='Medicine'))
                managers.assert_not_called()
                self.assertEqual(len(mail.outbox), 0)
            with self.captureOnCommitCallbacks(execute=True):
                repeat = check_fixture(self.profile)
                apply_ahpra_result(repeat, result(repeat.pk, profession='Medicine'))
        self.assertEqual(ahpra_state(self.profile)['state'], 'rejected')
        self.assertEqual(ShiftSlotAssignment.objects.filter(pk__in=[public.pk, internal.pk]).count(), 2)
        managers.assert_called_once()
        self.assertEqual(managers.call_args.args[0], shift)
        self.assertIn('needs immediate resolution', managers.call_args.kwargs['body'])
        self.assertEqual(email.call_args.kwargs['recipient_list'], [owner.email])
        self.assertEqual(len(mail.outbox), 1)
        self.assertIn(f'Shift {shift.pk}: ', mail.outbox[0].body)
        self.assertNotIn(f'Shift {internal_shift.pk}:', mail.outbox[0].body)

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
                self.assertEqual(state['state'], 'unreadable')
                self.assertIn("We couldn't read your AHPRA registration", state['note'])
                self.assertEqual(self.client.get('/api/v1/public-job-board/').status_code, 200)
                self.profile.refresh_from_db()
                self.assertFalse(self.profile.verified)
                self.assertFalse(self.profile.ahpra_verified)
                announce.assert_not_called()
                check.delete()

    def test_suspended_owner_becomes_manager_keeps_pharmacy_and_chat(self):
        owner, pharmacy = make_owner_with_pharmacy()
        Membership.objects.create(user=owner, pharmacy=pharmacy, role='PHARMACIST', employment_type='FULL_TIME')
        owner.is_otp_verified = owner.is_mobile_verified = True
        owner.save(update_fields=['is_otp_verified', 'is_mobile_verified'])
        profile = OwnerOnboarding.objects.get(user=owner)
        profile.role, profile.ahpra_number = 'PHARMACIST', NUMBER
        profile.verified = profile.ahpra_verified = True
        profile.save()
        check = AhpraCheck.objects.create(model_name='OwnerOnboarding', object_pk=profile.pk,
                                         registration_number=NUMBER, reason='onboarding')
        with patch('onboarding.verification.state.announce_suspension'), self.captureOnCommitCallbacks(execute=True):
            apply_ahpra_result(check, result(check.pk, name=f'{owner.first_name} {owner.last_name}',
                                             registration_status='Suspended'))
        profile.refresh_from_db()
        self.assertFalse(profile.verified)
        self.assertFalse(profile.ahpra_verified)
        client = client_for(owner)
        response = client.get(f'/api/v1/pharmacies/{pharmacy.pk}/')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertEqual(profile.role, 'MANAGER')
        from asgiref.sync import async_to_sync
        from chat.consumers import RoomConsumer
        from onboarding.verification.state import ahpra_frozen, require_ahpra_application
        from shifts.access import ShiftActionRefused, _user_can_perform_shift_role
        self.assertFalse(ahpra_frozen(owner))
        self.assertFalse(async_to_sync(RoomConsumer()._ahpra_suspended)(owner))
        self.assertFalse(_user_can_perform_shift_role(owner, 'PHARMACIST'))
        with self.assertRaises(ShiftActionRefused):
            require_ahpra_application(owner)
        for prefix in ('/api/v1/',):
            response = client.get(prefix + 'owner/onboarding/me/')
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['ahpra'], {**ahpra_state(profile), 'frozen': False})
        response = client.post('/api/v1/onboarding/ahpra/recheck/')
        self.assertEqual((response.status_code, response.json()), (202, {'queued': True}))
        self.assertTrue(AhpraCheck.objects.filter(model_name='OwnerOnboarding', object_pk=profile.pk,
                                                 status='pending', reason='recheck').exists())

    def test_owner_switched_by_ahpra_returns_to_pharmacist_but_chosen_manager_stays(self):
        for role in ('PHARMACIST', 'MANAGER'):
            with self.subTest(role=role), patch('onboarding.verification.state.announce_suspension'), \
                    self.captureOnCommitCallbacks(execute=True):
                owner, _ = make_owner_with_pharmacy()
                profile = OwnerOnboarding.objects.get(user=owner)
                profile.role, profile.ahpra_number = role, NUMBER
                profile.save()
                for status in ('Suspended', 'Registered'):
                    check = AhpraCheck.objects.create(model_name='OwnerOnboarding', object_pk=profile.pk,
                                                     registration_number=NUMBER, reason='recheck')
                    apply_ahpra_result(check, result(check.pk, name=f'{owner.first_name} {owner.last_name}',
                                                     registration_status=status))
                    profile.refresh_from_db()
                    self.assertEqual(profile.role, 'MANAGER' if status == 'Suspended' else role)
                self.assertEqual(ahpra_state(profile)['state'], 'ok' if role == 'PHARMACIST' else 'review')
                self.assertFalse(profile.ahpra_switched_to_manager)

    def test_pending_recheck_retains_suspension_until_review_result(self):
        self.finish(outcome='rejected', status='Suspended')
        enqueue_check(self.profile, NUMBER, 'recheck')
        self.assertEqual(ahpra_state(self.profile)['state'], 'suspended')
        AhpraCheck.objects.filter(status='pending').update(status='done', outcome='review',
                                                         completed_at=timezone.now(), register_data={
                                                             'registration_status': 'Registered', 'registration_type': 'General'})
        self.assertEqual(ahpra_state(self.profile)['state'], 'review')

    def test_unreadable_three_instant_rechecks_then_24_hour_cooldown(self):
        self.finish(outcome='review', status='Unknown')
        self.assertEqual(ahpra_state(self.profile)['attempts'], 0)
        self.assertFalse(ahpra_state(self.profile)['contact_support'])
        for attempt in range(1, 4):
            response = self.client.post('/api/v1/onboarding/ahpra/recheck/')
            self.assertEqual(response.status_code, 202, response.content)
            check = AhpraCheck.objects.get(status='pending')
            with patch('onboarding.verification.state.announce_suspension') as announce:
                with self.captureOnCommitCallbacks(execute=True):
                    apply_ahpra_result(check, result(check.pk, registration_status='Unknown'))
                announce.assert_not_called()
            state = ahpra_state(self.profile)
            self.assertEqual(state['attempts'], attempt)
            self.assertTrue(state['contact_support'])
            self.assertIn('Still not working? Contact us now.', state['note'])
        response = self.client.post('/api/v1/onboarding/ahpra/recheck/')
        self.assertEqual(response.status_code, 429)
        self.assertTrue(86390 <= response.json()['retry_after'] <= 86400)
        AhpraCheck.objects.filter(reason='recheck').update(created_at=timezone.now() - timedelta(hours=25))
        self.assertEqual(self.client.post('/api/v1/onboarding/ahpra/recheck/').status_code, 202)

    def test_owner_adverse_notifies_once_without_closing_chat(self):
        owner, _ = make_owner_with_pharmacy()
        profile = OwnerOnboarding.objects.get(user=owner)
        profile.role, profile.ahpra_number = 'PHARMACIST', NUMBER
        profile.save()
        with patch('notifications.services.notify_users') as notify, \
                patch('users.task_dispatch.async_task'), \
                patch('onboarding.verification.state.close_chat_sockets') as close:
            with self.captureOnCommitCallbacks(execute=True):
                for _ in range(2):
                    check = AhpraCheck.objects.create(model_name='OwnerOnboarding', object_pk=profile.pk,
                                                     registration_number=NUMBER, reason='onboarding')
                    apply_ahpra_result(check, result(check.pk, name=f'{owner.first_name} {owner.last_name}',
                                                     registration_status='Suspended'))
            self.assertEqual(notify.call_count, 1)
            self.assertEqual(len(mail.outbox), 1)
            close.assert_not_called()

    def test_freeze_covers_views_with_explicit_allow_any_and_permissions(self):
        self.finish(outcome='rejected', status='Suspended')
        expected = {'code': 'ahpra_suspended', 'detail': ahpra_state(self.profile)['note'], 'frozen': True}
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
        self.profile.verified = self.profile.ahpra_verified = True
        self.profile.save(update_fields=['verified', 'ahpra_verified'])
        for outcome in ('error', 'blocked'):
            check = check_fixture(self.profile)
            apply_ahpra_result(check, result(check.pk, outcome))
            self.profile.refresh_from_db()
            self.assertTrue(self.profile.verified)
            self.assertTrue(self.profile.ahpra_verified)
        check = check_fixture(self.profile)
        apply_ahpra_result(check, result(check.pk, registration_status='Registered', expiry_date='2000-01-01'))
        self.profile.refresh_from_db()
        self.assertFalse(self.profile.verified)
        self.assertFalse(self.profile.ahpra_verified)
        self.assertEqual(ahpra_state(self.profile)['state'], 'review')

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
                patch('users.task_dispatch.async_task') as email, \
                patch('shifts.cancellation.async_task', new=email):
            with self.captureOnCommitCallbacks(execute=True):
                self.assertTrue(apply_ahpra_result(check, payload))
                self.assertFalse(apply_ahpra_result(check, payload))
                self.assertFalse(ShiftSlotAssignment.objects.filter(pk=future.pk).exists())
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
                patch('users.task_dispatch.async_task'), patch('notifications.services.notify_users'):
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
